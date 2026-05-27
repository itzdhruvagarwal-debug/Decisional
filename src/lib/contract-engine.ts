/**
 * Contract Engine - Manages deal agreements, structured terms, and fee enforcement.
 * STRICT RULE-BASED LOGIC ONLY.
 */

import prisma from "./db";
import { addDays } from "date-fns";

// ==================== TYPES ====================

export interface ContractDeliverable {
  type: "POST" | "REEL" | "STORY" | "VIDEO" | "SHORT";
  count: number;
  platform: "INSTAGRAM" | "YOUTUBE";
  details: string;
}

export interface ContractTerms {
  dealId: string;
  totalAmount: number; // in paise
  platformFee: number;
  influencerPayout: number;

  // Deliverables
  deliverables: ContractDeliverable[];
  mandatoryTags: string[]; // @brand, #ad
  mandatoryElements: string[]; // Backward-compatible alias used by legacy flows

  // Timeline
  submissionDeadline: string; // ISO Date
  reviewPeriodHours: number; // Default 48h
  postingDeadline: string; // ISO Date

  // Revisions
  includedRevisions: number; // Default 2
  costPerExtraRevision: number; // Default 50000 (₹500)

  // Cancellation Policy
  cancellationFee: {
    beforeApproval: number; // 0%
    afterApproval: number; // 20%
    afterSubmission: number; // 50%
    afterPosting: number; // 100%
  };

  // Late Fees
  brandLateApprovalFee: number; // 5% flat fee if brand delays >48h

  createdAt: string;
  version: number;
}

// ==================== GENERATE CONTRACT ====================

export function generateContractTerms(
  dealId: string,
  campaign: {
    totalBudget: number;
    perInfluencerBudget?: number;
    deliverables: ContractDeliverable[] | string | unknown;
    requirements?: string;
    contentDeadline?: Date;
    postingDeadline?: Date;
    requiresProduct?: boolean;
  },
  proposal?: {
    rate?: number;
    message?: string;
  },
): ContractTerms {
  // Determine amount
  const dealAmount = proposal?.rate || campaign.perInfluencerBudget || 0;
  const platformFeePercent = Number(process.env.PLATFORM_FEE_PERCENTAGE) || 10;

  let platformFee = Math.round((dealAmount * platformFeePercent) / 100);
  if (campaign.requiresProduct) {
    platformFee += 10000; // Rs. 100 flat processing fee/shipping fee
  }

  const influencerPayout = dealAmount; // Influencer gets full deal amount; brand pays fee on top

  // Parse deliverables (assuming simple JSON or string for now)
  const deliverables: ContractDeliverable[] = [];
  if (typeof campaign.deliverables === "string") {
    // Simple string case - default to 1 generic post
    deliverables.push({
      type: "POST",
      count: 1,
      platform: "INSTAGRAM", // Default
      details: campaign.deliverables,
    });
  } else if (Array.isArray(campaign.deliverables)) {
    // Structured case
    deliverables.push(...campaign.deliverables);
  }

  return {
    dealId,
    totalAmount: dealAmount,
    platformFee,
    influencerPayout,

    deliverables,
    mandatoryTags: ["#ad", "#sponsored"], // Can extract from requirements if parsed
    mandatoryElements: ["#ad", "#sponsored"],

    submissionDeadline: campaign.contentDeadline
      ? campaign.contentDeadline.toISOString()
      : addDays(new Date(), 7).toISOString(),
    reviewPeriodHours: 48,
    postingDeadline: campaign.postingDeadline
      ? campaign.postingDeadline.toISOString()
      : addDays(new Date(), 14).toISOString(),

    includedRevisions: 2,
    costPerExtraRevision: 50000, // ₹500

    cancellationFee: {
      beforeApproval: 0,
      afterApproval: 20,
      afterSubmission: 50,
      afterPosting: 100,
    },

    brandLateApprovalFee: 5, // 5%

    createdAt: new Date().toISOString(),
    version: 1,
  };
}

// ==================== FEE CALCULATORS ====================

