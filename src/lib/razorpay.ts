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
    throw new Error(
      "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET environment variables are required",
    );
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

// Types
export interface PreAuthOrderParams {
  dealId: string;
  amount: number; // In paise
  currency?: string;
  notes?: Record<string, string>;
}

export interface CaptureParams {
  paymentId: string;
  amount: number; // In paise
}

export interface PayoutParams {
  accountNumber: string;
  ifscCode: string;
  beneficiaryName: string;
  amount: number; // In paise
  purpose?: string;
  referenceId: string;
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
  const influencerReceives = dealAmount; // Influencer gets full deal amount

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
  const order = await withCircuitBreaker<any>("razorpay:createOrder", async () => {
    return getRazorpay().orders.create({
      amount: params.amount,
      currency: params.currency || "INR",
      receipt: params.receipt,
      notes: params.notes,
    } as any);
  });

  return {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    receipt: order.receipt,
    status: order.status,
  };
}

/**
 * Create a pre-authorization order
 * Money is held but not charged until capture
 */
export async function createPreAuthOrder(params: PreAuthOrderParams) {
  const order = await withCircuitBreaker<any>("razorpay:createPreAuthOrder", async () => {
    return getRazorpay().orders.create({
      amount: params.amount,
      currency: params.currency || "INR",
      receipt: `deal_${params.dealId}`,
      notes: {
        deal_id: params.dealId,
        type: "pre_auth",
        ...params.notes,
      },
      // Pre-authorization specific
      payment_capture: false, // Don't auto-capture
    });
  });

  return {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    receipt: order.receipt,
    status: order.status,
  };
}

/**
 * Capture a pre-authorized payment
 * Called when deal is verified and complete
 */
export async function capturePayment(params: CaptureParams) {
  const payment = await withCircuitBreaker("razorpay:capturePayment", async () => {
    return getRazorpay().payments.capture(
      params.paymentId,
      params.amount,
      "INR",
    );
  });

  return {
    paymentId: payment.id,
    amount: payment.amount,
    status: payment.status,
    method: payment.method,
    capturedAt: new Date(),
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
    throw new Error("RAZORPAY_ACCOUNT_NUMBER is required for RazorpayX payouts");
  }

  const authHeader = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  // Cache keys based on stable bank details to avoid duplicate Razorpay entities
  const contactCacheKey = `rzp:contact:${crypto.createHash("sha256").update(`${params.beneficiaryName}:${params.accountNumber}:${params.ifscCode}`).digest("hex")}`;
  const fundCacheKey = `rzp:fund:${crypto.createHash("sha256").update(`${params.accountNumber}:${params.ifscCode}`).digest("hex")}`;

  let contactId: string | null = null;
  let fundAccountId: string | null = null;

  // Step 1: Resolve or create Contact
  try {
    contactId = await redis.get(contactCacheKey);
  } catch { /* Redis miss is non-fatal */ }

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
        reference_id: params.referenceId,
      }),
    });
    const contact = await contactRes.json();

    if (contact.error || !contact.id) {
      throw new Error(
        contact.error?.description || "Failed to create Razorpay contact",
      );
    }
    contactId = contact.id;
    try { await redis.set(contactCacheKey, contactId!, "EX", 86400 * 30); } catch { /* non-fatal */ }
  }

  // Step 2: Resolve or create Fund Account
  try {
    fundAccountId = await redis.get(fundCacheKey);
  } catch { /* Redis miss is non-fatal */ }

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
          account_type: "bank_account",
          bank_account: {
            name: params.beneficiaryName,
            ifsc: params.ifscCode,
            account_number: params.accountNumber,
          },
        }),
      },
    );
    const fundAccount = await fundAccountRes.json();

    if (fundAccount.error || !fundAccount.id) {
      throw new Error(
        fundAccount.error?.description ||
        "Failed to create Razorpay fund account",
      );
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
        mode: "IMPS",
        purpose: params.purpose || "payout",
        queue_if_low_balance: true,
        reference_id: params.referenceId,
      }),
    });
  });
  const payout = await payoutRes.json();

  if (payout.error) {
    throw new Error(payout.error.description || "Payout creation failed");
  }

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
export function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string = process.env.RAZORPAY_WEBHOOK_SECRET!,
): boolean {
  if (!secret || !signature) return false;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

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

/**
 * Cancel a pre-auth hold (release funds)
 * In Razorpay, to release a pre-auth hold you issue a full refund on the authorized payment.
 * If not captured within 5 days, the hold expires automatically.
 */
export async function releasePreAuth(orderId: string) {
  try {
    const order = await getRazorpay().orders.fetch(orderId);
    const payments = await getRazorpay().orders.fetchPayments(orderId);

    // Find the authorized payment and refund it to release the hold
    const authorizedPayment = (
      payments as { items?: Array<{ id: string; status: string }> }
    )?.items?.find((p: { status: string }) => p.status === "authorized");

    if (authorizedPayment) {
      await getRazorpay().payments.refund(authorizedPayment.id, {
        speed: "normal",
      });
      return { status: "released", orderId, paymentId: authorizedPayment.id };
    }

    // No authorized payment found — hold may have already expired
    return { status: "no_hold_found", orderId, orderStatus: order.status };
  } catch (error) {
    logger.error("Error releasing pre-auth", error, { orderId });
    throw error;
  }
}

/**
 * Payment status check with retry logic
 */
export async function checkPaymentStatus(paymentId: string, maxRetries = 3) {
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const payment = await getPayment(paymentId);
      return payment;
    } catch (error) {
      retries++;
      if (retries >= maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * retries));
    }
  }

  throw new Error("Failed to check payment status after retries");
}

export default getRazorpay;
