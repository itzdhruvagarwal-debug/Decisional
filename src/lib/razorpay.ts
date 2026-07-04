import { AppError } from "@/lib/errors";
/**
 * Razorpay SDK Wrapper
 * Handles all Razorpay payment operations
 */

import Razorpay from "razorpay";
import crypto from "crypto";
import { logger } from "./logger";
import { withCircuitBreaker } from "./circuit-breaker";
import { redis } from "./redis";

// Lazy-initialize Razorpay instance (fails at call-time, not import-time)
let _razorpay: Razorpay | null = null;

function getRazorpayCredentials(): { keyId: string; keySecret: string } {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw AppError.badRequest("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET environment variables are required",);
  }

  return { keyId, keySecret };
}

function getRazorpay(): Razorpay {
  if (!_razorpay) {
    const { keyId, keySecret } = getRazorpayCredentials();
    _razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }
  return _razorpay;
}


export interface PayoutParams {
  accountNumber: string;
  ifscCode: string;
  beneficiaryName: string;
  amount: number; // In paise
  purpose?: string;
  referenceId: string;
  userId?: string;
  upiId?: string;
}

export interface RefundParams {
  paymentId: string;
  amount: number; // In paise
  speed?: "normal" | "optimum";
  notes?: Record<string, string>;
}

/**
 * Calculate total amount with fees.
 * @param dealAmount - Deal amount in paise
 * @param customPlatformFeePercent - Optional override for the platform fee %.
 *   When provided (e.g. from level-based or referral-based discounts),
 *   this value is used instead of the PLATFORM_FEE_PERCENTAGE env var.
 */
export function calculateTotalAmount(
  dealAmount: number,
  customPlatformFeePercent?: number,
  productHandlingFee = 0,
): {
  dealAmount: number;
  platformFee: number;
  gatewayFee: number;
  totalAmount: number;
  influencerReceives: number;
  platformFeePercent: number;
} {
  const platformFeePercent =
    customPlatformFeePercent ?? (Number(process.env.PLATFORM_FEE_PERCENTAGE) || 10);
  const gatewayFeePercent = Number(process.env.GATEWAY_FEE_PERCENTAGE) || 2;

  const safeProductHandlingFee = Math.max(0, Math.round(productHandlingFee || 0));
  const platformFee =
    Math.round((dealAmount * platformFeePercent) / 100) +
    safeProductHandlingFee;
  const gatewayFee = Math.round(
    ((dealAmount + platformFee) * gatewayFeePercent) / 100,
  );
  const totalAmount = dealAmount + platformFee + gatewayFee;
  // Business Reasoning:
  // The influencer is guaranteed to receive 100% of the rate they applied for or negotiated.
  // Any platform fees (including discounts, level benefits) and gateway transactional fees
  // are borne by the brand on top of the deal amount. This provides full payout predictability
  // for the creator. Future fee structure updates (e.g. splitting fees) should maintain
  // this separation or adjust both sides transparently.
  const influencerReceives = dealAmount;

  return {
    dealAmount,
    platformFee,
    gatewayFee,
    totalAmount,
    influencerReceives,
    platformFeePercent,
  };
}

/**
 * Create a standard order (for adding funds)
 */
export async function createOrder(params: {
  amount: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}) {
  // notes: Razorpay SDK accepts IMap<string | number>, our params use Record<string, string>
  // We spread into a compatible object explicitly to avoid the need for `as any`
  const orderPayload = {
    amount: params.amount,
    currency: params.currency ?? "INR",
    receipt: params.receipt,
    ...(params.notes
      ? { notes: params.notes as Record<string, string | number> }
      : {}),
  };
  const order = await withCircuitBreaker<{ id: string; amount: string | number; currency: string; receipt?: string; status: string }>("razorpay:createOrder", async () => {
    return getRazorpay().orders.create(orderPayload);
  });

  return {
    orderId: order.id,
    amount: typeof order.amount === "string" ? Number.parseInt(order.amount, 10) : order.amount,
    currency: order.currency,
    receipt: order.receipt,
    status: order.status,
  };
}


/**
 * Refund a payment (full or partial)
 */
export async function refundPayment(params: RefundParams) {
  const refund = await withCircuitBreaker("razorpay:refundPayment", async () => {
    return getRazorpay().payments.refund(params.paymentId, {
      amount: params.amount,
      speed: params.speed || "normal",
      notes: params.notes,
    });
  });

  return {
    refundId: refund.id,
    paymentId: refund.payment_id,
    amount: refund.amount,
    status: refund.status,
  };
}