export async function calculateCancellation(dealId: string): Promise<{
  refundAmount: number;
  payoutAmount: number;
  platformFeeKept: number;
  reason: string;
}> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      amount: true,
      status: true,
      platformFee: true,
      contractTerms: true,
      paymentHold: { select: { amount: true } },
    },
  });

  if (!deal || !deal.paymentHold) {
    throw new Error("Deal or payment hold not found");
  }

  const totalHeld = deal.paymentHold.amount;
  const dealAmount = deal.amount;

  // Determine cancellation payout percentage based on deal status
  let payoutPercent: number;
  let reason: string;

  switch (deal.status) {
    case "PENDING_SIGNATURE":
      payoutPercent = 0;
      reason = "Cancelled before contract signed";
      break;
    case "ACTIVE":
      payoutPercent = 20;
      reason = "Cancelled after selection (20% cancellation fee)";
      break;
    case "CONTENT_SUBMITTED":
    case "REVISION_REQUESTED":
      payoutPercent = 50;
      reason = "Cancelled after content submission (50% payout)";
      break;
    case "CONTENT_APPROVED":
    case "VERIFIED":
      payoutPercent = 100;
      reason = "Cancelled after content approved (100% payout)";
      break;
    default:
      payoutPercent = 0;
      reason = "Cancellation before approval";
  }

  const payoutAmount = Math.round(dealAmount * (payoutPercent / 100));
  const refundAmount = totalHeld - payoutAmount;

  // Platform keeps 10% of payoutAmount as commission
  return {
    refundAmount,
    payoutAmount,
    platformFeeKept: Math.round(payoutAmount * 0.1),
    reason,
  };
}

export function checkRevisionLimit(
  deal: { revisionsUsed: number; maxRevisions: number },
  contract: ContractTerms,
): { allowed: boolean; cost: number; message?: string } {
  if (deal.revisionsUsed < deal.maxRevisions) {
    return { allowed: true, cost: 0 };
  }

  // Extra revision
  return {
    allowed: true, // Allowed but paid
    cost: contract.costPerExtraRevision,
    message: `Free revisions used. This revision will cost ₹${(contract.costPerExtraRevision / 100).toFixed(2)}.`,
  };
}

// ==================== DIGITAL SIGNATURES ====================

import crypto from "crypto";
import { logger } from "./logger";

export interface ContractSignature {
  userId: string;
  signedAt: string;
  signatureHash: string; // HMAC-SHA256 of contract terms
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

export interface SignedContract {
  contractTerms: ContractTerms;
  contractHash: string; // SHA-256 hash of stringified terms
  influencerSignature?: ContractSignature | undefined;
  brandSignature?: ContractSignature | undefined;
  isFullySigned: boolean;
  signedAt?: string | undefined;
}

/**
 * Generate a tamper-proof hash of contract terms.
 * Any modification to the terms will change this hash.
 */
export function deterministicJsonStringify(value: unknown): string {
  if (
    value === undefined ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    return "null";
  }

  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (Array.isArray(value)) {
    return `[${value
      .map((item) => {
        const stringified = deterministicJsonStringify(item);
        return stringified === undefined ? "null" : stringified;
      })
      .join(",")}]`;
  }

  const objectValue = value as Record<string, unknown>;
  const entries = Object.keys(objectValue)
    .sort()
    .flatMap((key) => {
      const item = objectValue[key];
      if (
        item === undefined ||
        typeof item === "function" ||
        typeof item === "symbol"
      ) {
        return [];
      }

      const stringified = deterministicJsonStringify(item);
      if (stringified === undefined) return [];

      return `${JSON.stringify(key)}:${stringified}`;
    });

  return `{${entries.join(",")}}`;
}

export function generateContractHash(terms: ContractTerms): string {
  const canonical = deterministicJsonStringify(terms);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

/**
 * Sign a contract — creates an HMAC signature using the user's ID + contract hash.
 * This proves that this specific user agreed to these specific terms.
 */
export function signContract(
  terms: ContractTerms,
  userId: string,
  ipAddress?: string,
  userAgent?: string,
): ContractSignature {
  const contractHash = generateContractHash(terms);
  const signingKey = process.env.CONTRACT_SIGNING_SECRET;

  if (!signingKey && process.env.NODE_ENV === "production") {
    throw new Error("CONTRACT_SIGNING_SECRET is required in production");
  }
  if (signingKey && signingKey.length < 32) {
    throw new Error(
      "CONTRACT_SIGNING_SECRET must be at least 32 characters long",
    );
  }

  const key = signingKey ?? "dev-only-insecure-key-REPLACE-IN-PRODUCTION-12345";
  if (!signingKey) {
    logger.warn(
      "[CONTRACT] Using insecure dev signing key. Set CONTRACT_SIGNING_SECRET in production.",
    );
  }

  const timestamp = new Date().toISOString();
  const payload = `${userId}:${contractHash}:${timestamp}`;
  const signatureHash = crypto
    .createHmac("sha256", key)
    .update(payload)
    .digest("hex");

  return {
    userId,
    signedAt: timestamp,
    signatureHash,
    ipAddress,
    userAgent,
  };
}

/**
 * Verify a contract signature is valid and terms haven't been tampered with.
 */
export function verifyContractSignature(
  terms: ContractTerms,
  signature: ContractSignature,
): boolean {
  const contractHash = generateContractHash(terms);
  const signingKey = process.env.CONTRACT_SIGNING_SECRET;

  if (!signingKey && process.env.NODE_ENV === "production") {
    throw new Error("CONTRACT_SIGNING_SECRET is required in production");
  }

  const key = signingKey ?? "dev-only-insecure-key-REPLACE-IN-PRODUCTION-12345";
  const payload = `${signature.userId}:${contractHash}:${signature.signedAt}`;
  const expectedHash = crypto
    .createHmac("sha256", key)
    .update(payload)
    .digest("hex");

  // Use timingSafeEqual to prevent timing attacks
  const expectedBuffer = Buffer.from(expectedHash, "utf8");
  const actualBuffer = Buffer.from(signature.signatureHash, "utf8");
  if (expectedBuffer.length !== actualBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

/**
 * Sign and save contract to the deal record.
 * Returns the updated signed contract state.
 */
export async function signAndSaveDealContract(
  dealId: string,
  userId: string,
  role: "INFLUENCER" | "BRAND",
  ipAddress?: string,
  userAgent?: string,
): Promise<{ success: boolean; signed: SignedContract; message: string }> {
  const result = await prisma.$transaction(async (tx: any) => {
    // LOCK: Acquire row lock to prevent lost updates during concurrent signing
    await tx.deal.update({
      where: { id: dealId },
      data: { updatedAt: new Date() }, // Update timestamp to lock row
    });

    const deal = await tx.deal.findUnique({
      where: { id: dealId },
      select: {
        id: true,
        status: true,
        contractTerms: true,
        contractSignature: true,
        influencer: { select: { userId: true } },
        brand: { select: { userId: true } },
      },
    });

    if (!deal) throw new Error("Deal not found");
    if (!deal.contractTerms) throw new Error("No contract terms to sign");
    if (deal.status !== "PENDING_SIGNATURE") {
      throw new Error("Deal is not pending signature");
    }

    // Safe cast as we enforce schema structure elsewhere
    const terms = deal.contractTerms as unknown as ContractTerms;

    // Verify the user has the right to sign
    const isInfluencer = userId === deal.influencer.userId;
    const isBrand = userId === deal.brand?.userId;

    if (role === "INFLUENCER" && !isInfluencer)
      throw new Error("User is not the influencer on this deal");
    if (role === "BRAND" && !isBrand)
      throw new Error("User is not the brand on this deal");

    // Generate signature
    const signature = signContract(terms, userId, ipAddress, userAgent);
    const contractHash = generateContractHash(terms);

    // Get existing signatures
    const existingSigs =
      (deal.contractSignature
        ? (deal.contractSignature as unknown as SignedContract)
        : null) ||
      ({
        contractTerms: terms,
        contractHash,
        influencerSignature: undefined,
        brandSignature: undefined,
        isFullySigned: false,
        signedAt: undefined,
      } as SignedContract);

    if (role === "INFLUENCER" && existingSigs.influencerSignature) {
      throw new Error("Influencer has already signed this contract");
    }
    if (role === "BRAND" && existingSigs.brandSignature) {
      throw new Error("Brand has already signed this contract");
    }

    // Update with new signature
    const updated: SignedContract = {
      contractTerms: terms,
      contractHash,
      influencerSignature:
        role === "INFLUENCER" ? signature : existingSigs.influencerSignature,
      brandSignature:
        role === "BRAND" ? signature : existingSigs.brandSignature,
      isFullySigned: false,
      signedAt: undefined,
    };

    // Check if both parties have signed
    if (updated.influencerSignature && updated.brandSignature) {
      updated.isFullySigned = true;
      updated.signedAt = new Date().toISOString();
    }

    // Save to deal
    const signedAt = new Date(signature.signedAt);
    await tx.deal.update({
      where: { id: dealId },
      data: {
        contractSignature: JSON.parse(JSON.stringify(updated)),
        ...(role === "BRAND"
          ? { brandSignedAt: signedAt }
          : { influencerSignedAt: signedAt }),
        // If fully signed, move deal from PENDING_SIGNATURE to ACTIVE
        ...(updated.isFullySigned && deal.status === "PENDING_SIGNATURE"
          ? { status: "ACTIVE" }
          : {}),
      },
    });

    // Log the signature event
    await tx.activityLog.create({
      data: {
        userId,
        action: "CONTRACT_SIGNED",
        metadata: {
          dealId,
          role,
          contractHash,
          isFullySigned: updated.isFullySigned,
          signedAt: signature.signedAt,
          ipAddress,
        },
      },
    });

    return updated;
  });

  logger.info("Contract signed", {
    dealId,
    userId,
    role,
    isFullySigned: result.isFullySigned,
  });

  return {
    success: true,
    signed: result,
    message: result.isFullySigned
      ? "Contract fully signed by both parties. Deal is now active!"
      : `Contract signed by ${role.toLowerCase()}. Waiting for counterparty signature.`,
  };
}

// ==================== PAYMENT RETRY LOGIC ====================

export interface PaymentRetryResult {
  success: boolean;
  attempt: number;
  paymentId?: string;
  error?: string;
  nextRetryAt?: string;
}

/**
 * Retry a failed payment capture with exponential backoff.
 * Max 3 retries: 1min, 5min, 30min delays.
 */
export async function retryPaymentCapture(
  dealId: string,
  paymentId: string,
  currentAttempt: number = 1,
  maxAttempts: number = 3,
): Promise<PaymentRetryResult> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      paymentHold: true,
      influencer: { select: { userId: true } },
      brand: { select: { id: true, userId: true } },
    },
  });