/**
 * Create a payout to influencer's bank account
 * Uses RazorpayX API directly for payouts.
 * Caches Contact and Fund Account IDs in Redis to avoid duplicate creation.
 */
export async function createPayout(params: PayoutParams) {
  const { keyId, keySecret } = getRazorpayCredentials();
  const accountNumber = process.env.RAZORPAY_ACCOUNT_NUMBER;

  if (!accountNumber) {
    throw AppError.badRequest("RAZORPAY_ACCOUNT_NUMBER is required for RazorpayX payouts");
  }

  const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const isUpiPayout = params.accountNumber === "UPI_PAYOUT" && params.ifscCode === "UPI00000000";
  // Cache keys based on stable bank details to avoid duplicate Razorpay entities
  const contactCacheKey = `rzp:contact:${crypto.createHash("sha256").update(`${params.beneficiaryName}:${params.accountNumber}:${params.ifscCode}:${params.upiId || ""}`).digest("hex")}`;
  const fundCacheKey = isUpiPayout
    ? `rzp:fund:upi:${crypto.createHash("sha256").update(params.upiId || "").digest("hex")}`
    : `rzp:fund:${crypto.createHash("sha256").update(`${params.accountNumber}:${params.ifscCode}`).digest("hex")}`;

  let contactId: string | null = null;
  let fundAccountId: string | null = null;

  // Step 1: Resolve or create Contact
  try {
    contactId = await redis.get(contactCacheKey);
  } catch { /* Redis miss is non-fatal */ }

  // Fallback: If Redis is flushed, query Razorpay to see if contact already exists for the user
  if (!contactId) {
    try {
      const refId = params.userId || params.referenceId;
      if (refId) {
        const searchRes = await fetch(`https://api.razorpay.com/v1/contacts?reference_id=${encodeURIComponent(refId)}`, {
          method: "GET",
          headers: {
            Authorization: `Basic ${authHeader}`,
          },
        });
        if (searchRes.ok) {
          const list = await searchRes.json();
          const items = list?.items;
          if (Array.isArray(items) && items.length > 0) {
            // Find active contact matching beneficiary name
            const existingContact = items.find((c: { name?: string; active?: boolean; id?: string }) => c.name?.toLowerCase() === params.beneficiaryName.toLowerCase() && c.active);
            if (existingContact?.id) {
              contactId = existingContact.id;
              try { await redis.set(contactCacheKey, contactId!, "EX", 86400 * 30); } catch { /* non-fatal */ }
            }
          }
        }
      }
    } catch (err) {
      logger.warn("Razorpay contact lookup query failed, fallback to creation", { error: String(err) });
    }
  }

  if (!contactId) {
    const contactRes = await fetch("https://api.razorpay.com/v1/contacts", {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: params.beneficiaryName,
        type: "vendor",
        reference_id: params.userId || params.referenceId,
      }),
    });
    const contact = await contactRes.json();

    if (contact.error || !contact.id) {
      throw AppError.badRequest(contact.error?.description || "Failed to create Razorpay contact",);
    }
    contactId = contact.id;
    try { await redis.set(contactCacheKey, contactId!, "EX", 86400 * 30); } catch { /* non-fatal */ }
  }

  // Step 2: Resolve or create Fund Account
  try {
    fundAccountId = await redis.get(fundCacheKey);
  } catch { /* Redis miss is non-fatal */ }

  // Fallback: If Redis is flushed, query Razorpay to see if fund account already exists for this contact
  if (!fundAccountId && contactId) {
    try {
      const searchRes = await fetch(`https://api.razorpay.com/v1/fund_accounts?contact_id=${encodeURIComponent(contactId)}`, {
        method: "GET",
        headers: {
          Authorization: `Basic ${authHeader}`,
        },
      });
      if (searchRes.ok) {
        const list = await searchRes.json();
        const items = list?.items;
        if (Array.isArray(items) && items.length > 0) {
          // Find active account matching bank account number or UPI ID
          const existingFund = items.find((f: { account_type?: string; vpa?: { address?: string }; active?: boolean; bank_account?: { account_number?: string }; id?: string }) =>
            isUpiPayout
              ? f.account_type === "vpa" && f.vpa?.address === params.upiId && f.active
              : f.account_type === "bank_account" && f.bank_account?.account_number === params.accountNumber && f.active
          );
          if (existingFund?.id) {
            fundAccountId = existingFund.id;
            try { await redis.set(fundCacheKey, fundAccountId!, "EX", 86400 * 30); } catch { /* non-fatal */ }
          }
        }
      }
    } catch (err) {
      logger.warn("Razorpay fund account lookup query failed, fallback to creation", { error: String(err) });
    }
  }

  if (!fundAccountId) {
    const fundAccountRes = await fetch(
      "https://api.razorpay.com/v1/fund_accounts",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${authHeader}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contact_id: contactId,
          account_type: isUpiPayout ? "vpa" : "bank_account",
          ...(isUpiPayout
            ? {
                vpa: {
                  address: params.upiId,
                },
              }
            : {
                bank_account: {
                  name: params.beneficiaryName,
                  ifsc: params.ifscCode,
                  account_number: params.accountNumber,
                },
              }),
        }),
      },
    );
    const fundAccount = await fundAccountRes.json();

    if (fundAccount.error || !fundAccount.id) {
      throw AppError.badRequest(fundAccount.error?.description ||
        "Failed to create Razorpay fund account",);
    }
    fundAccountId = fundAccount.id;
    try { await redis.set(fundCacheKey, fundAccountId!, "EX", 86400 * 30); } catch { /* non-fatal */ }
  }

  // Step 3: Create payout (always new — idempotency via X-Payout-Idempotency header)
  const payoutRes = await withCircuitBreaker("razorpay:createPayout", async () => {
    return fetch("https://api.razorpay.com/v1/payouts", {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/json",
        "X-Payout-Idempotency": params.referenceId,
      },
      body: JSON.stringify({
        account_number: accountNumber,
        fund_account_id: fundAccountId,
        amount: params.amount,
        currency: "INR",
        mode: isUpiPayout ? "UPI" : "IMPS",
        purpose: params.purpose || "payout",
        queue_if_low_balance: true,
        reference_id: params.referenceId,
      }),
    });
  });
  const payout = await payoutRes.json();

  if (payout.error) {
    throw AppError.badRequest(payout.error.description || "Payout creation failed");
  }

  return {
    payoutId: payout.id,
    amount: payout.amount,
    status: payout.status,
    utr: payout.utr,
  };
}