  if (!deal) {
    logger.error("Deal not found during payment retry", { dealId, paymentId });
    return { success: false, attempt: currentAttempt, error: "Deal not found" };
  }

  const hold = deal.paymentHold;
  const actorUserId = deal.influencer.userId || deal.brand?.userId;

  if (currentAttempt > maxAttempts) {
    // All retries exhausted — escalate to manual review
    await prisma.$transaction(async (tx: any) => {
      await tx.deal.update({
        where: { id: dealId },
        data: { status: "DISPUTED" },
      });

      if (hold) {
        await tx.paymentHold.update({
          where: { id: hold.id },
          data: { status: "FAILED" },
        });
      }

      await tx.activityLog.create({
        data: {
          userId: actorUserId,
          action: "PAYMENT_CAPTURE_ESCALATED",
          entityType: "PaymentHold",
          entityId: hold?.id ?? dealId,
          metadata: {
            dealId,
            paymentId,
            attempts: currentAttempt - 1,
          },
        },
      });
    });

    // Notify admin
    logger.error("Payment capture failed after max retries", null, {
      dealId,
      paymentId,
      attempts: currentAttempt - 1,
    });

    return {
      success: false,
      attempt: currentAttempt - 1,
      error: `Payment capture failed after ${maxAttempts} attempts. Escalated to manual review.`,
    };
  }

  if (!hold || hold.status !== "HELD" || !hold.razorpayPaymentId) {
    return {
      success: false,
      attempt: currentAttempt,
      error: "Payment hold is not eligible for retry",
    };
  }

  if (hold.razorpayPaymentId !== paymentId) {
    logger.warn("Payment retry id mismatch blocked", {
      dealId,
      paymentId,
      expectedPaymentId: hold.razorpayPaymentId,
    });
    return {
      success: false,
      attempt: currentAttempt,
      error: "Payment id mismatch",
    };
  }

  try {
    // Import Razorpay lazily to avoid circular deps
    const { capturePayment } = await import("./razorpay");

    const result = await capturePayment({
      paymentId,
      amount: hold.amount,
    });

    await prisma.$transaction(async (tx: any) => {
      const holdUpdate = await tx.paymentHold.updateMany({
        where: { id: hold.id, status: "HELD" },
        data: { status: "CAPTURED", capturedAt: new Date() },
      });

      if (holdUpdate.count === 0) return;

      const dealUpdate = await tx.deal.updateMany({
        where: { id: deal.id, status: { not: "COMPLETED" } },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      if (dealUpdate.count === 0) return;

      if (deal.brand?.userId) {
        const brandWallet = await tx.wallet.findUnique({
          where: { userId: deal.brand.userId },
          select: { id: true, pendingBalance: true },
        });

        if (brandWallet) {
          const pendingRelease = Math.min(brandWallet.pendingBalance, deal.amount);
          await tx.wallet.update({
            where: { id: brandWallet.id },
            data: {
              ...(pendingRelease > 0
                ? { pendingBalance: { decrement: pendingRelease } }
                : {}),
              totalSpent: { increment: deal.amount },
            },
          });
        }
      }

      if (deal.brand?.id) {
        await tx.brandProfile.update({
          where: { id: deal.brand.id },
          data: { totalSpent: { increment: deal.amount } },
        });
      }

      const wallet = await tx.wallet.upsert({
        where: { userId: deal.influencer.userId },
        create: {
          userId: deal.influencer.userId,
          balance: deal.amount,
          totalEarned: deal.amount,
        },
        update: {
          balance: { increment: deal.amount },
          totalEarned: { increment: deal.amount },
        },
      });

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          dealId: deal.id,
          type: "CREDIT",
          amount: deal.amount,
          status: "COMPLETED",
          description: `Payout for deal retry: ${deal.id}`,
        },
      });
    });

    logger.info("Payment capture succeeded on retry", {
      dealId,
      paymentId,
      attempt: currentAttempt,
    });

    return {
      success: true,
      attempt: currentAttempt,
      paymentId: result?.paymentId || paymentId,
    };
  } catch (error) {
    const retryDelays = [60, 300, 1800]; // 1min, 5min, 30min
    const delaySeconds = retryDelays[currentAttempt - 1] || 1800;
    const nextRetryAt = new Date(
      Date.now() + delaySeconds * 1000,
    ).toISOString();

    logger.warn("Payment capture failed, scheduling retry", {
      dealId,
      paymentId,
      attempt: currentAttempt,
      nextRetryAt,
      error: String(error),
    });

    // Record the retry attempt
    await prisma.activityLog.create({
      data: {
        userId: actorUserId,
        action: "PAYMENT_RETRY",
        entityType: "PaymentHold",
        entityId: hold.id,
        metadata: {
          dealId,
          paymentId,
          attempt: currentAttempt,
          error: String(error),
          nextRetryAt,
        },
      },
    });

    return {
      success: false,
      attempt: currentAttempt,
      error: `Attempt ${currentAttempt} failed. Next retry at ${nextRetryAt}.`,
      nextRetryAt,
    };
  }
}