export async function getPayout(payoutId: string) {
  const { keyId, keySecret } = getRazorpayCredentials();
  const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const res = await fetch(`https://api.razorpay.com/v1/payouts/${encodeURIComponent(payoutId)}`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${authHeader}`,
    },
  });

  if (!res.ok) {
    throw AppError.badRequest(`Failed to fetch payout status: ${res.statusText}`);
  }

  const payout = await res.json();
  return {
    payoutId: payout.id,
    amount: payout.amount,
    status: payout.status,
    utr: payout.utr,
  };
}

import { isWebhookProcessed } from "./idempotency";

/**
 * Verify Razorpay webhook signature
 */
function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string = process.env.RAZORPAY_WEBHOOK_SECRET!,
): boolean {
  if (!secret || !signature) return false;
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  const sigBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (sigBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

/**
 * Securely process a webhook event with signature verification and replay protection.
 */
export async function processSecureWebhook(
  rawBody: string,
  signature: string,
  eventId: string,
  eventType: string
): Promise<{ isValid: boolean; isDuplicate: boolean; eventKey: string }> {
  // 1. Verify Signature
  const isValid = verifyWebhookSignature(rawBody, signature);
  if (!isValid) {
    logger.warn("[ Razorpay Webhook] Invalid signature detected", { eventId, eventType });
    return { isValid: false, isDuplicate: false, eventKey: "" };
  }

  // Razorpay doesn't guarantee every payload has a stable entity id for idempotency.
  // Prefer explicit event id and fallback to a deterministic hash of event + payload.
  const eventKey =
    eventId?.trim() ||
    crypto
      .createHash("sha256")
      .update(`${eventType}:${rawBody}`)
      .digest("hex");

  // 2. Check for Replay Attack / Duplicates
  const isDuplicate = await isWebhookProcessed(eventKey);
  if (isDuplicate) {
    logger.info("[ Razorpay Webhook] Duplicate event ignored", {
      eventId,
      eventKey,
      eventType,
    });
    return { isValid: true, isDuplicate: true, eventKey };
  }

  return { isValid: true, isDuplicate: false, eventKey };
}


/**
 * Verify payment signature (for frontend callback)
 */
export function verifyPaymentSignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const text = `${params.orderId}|${params.paymentId}`;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(text)
    .digest("hex");

  const sigBuffer = Buffer.from(params.signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  // timingSafeEqual throws if lengths differ — check first
  if (sigBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

/**
 * Get payment details
 */
export async function getPayment(paymentId: string) {
  return await getRazorpay().payments.fetch(paymentId);
}

/**
 * Get order details
 */
export async function getOrder(orderId: string) {
  return await getRazorpay().orders.fetch(orderId);
}


export default getRazorpay;
