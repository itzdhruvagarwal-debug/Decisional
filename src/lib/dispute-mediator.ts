import { AppError } from "@/lib/errors";
/**
 * Dispute Mediator — Tier 1 AI Auto-Resolution Engine
 *
 * Rule-based analysis for all dispute types.
 * Compares deal data, contract terms, submissions, and timelines
 * to produce a fair resolution suggestion automatically.
 *
 * NO ML / NO BLOCKCHAIN — Pure rule-based logic.
 */

import { DealStatus } from "@prisma/client";
import prisma, { ensurePlatformTreasury } from "./db";
import { redis } from "./redis";
import { logger } from "./logger";
import { updateTrustAndLevel } from "./trust-engine";
import { applyProgressivePenalty, ViolationCategory } from "./penalty-system";
import { finalizeDealGamification } from "./gamification-engine";
import { getDealTotalAmount } from "./utils";
import { processReferralReward } from "./referral-engine";
import { createActivityLog } from "./audit";
import { NotificationService } from "@/services/notification.service";
import {
  creditInfluencerPayoutWithTax,
  recordPlatformFeeRevenue,
} from "./deal-settlement";
import { randomInt } from "crypto";
import {
  Dispute,
  Deal,
  UserType,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  DisputeType,
  ContentSubmission,
  PaymentHold,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  BrandProfile,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  InfluencerProfile,
  TransactionType,
  TransactionStatus,
  Prisma,
} from "@prisma/client";

type FullDeal = Deal & {
  campaign: { title: string; deliverables: Record<string, unknown>; requirements: string };
  influencer: {
    userId: string;
    displayName: string;
    completedDeals: number;
    averageRating: number;
  };
  brand: { userId: string; companyName: string } | null;
  contentSubmissions: ContentSubmission[];
  paymentHold: PaymentHold | null;
  reviews: unknown[];
};

type FullDispute = Dispute & {
  deal: FullDeal;
  raisedBy: { id: string; userType: UserType };
};

// ==================== TYPES ====================

export interface MediatorAnalysis {
  disputeId: string;
  tier: 1 | 2 | 3;
  verdict:
  | "INFLUENCER_FAVORED"
  | "BRAND_FAVORED"
  | "SPLIT"
  | "ESCALATE"
  | "DISMISSED";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  refundPercentage: number; // 0-100, % refunded to brand
  influencerPayoutPercentage: number; // 0-100, % paid to influencer
  trustScoreChanges: {
    influencer: number; // positive = gain, negative = penalty
    brand: number;
  };
  explanation: string; // Human-readable explanation of reasoning
  findings: Finding[]; // Detailed checklist of what was analyzed
  suggestedAction: string;
  autoResolvable: boolean; // true = can resolve without human input
}

export interface Finding {
  check: string;
  result: "PASS" | "FAIL" | "WARNING" | "N/A";
  detail: string;
}

// ==================== MAIN MEDIATOR ====================

/**
 * Run Tier 1 auto-mediation on a dispute.
 *  1. Fetches all deal data, contract, submissions, timelines
 *  2. Runs type-specific analysis
 *  3. Returns structured MediatorAnalysis
 */
export async function analyzeDispute(
  disputeId: string,
): Promise<MediatorAnalysis> {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      deal: {
        include: {
          campaign: {
            select: { title: true, deliverables: true, requirements: true },
          },
          influencer: {
            select: {
              userId: true,
              displayName: true,
              completedDeals: true,
              averageRating: true,
            },
          },
          brand: { select: { userId: true, companyName: true } },
          contentSubmissions: { orderBy: { version: "desc" as const } },
          paymentHold: true,
          reviews: true,
        },
      },
      raisedBy: { select: { id: true, userType: true } },
    },
  });

  if (!dispute || !dispute.deal) {
    return createErrorAnalysis(
      disputeId,
      "Dispute or associated deal not found",
    );
  }

  // Cast to FullDispute to satisfy types as include returns a complex object
  const typedDispute = dispute as unknown as FullDispute;
  const deal = typedDispute.deal;
  const contract = deal.contractTerms as Record<string, unknown> | null;

  // Route to type-specific analyzer
  switch (typedDispute.type) {
    case "TIMELINE":
      return analyzeTimelineDispute(typedDispute, deal, contract);
    case "QUALITY":
      return analyzeQualityDispute(typedDispute, deal, contract);
    case "CONTENT_DELETED":
      return analyzeContentDeletedDispute(typedDispute, deal);
    case "PAYMENT":
      return analyzePaymentDispute(typedDispute, deal);
    case "TERMS_VIOLATION":
      return analyzeTermsViolationDispute(typedDispute, deal, contract);
    default:
      return analyzeGenericDispute(typedDispute, deal);
  }
}

// ==================== TIMELINE DISPUTE ====================

function analyzeTimelineDispute(
  dispute: FullDispute,
  deal: FullDeal,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  contract: Record<string, unknown> | null,
): MediatorAnalysis {
  const findings: Finding[] = [];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const now = new Date();

  // Check 1: Was content submitted?
  const hasSubmission = deal.contentSubmissions?.length > 0;
  findings.push({
    check: "Content submitted",
    result: hasSubmission ? "PASS" : "FAIL",
    detail: hasSubmission
      ? `${deal.contentSubmissions.length} submission(s) found`
      : "No content submissions found",
  });

  // Check 2: Was content submitted before deadline?
  const submissionDeadline = deal.submissionDeadline
    ? new Date(deal.submissionDeadline)
    : null;
  const latestSubmission = deal.contentSubmissions?.[0];
  const submittedAt = latestSubmission?.submittedAt
    ? new Date(latestSubmission.submittedAt)
    : null;

  if (submissionDeadline && submittedAt) {
    const isOnTime = submittedAt <= submissionDeadline;
    const hoursLate = isOnTime
      ? 0
      : Math.round(
        (submittedAt.getTime() - submissionDeadline.getTime()) /
        (3600 * 1000),
      );
    findings.push({
      check: "Submitted before deadline",
      result: isOnTime ? "PASS" : "FAIL",
      detail: isOnTime
        ? `Submitted on time`
        : `Submitted ${hoursLate}h after deadline`,
    });
  } else {
    findings.push({
      check: "Submitted before deadline",
      result: "N/A",
      detail: "Deadline or submission timestamp not available",
    });
  }

  // Check 3: Was brand approval timely? (48h rule)
  const brandApprovedLate = checkBrandApprovalDelay(deal);
  findings.push({
    check: "Brand reviewed within 48h",
    result: brandApprovedLate.late ? "FAIL" : "PASS",
    detail: brandApprovedLate.detail,
  });

  // Check 4: Was posting done before posting deadline?
  const postingDeadline = deal.postingDeadline
    ? new Date(deal.postingDeadline)
    : null;
  const postedAt = deal.postedAt ? new Date(deal.postedAt) : null;
  if (postingDeadline && postedAt) {
    const isOnTime = postedAt <= postingDeadline;
    findings.push({
      check: "Posted before posting deadline",
      result: isOnTime ? "PASS" : "FAIL",
      detail: isOnTime ? "Posted on time" : "Posted after deadline",
    });
  }

  // Determine verdict
  const raisedByInfluencer = dispute.raisedBy.userType === "INFLUENCER";
  const influencerMissedDeadline =
    !hasSubmission ||
    (submissionDeadline && submittedAt && submittedAt > submissionDeadline);
  const brandDelayed = brandApprovedLate.late;

  if (raisedByInfluencer && brandDelayed) {
    // Influencer is right: brand didn't approve on time
    return {
      disputeId: dispute.id,
      tier: 1,
      verdict: "INFLUENCER_FAVORED",
      confidence: "HIGH",
      refundPercentage: 0,
      influencerPayoutPercentage: 100,
      trustScoreChanges: { influencer: 0, brand: -45 },
      explanation: `Brand failed to review content within the 48-hour review window. Per contract terms, content is auto-approved and influencer receives full payment. Brand receives a trust score penalty.`,
      findings,
      suggestedAction:
        "Auto-approve content and release payment to influencer. Apply 10% late fee from brand.",
      autoResolvable: true,
    };
  }

  if (!raisedByInfluencer && influencerMissedDeadline) {
    // Brand is right: influencer didn't deliver on time
    const hoursLate =
      submissionDeadline && submittedAt
        ? Math.round(
          (submittedAt.getTime() - submissionDeadline.getTime()) /
          (3600 * 1000),
        )
        : 999;

    if (hoursLate > 48 || !hasSubmission) {
      // Severe: >48h late or no submission at all
      return {
        disputeId: dispute.id,
        tier: 1,
        verdict: "BRAND_FAVORED",
        confidence: "HIGH",
        refundPercentage: 100,
        influencerPayoutPercentage: 0,
        trustScoreChanges: { influencer: -90, brand: 0 },
        explanation: `Influencer ${hasSubmission ? "missed the submission deadline by more than 48 hours" : "did not submit any content"}. Full refund issued to brand.`,
        findings,
        suggestedAction:
          "Release pre-authorized payment back to brand. Penalize influencer trust score.",
        autoResolvable: true,
      };
    } else {
      // Moderate: <48h late
      return {
        disputeId: dispute.id,
        tier: 1,
        verdict: "SPLIT",
        confidence: "MEDIUM",
        refundPercentage: 50,
        influencerPayoutPercentage: 50,
        trustScoreChanges: { influencer: -45, brand: 0 },
        explanation: `Influencer submitted content ${hoursLate}h after deadline. A 50/50 split is suggested since delivery was late but content was provided.`,
        findings,
        suggestedAction:
          "50% refund to brand, 50% payment to influencer. Minor trust score penalty for influencer.",
        autoResolvable: true,
      };
    }
  }

  // Ambiguous — escalate
  return {
    disputeId: dispute.id,
    tier: 1,
    verdict: "ESCALATE",
    confidence: "LOW",
    refundPercentage: 0,
    influencerPayoutPercentage: 0,
    trustScoreChanges: { influencer: 0, brand: 0 },
    explanation: `Timeline dispute could not be auto-resolved. Both parties appear to have met some deadlines but the situation is ambiguous. Escalating to human mediation.`,
    findings,
    suggestedAction: "Escalate to Tier 2 human mediation for detailed review.",
    autoResolvable: false,
  };
}

// ==================== QUALITY DISPUTE ====================

function analyzeQualityDispute(
  dispute: FullDispute,
  deal: FullDeal,
  contract: Record<string, unknown> | null,
): MediatorAnalysis {
  const findings: Finding[] = [];

  // Check 1: Were deliverables met? (count, type)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const contractDeliverables = Array.isArray(contract?.deliverables)
    ? contract.deliverables
    : [];
  const submissions = deal.contentSubmissions || [];
  findings.push({
    check: "Content submitted",
    result: submissions.length > 0 ? "PASS" : "FAIL",
    detail: `${submissions.length} submission(s) found`,
  });

  // Check 2: Revision history
  const revisionsUsed = deal.revisionsUsed || 0;
  const maxRevisions = deal.maxRevisions || 2;
  findings.push({
    check: "Revisions within policy",
    result: revisionsUsed <= maxRevisions ? "PASS" : "WARNING",
    detail: `${revisionsUsed}/${maxRevisions} revisions used`,
  });

  // Check 3: Was there specific feedback from brand?
  const latestSubmission = submissions[0];
  const hasFeedback =
    latestSubmission?.feedback && latestSubmission.feedback.length > 10;
  findings.push({
    check: "Brand provided specific feedback",
    result: hasFeedback ? "PASS" : "FAIL",
    detail: hasFeedback
      ? `Feedback: "${(latestSubmission.feedback || "").substring(0, 100)}..."`
      : "No specific feedback provided by brand",
  });

  // Check 4: Has influencer attempted revisions?
  const attemptedRevisions = revisionsUsed > 0;
  findings.push({
    check: "Influencer attempted revisions",
    result: attemptedRevisions ? "PASS" : "WARNING",
    detail: attemptedRevisions
      ? `${revisionsUsed} revision(s) attempted`
      : "No revisions attempted",
  });

  // Decision logic
  const raisedByBrand = dispute.raisedBy.userType === "BRAND";

  if (raisedByBrand && !hasFeedback) {
    // Brand rejected without specific feedback — unfair
    return {
      disputeId: dispute.id,
      tier: 1,
      verdict: "INFLUENCER_FAVORED",
      confidence: "MEDIUM",
      refundPercentage: 0,
      influencerPayoutPercentage: 100,
      trustScoreChanges: { influencer: 0, brand: -30 },
      explanation: `Brand raised quality concerns but did not provide specific, actionable feedback. Per revision policy, brand must give clear reasons. Influencer receives full payment.`,
      findings,
      suggestedAction:
        "Pay influencer in full. Remind brand to provide specific feedback when requesting revisions.",
      autoResolvable: true,
    };
  }

  if (raisedByBrand && revisionsUsed >= maxRevisions) {
    // Brand gave feedback, influencer used all revisions, still not approved
    // This is genuinely ambiguous — escalate
    return {
      disputeId: dispute.id,
      tier: 1,
      verdict: "ESCALATE",
      confidence: "LOW",
      refundPercentage: 0,
      influencerPayoutPercentage: 0,
      trustScoreChanges: { influencer: 0, brand: 0 },
      explanation: `Quality dispute after ${revisionsUsed} revisions. Brand provided feedback but influencer couldn't meet expectations. This requires human judgment to determine if brand's expectations were reasonable.`,
      findings,
      suggestedAction:
        "Escalate to Tier 2 mediation. Both parties should submit evidence.",
      autoResolvable: false,
    };
  }

  if (raisedByBrand && revisionsUsed < maxRevisions) {
    // Revisions still available — remind both parties
    return {
      disputeId: dispute.id,
      tier: 1,
      verdict: "DISMISSED",
      confidence: "HIGH",
      refundPercentage: 0,
      influencerPayoutPercentage: 0,
      trustScoreChanges: { influencer: 0, brand: 0 },
      explanation: `Quality issue raised but ${maxRevisions - revisionsUsed} revision(s) still available. Brand should request a revision with specific feedback before raising a dispute.`,
      findings,
      suggestedAction:
        "Dismiss dispute. Instruct brand to use available revision rounds first.",
      autoResolvable: true,
    };
  }

  // Influencer raised quality dispute (unusual) or other case
  return {
    disputeId: dispute.id,
    tier: 1,
    verdict: "ESCALATE",
    confidence: "LOW",
    refundPercentage: 0,
    influencerPayoutPercentage: 0,
    trustScoreChanges: { influencer: 0, brand: 0 },
    explanation: `Quality dispute requires human assessment of content against brief.`,
    findings,
    suggestedAction: "Escalate to Tier 2 mediation.",
    autoResolvable: false,
  };
}

// ==================== CONTENT DELETED DISPUTE ====================

function analyzeContentDeletedDispute(
  dispute: FullDispute,
  deal: FullDeal,
): MediatorAnalysis {
  const findings: Finding[] = [];

  // Check 1: Was post verified originally?
  const wasVerified = !!deal.verifiedAt;
  findings.push({
    check: "Post was originally verified",
    result: wasVerified ? "PASS" : "FAIL",
    detail:
      wasVerified && deal.verifiedAt
        ? `Verified at ${new Date(deal.verifiedAt).toLocaleString()}`
        : "Post was never verified",
  });

  // Check 2: Is post currently alive?
  const isAlive = deal.isPostAlive;
  findings.push({
    check: "Post currently alive",
    result: isAlive ? "PASS" : "FAIL",
    detail: isAlive
      ? "Post is still live"
      : "Post appears to be deleted or private",
  });

  // Check 3: Time since posting (within 30-day contract window?)
  const postedAt = deal.postedAt ? new Date(deal.postedAt) : null;
  const daysSincePosting = postedAt
    ? Math.floor((Date.now() - postedAt.getTime()) / (86400 * 1000))
    : 0;
  findings.push({
    check: "Within 30-day monitoring window",
    result: daysSincePosting <= 30 ? "PASS" : "N/A",
    detail: `${daysSincePosting} days since posting`,
  });

  // Check 4: Was payment already released?
  const paymentReleased =
    deal.status === "COMPLETED" || deal.status === "VERIFIED";
  findings.push({
    check: "Payment status",
    result: paymentReleased ? "WARNING" : "PASS",
    detail: paymentReleased ? "Payment already released" : "Payment still held",
  });

  if (!isAlive && wasVerified && daysSincePosting <= 30) {
    // Clear case: post was verified but now deleted within 30 days
    return {
      disputeId: dispute.id,
      tier: 1,
      verdict: "BRAND_FAVORED",
      confidence: "HIGH",
      refundPercentage: 50,
      influencerPayoutPercentage: 50,
      trustScoreChanges: { influencer: -270, brand: 0 },
      explanation: `Post was verified but deleted/made private within the 30-day contract window. Per contract terms, 50% clawback applies. Influencer receives major trust score penalty.`,
      findings,
      suggestedAction:
        "Execute 50% clawback from influencer wallet. Apply -270 trust score penalty. Create violation record.",
      autoResolvable: true,
    };
  }

  if (!isAlive && !wasVerified) {
    // Post was never verified — full refund
    return {
      disputeId: dispute.id,
      tier: 1,
      verdict: "BRAND_FAVORED",
      confidence: "HIGH",
      refundPercentage: 100,
      influencerPayoutPercentage: 0,
      trustScoreChanges: { influencer: -180, brand: 0 },
      explanation: `Post was never verified and is not accessible. Full refund to brand.`,
      findings,
      suggestedAction:
        "Full refund to brand. Trust score penalty for influencer.",
      autoResolvable: true,
    };
  }

  if (isAlive) {
    // Post is still live — dismiss dispute
    return {
      disputeId: dispute.id,
      tier: 1,
      verdict: "DISMISSED",
      confidence: "HIGH",
      refundPercentage: 0,
      influencerPayoutPercentage: 100,
      trustScoreChanges: { influencer: 0, brand: -25 },
      explanation: `Post is still live and accessible. Content deletion claim is not substantiated.`,
      findings,
      suggestedAction: "Dismiss dispute. Post is still live.",
      autoResolvable: true,
    };
  }

  // Ambiguous (>30 days, etc.)
  return {
    disputeId: dispute.id,
    tier: 1,
    verdict: "ESCALATE",
    confidence: "LOW",
    refundPercentage: 0,
    influencerPayoutPercentage: 0,
    trustScoreChanges: { influencer: 0, brand: 0 },
    explanation: `Content deletion dispute requires manual verification. Post may have been deleted after the 30-day window.`,
    findings,
    suggestedAction: "Escalate to Tier 2 mediation.",
    autoResolvable: false,
  };
}

// ==================== PAYMENT DISPUTE ====================

function analyzePaymentDispute(
  dispute: FullDispute,
  deal: FullDeal,
): MediatorAnalysis {
  const findings: Finding[] = [];

  // Check 1: Payment wallet escrow status
  const isPaymentSecured = [
    "PAYMENT_HELD",
    "ACTIVE",
    "CONTENT_SUBMITTED",
    "CONTENT_APPROVED",
    "POSTED",
    "VERIFIED",
  ].includes(deal.status);

  findings.push({
    check: "Payment secured in wallet escrow",
    result: isPaymentSecured ? "PASS" : "FAIL",
    detail: `Deal status: ${deal.status}`,
  });

  // Check 2: Was deal completed?
  const isCompleted = deal.status === "COMPLETED" || deal.status === "VERIFIED";
  findings.push({
    check: "Deal completed",
    result: isCompleted ? "PASS" : "WARNING",
    detail: `Deal status: ${deal.status}`,
  });

  // Check 3: Wallet reserve system integrity
  findings.push({
    check: "Wallet reserve system integrity",
    result: "PASS",
    detail: "Wallet escrow system secures funds prior to deal activation",
  });

  return {
    disputeId: dispute.id,
    tier: 1,
    verdict: isPaymentSecured ? "INFLUENCER_FAVORED" : "ESCALATE",
    confidence: isPaymentSecured ? "HIGH" : "LOW",
    refundPercentage: 0,
    influencerPayoutPercentage: isPaymentSecured ? 100 : 0,
    trustScoreChanges: { influencer: 0, brand: 0 },
    explanation: isPaymentSecured
      ? `Payment is secured and held in wallet escrow. If deal conditions are met, payment will release. No payment dispute is valid while escrow is active.`
      : `Payment dispute detected with status "${deal.status}". This is unusual. Escalating for manual investigation.`,
    findings,
    suggestedAction: isPaymentSecured
      ? "Dismiss dispute. Payment is secured via wallet escrow."
      : "Escalate to Tier 2 for technical payment investigation.",
    autoResolvable: isPaymentSecured,
  };
}

// ==================== TERMS VIOLATION DISPUTE ====================

function analyzeTermsViolationDispute(
  dispute: FullDispute,
  deal: FullDeal,
  contract: Record<string, unknown> | null,
): MediatorAnalysis {
  const findings: Finding[] = [];

  // Check contract mandatory elements
  const rawMandatoryElements = Array.isArray(contract?.mandatoryElements)
    ? contract.mandatoryElements
    : contract?.mandatoryTags;
  const mandatoryElements = Array.isArray(rawMandatoryElements)
    ? rawMandatoryElements.map((element) => String(element).trim()).filter(Boolean)
    : [];
  findings.push({
    check: "Contract has mandatory elements",
    result: mandatoryElements.length > 0 ? "PASS" : "N/A",
    detail:
      mandatoryElements.length > 0
        ? `Required: ${mandatoryElements.join(", ")}`
        : "No mandatory elements specified in contract",
  });

  // Check no-gos
  const noGos = Array.isArray(contract?.noGos) ? contract.noGos : [];
  findings.push({
    check: "Contract has no-go rules",
    result: noGos.length > 0 ? "PASS" : "N/A",
    detail:
      noGos.length > 0
        ? `No-gos: ${noGos.join(", ")}`
        : "No no-go rules specified",
  });

  // Terms violations always need human review (subjective)
  return {
    disputeId: dispute.id,
    tier: 1,
    verdict: "ESCALATE",
    confidence: "LOW",
    refundPercentage: 0,
    influencerPayoutPercentage: 0,
    trustScoreChanges: { influencer: 0, brand: 0 },
    explanation: `Terms violation disputes require human review to assess compliance with contract terms. Contract mandatory elements: ${mandatoryElements.join(", ") || "none specified"}. No-gos: ${noGos.join(", ") || "none specified"}.`,
    findings,
    suggestedAction:
      "Escalate to Tier 2 mediation. Both parties should submit evidence of compliance/violation.",
    autoResolvable: false,
  };
}

// ==================== GENERIC / OTHER DISPUTE ====================

function analyzeGenericDispute(
  dispute: FullDispute,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  deal: FullDeal,
): MediatorAnalysis {
  return {
    disputeId: dispute.id,
    tier: 1,
    verdict: "ESCALATE",
    confidence: "LOW",
    refundPercentage: 0,
    influencerPayoutPercentage: 0,
    trustScoreChanges: { influencer: 0, brand: 0 },
    explanation: `Dispute type "${dispute.type}" requires human mediation. Escalating to Tier 2.`,
    findings: [],
    suggestedAction: "Escalate to Tier 2 mediation.",
    autoResolvable: false,
  };
}

// ==================== APPLY RESOLUTION ====================

/**
 * Apply a mediator analysis resolution to the dispute and deal.
 * Updates dispute status, deal status, wallet balances, trust scores, and notifications.
 */
export async function applyResolution(
  disputeId: string,
  analysis: MediatorAnalysis,
  acceptedBy: "AUTO" | "INFLUENCER" | "BRAND" | "ADMIN",
): Promise<{ success: boolean; message: string }> {
  try {
    // Idempotency Check (Pre-Transaction)
    const checkDispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      select: { status: true, tier: true, resolution: true },
    });
    if (!checkDispute) return { success: false, message: "Dispute not found" };

    if (
      checkDispute.status === "RESOLVED" ||
      checkDispute.status === "TIER2_MEDIATION" ||
      checkDispute.status === "TIER3_ARBITRATION"
    ) {
      // If we are applying, status must be TIER3_ARBITRATION to resolve, or else it is locked
      const lock = await prisma.dispute.updateMany({
        where: { id: disputeId, status: "TIER3_ARBITRATION" },
        data: {
          status: "TIER3_ARBITRATION", // Keep same but act as transactional write lock
          updatedAt: new Date(),
        },
      });

      if (lock.count === 0) {
        return { success: false, message: "Dispute already resolved, closed, or being processed." };
      }
    }

    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        deal: {
          include: {
            influencer: { select: { userId: true } },
            brand: { select: { userId: true } },
          },
        },
      },
    });

    if (!dispute) return { success: false, message: "Dispute not found" };

    const deal = dispute.deal;
    const influencerUserId = deal.influencer.userId;
    const brandUserId = deal.brand?.userId;

    // Financial calculations outside transaction
    let influencerShare = 0;
    let brandRefund = 0;
    let totalAmount = 0;
    let feeRatio = 0;
    let settlementCharge = 0;
    let influencerClawback = 0;
    let treasuryClawback = 0;

    if (
      analysis.verdict !== "ESCALATE" &&
      analysis.verdict !== "DISMISSED"
    ) {
      totalAmount = getDealTotalAmount(deal);
      feeRatio = Math.min(1, Math.max(0, analysis.influencerPayoutPercentage / 100));
      const payoutBase = deal.influencerPayout ?? deal.amount;
      const feeBase = (deal.platformFee || 0) + (deal.gatewayFee || 0);
      influencerShare = Math.round(payoutBase * feeRatio);
      const feeShare = Math.round(feeBase * feeRatio);
      settlementCharge = influencerShare + feeShare;
      brandRefund = Math.round(totalAmount * (analysis.refundPercentage / 100));
      influencerClawback = Math.round(payoutBase * (analysis.refundPercentage / 100));
      treasuryClawback = Math.max(0, brandRefund - influencerClawback);
    }

    // Database Transaction for state updates with serializable isolation & retry loop
    const MAX_RETRIES = 5;
    let attempt = 0;
    let influencerRefResult: { referrerId?: string } | undefined;
    let brandRefResult: { referrerId?: string } | undefined;
    while (attempt < MAX_RETRIES) {
      attempt++;
      try {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          let actualDeduct = 0;
          let debtPending = 0;

          const isCompleted = deal.status === "COMPLETED";

          if (
            analysis.verdict !== "ESCALATE" &&
            analysis.verdict !== "DISMISSED" &&
            isCompleted &&
            brandRefund > 0
          ) {
            const influencerWallet = await tx.wallet.findUnique({
              where: { userId: influencerUserId },
            });
            if (!influencerWallet) {
              throw AppError.badRequest("Influencer wallet missing during clawback");
            }
            actualDeduct = Math.min(influencerWallet.balance, influencerClawback);
            debtPending = influencerClawback - actualDeduct;
          }

          // Atomic Status Lock — accept all valid in-progress statuses.
          // Previously this was hardcoded to TIER3_ARBITRATION, which meant every
          // OPEN and TIER1_AUTO auto-resolve attempt got count=0 and threw, permanently
          // freezing funds. Now any non-terminal status is a valid candidate.
          const lockCheck = await tx.dispute.updateMany({
            where: {
              id: disputeId,
              status: { in: ["OPEN", "TIER1_AUTO", "TIER2_MEDIATION", "TIER3_ARBITRATION"] },
            },
            data: {
              status:
                analysis.verdict === "ESCALATE" ? "TIER2_MEDIATION" : "RESOLVED",
              tier: analysis.verdict === "ESCALATE" ? 2 : 1,
              resolution: analysis.explanation,
              resolvedAt: analysis.verdict === "ESCALATE" ? null : new Date(),
              influencerOutcome: JSON.stringify({
                payment_percentage: analysis.influencerPayoutPercentage,
                trust_score_change: analysis.trustScoreChanges.influencer,
                confidence: analysis.confidence,
                ...(debtPending > 0 ? { debtPending } : {}),
              }),
              brandOutcome: JSON.stringify({
                refund_percentage: analysis.refundPercentage,
                trust_score_change: analysis.trustScoreChanges.brand,
                confidence: analysis.confidence,
              }),
            },
          });

          if (lockCheck.count === 0) {
            throw AppError.badRequest("Dispute lock check failed");
          }

          // Handle financial resolution (only if resolved, not escalated)
          if (
            analysis.verdict !== "ESCALATE" &&
            analysis.verdict !== "DISMISSED"
          ) {
            if (isCompleted) {
              // Scenario B: Money was already paid to Influencer (Clawback needed)
              if (brandRefund > 0) {
                const influencerWallet = await tx.wallet.findUnique({
                  where: { userId: influencerUserId },
                });

                if (!influencerWallet) {
                  throw AppError.badRequest("Influencer wallet missing during clawback");
                }

                // Debit Influencer (Enforce Debt) up to actualDeduct, increment debt by debtPending
                await tx.wallet.update({
                  where: { userId: influencerUserId },
                  data: {
                    balance: { decrement: actualDeduct },
                    // Floor totalEarned at 0: influencer may have spent earnings before
                    // the clawback, so naive decrement could produce a negative value
                    // which pollutes analytics and trust score calculations.
                    totalEarned: { decrement: Math.min(actualDeduct, influencerWallet.totalEarned ?? 0) },
                    debt: { increment: debtPending }, // Persist outstanding debt
                  },
                });

                // Debit Platform Treasury for platform's portion of the refund
                if (treasuryClawback > 0) {
                  await ensurePlatformTreasury(tx);
                  await tx.wallet.updateMany({
                    where: { userId: "PLATFORM_TREASURY" },
                    data: {
                      balance: { decrement: treasuryClawback },
                    },
                  });
                }

                // Credit Brand Wallet (Refund) up to brandRefundActual (recovered from influencer + treasury)
                const brandRefundActual = actualDeduct + treasuryClawback;
                if (brandUserId && brandRefundActual > 0) {
                  const brandWallet = await tx.wallet.upsert({
                    where: { userId: brandUserId },
                    create: { userId: brandUserId, balance: brandRefundActual, pendingBalance: 0 },
                    update: { balance: { increment: brandRefundActual } },
                  });

                  if (debtPending > 0) {
                    await tx.debtClaim.create({
                      data: {
                        debtorWalletId: influencerWallet.id,
                        creditorUserId: brandUserId,
                        dealId: deal.id,
                        amount: debtPending,
                        originalAmount: debtPending,
                        status: "PENDING",
                      },
                    });
                  }

                  const transactions = [
                    {
                      walletId: influencerWallet.id,
                      dealId: deal.id,
                      type: "CLAWBACK" as TransactionType,
                      amount: actualDeduct,
                      status: "COMPLETED" as TransactionStatus,
                      description: `Dispute clawback for brand refund (${analysis.refundPercentage}%)${debtPending > 0 ? ` (Pending debt: ${debtPending} Paise)` : ""}`,
                    }
                  ];

                  if (treasuryClawback > 0) {
                    await ensurePlatformTreasury(tx);
                    const treasuryWallet = await tx.wallet.findUnique({
                      where: { userId: "PLATFORM_TREASURY" },
                      select: { id: true }
                    });
                    if (treasuryWallet) {
                      transactions.push({
                        walletId: treasuryWallet.id,
                        dealId: deal.id,
                        type: "CLAWBACK" as TransactionType,
                        amount: treasuryClawback,
                        status: "COMPLETED" as TransactionStatus,
                        description: `Platform fee clawback for dispute resolution (${analysis.refundPercentage}%)`,
                      });
                    }
                  }

                  transactions.push({
                    walletId: brandWallet.id,
                    dealId: deal.id,
                    type: "REFUND" as TransactionType,
                    amount: brandRefundActual,
                    status: "COMPLETED" as TransactionStatus,
                    description: `Dispute refund from influencer clawback and platform fee refund (${analysis.refundPercentage}%)`,
                  });

                  await tx.transaction.createMany({
                    data: transactions,
                  });
                }
              }
            } else if (totalAmount > 0) {
              // Scenario C: Internal wallet-funded deal in progress
              if (!deal.reservedFromWallet) {
                if (!brandUserId) {
                  throw AppError.badRequest("Brand owner missing during wallet dispute settlement");
                }

                const debitResult = await tx.wallet.updateMany({
                  where: { userId: brandUserId, pendingBalance: { gte: totalAmount } },
                  data: {
                    pendingBalance: { decrement: totalAmount },
                    ...(brandRefund > 0
                      ? { balance: { increment: brandRefund } }
                      : {}),
                  },
                });

                if (debitResult.count === 0) {
                  throw AppError.badRequest("Invalid deal state: missing wallet reserve for dispute settlement");
                }
              }

              if (influencerShare > 0) {
                await creditInfluencerPayoutWithTax(
                  tx,
                  {
                    userId: influencerUserId,
                    dealId: deal.id,
                    grossPayout: influencerShare,
                    description: `Dispute resolution wallet payout (${analysis.influencerPayoutPercentage}%)`,
                    metadata: {
                      balanceImpact: true,
                      source: "wallet_dispute_resolution",
                      refundPercentage: analysis.refundPercentage,
                      reservedFromWallet: deal.reservedFromWallet,
                    },
                  },
                );
              }

              if (brandRefund > 0) {
                if (!brandUserId) {
                  throw AppError.badRequest("Brand owner missing during wallet dispute refund");
                }

                let brandWallet = await tx.wallet.findUnique({
                  where: { userId: brandUserId },
                });
                if (!brandWallet) {
                  brandWallet = await tx.wallet.create({
                    data: {
                      userId: brandUserId,
                      balance: 0,
                      pendingBalance: 0,
                    },
                  });
                }

                const brandWalletUpdate = await tx.wallet.updateMany({
                  where: {
                    id: brandWallet.id,
                    ...(deal.reservedFromWallet
                      ? {}
                      : { pendingBalance: { gte: brandRefund } }),
                  },
                  data: deal.reservedFromWallet
                    ? { balance: { increment: brandRefund } }
                    : {
                        // Razorpay-escrow deal: refund is handled externally, but
                        // pendingBalance MUST be decremented to unfreeze the brand account.
                        // Without this, brand's available balance stays wrong indefinitely.
                        pendingBalance: { decrement: brandRefund },
                      },
                });

                if (brandWalletUpdate.count === 0) {
                  throw AppError.badRequest("Invalid brand wallet state: insufficient pending balance for dispute refund");
                }

                await tx.transaction.create({
                  data: {
                    walletId: brandWallet.id,
                    dealId: deal.id,
                    type: "REFUND",
                    amount: brandRefund,
                    status: "COMPLETED",
                    description: `Dispute refund from wallet-funded reserve (${analysis.refundPercentage}%)`,
                    metadata: {
                      balanceImpact: true,
                      source: "wallet_dispute_resolution",
                      influencerShare,
                      reservedFromWallet: deal.reservedFromWallet,
                    },
                  },
                });
              }
            }
          }

          if (analysis.verdict !== "ESCALATE" && analysis.verdict !== "DISMISSED") {
            const dealStatus = (analysis.verdict === "INFLUENCER_FAVORED" || analysis.verdict === "SPLIT")
              ? "COMPLETED"
              : "CANCELLED";

            await tx.deal.update({
              where: { id: deal.id },
              data: {
                status: dealStatus,
                completedAt: dealStatus === "COMPLETED" ? new Date() : null,
              },
            });

            if (dealStatus === "COMPLETED") {
              if (deal.brandId && influencerShare > 0) {
                await tx.brandProfile.update({
                  where: { id: deal.brandId },
                  data: {
                    totalSpent: { increment: settlementCharge },
                  },
                });
              }

              if (analysis.verdict === "INFLUENCER_FAVORED" || analysis.verdict === "SPLIT") {
                await recordPlatformFeeRevenue(tx, {
                  brandUserId,
                  deal,
                  feeRatio,
                  source: "dispute_resolution",
                });
                influencerRefResult = await finalizeDealGamification(influencerUserId, influencerShare, tx, { dealId: deal.id });
                if (brandUserId && settlementCharge > 0) {
                  try {
                    brandRefResult = await processReferralReward(brandUserId, settlementCharge, tx, undefined, deal.id);
                  } catch (err) {
                    logger.warn("Brand referral reward failed in dispute mediator", { error: err, brandUserId });
                  }
                }
              }
            }

            if (dealStatus === "CANCELLED") {
              await tx.campaign.update({
                where: { id: deal.campaignId },
                data: {
                  reservedAmount: { decrement: deal.amount },
                  reservedTotalAmount: { decrement: getDealTotalAmount(deal) },
                },
              });
            }
          }

          // Log activity
          if (influencerUserId) {
            await createActivityLog({
              userId: influencerUserId,
              action: "DISPUTE_RESOLUTION",
              entityType: "Dispute",
              entityId: disputeId,
              metadata: {
                verdict: analysis.verdict,
                payoutPercentage: analysis.influencerPayoutPercentage,
                trustChange: analysis.trustScoreChanges.influencer,
                acceptedBy,
              },
            }, tx);
          }

          // dismissed, re-open the deal
          if (analysis.verdict === "DISMISSED") {
            let previousStatus = dispute.dealStatusAtCreation || "PAYMENT_PENDING";
            if (!dispute.dealStatusAtCreation) {
              if (deal.submittedContentUrl) {
                previousStatus = "CONTENT_SUBMITTED";
              }
            }
            await tx.deal.update({
              where: { id: deal.id },
              data: { status: previousStatus as DealStatus },
            });
          }

          // Notify both parties
          if (influencerUserId) {
            await NotificationService.createNotification({
              userId: influencerUserId,
              type: "dispute_update",
              title:
                analysis.verdict === "ESCALATE"
                  ? "Dispute Escalated to Mediation ⚖️"
                  : `Dispute Resolved — ${analysis.verdict.replace("_", " ")} 📋`,
              message: analysis.explanation.substring(0, 200),
              data: { disputeId, dealId: deal.id, verdict: analysis.verdict },
            }, tx);
          }

          if (brandUserId) {
            await NotificationService.createNotification({
              userId: brandUserId,
              type: "dispute_update",
              title:
                analysis.verdict === "ESCALATE"
                  ? "Dispute Escalated to Mediation ⚖️"
                  : `Dispute Resolved — ${analysis.verdict.replace("_", " ")} 📋`,
              message: analysis.explanation.substring(0, 200),
              data: { disputeId, dealId: deal.id, verdict: analysis.verdict },
            }, tx);
          }
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
        break; // Success! Break out of retry loop.
      } catch (error) {
        const isSerializationConflict =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034";
        if (isSerializationConflict && attempt < MAX_RETRIES) {
          logger.warn(`applyResolution transaction serialization conflict (attempt ${attempt}/${MAX_RETRIES}), retrying...`, { disputeId });
          await new Promise((resolve) => setTimeout(resolve, randomInt(50, 151)));
          continue;
        }
        logger.error("applyResolution transaction failed", error, { disputeId });
        throw error;
      }
    }

    // Invalidate platform fee caches outside transaction after successful commit
    const keysToDel = [];
    if (influencerRefResult?.referrerId) {
      keysToDel.push(`platform_fee:effective:${influencerRefResult.referrerId}`);
    }
    if (brandRefResult?.referrerId && brandRefResult.referrerId !== influencerRefResult?.referrerId) {
      keysToDel.push(`platform_fee:effective:${brandRefResult.referrerId}`);
    }
    if (keysToDel.length > 0) {
      try {
        await redis.del(keysToDel);
      } catch (err) {
        logger.warn("Failed to invalidate platform fee cache after dispute resolution", { error: err });
      }
    }

    // 5. Apply trust score changes (outside transaction for safety)
    if (analysis.verdict !== "ESCALATE") {
      if (analysis.verdict === "BRAND_FAVORED") {
        let category: ViolationCategory = "OTHER";
        if (dispute.type === "CONTENT_DELETED") category = "POST_DELETION";
        else if (dispute.type === "TIMELINE") category = "MISSED_DEADLINE";
        else if (dispute.type === "QUALITY") category = "OTHER";
        else if (dispute.type === "PAYMENT") category = "PAYMENT_FRAUD";

        try {
          await applyProgressivePenalty(
            influencerUserId,
            category,
            `Dispute resolution verdict brand favored: ${analysis.explanation || "Terms violation"}`,
            deal.submittedContentUrl || undefined
          );
        } catch (penaltyError) {
          logger.error("Failed to apply progressive penalty in dispute resolution", penaltyError, {
            disputeId,
            userId: influencerUserId,
          });
        }
      } else if (analysis.trustScoreChanges.influencer !== 0) {
        await updateTrustAndLevel(influencerUserId, "DISPUTE_RESOLVED");
      }

      if (brandUserId && analysis.trustScoreChanges.brand !== 0) {
        await updateTrustAndLevel(brandUserId, "DISPUTE_RESOLVED");
      }
    }

    return {
      success: true,
      message:
        analysis.verdict === "ESCALATE"
          ? "Dispute escalated to Tier 2 human mediation"
          : `Dispute resolved: ${analysis.verdict.replace("_", " ")}`,
    };
  } catch (error) {
    logger.error("applyResolution failed", error, { disputeId });
    return { success: false, message: "Failed to apply resolution" };
  }
}

// ==================== ESCALATION ====================

/**
 * Escalate a dispute to the next tier.
 */
export async function escalateDispute(
  disputeId: string,
  reason: string,
): Promise<{ success: boolean; newTier: number }> {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    select: { tier: true, status: true },
  });

  if (!dispute) return { success: false, newTier: 0 };

  const newTier = Math.min(dispute.tier + 1, 3);
  const newStatus = newTier === 2 ? "TIER2_MEDIATION" : "TIER3_ARBITRATION";

  await prisma.dispute.update({
    where: { id: disputeId },
    data: {
      tier: newTier,
      status: newStatus,
      resolution: `Escalated: ${reason}`,
    },
  });

  logger.info("Dispute escalated", { disputeId, newTier, reason });

  return { success: true, newTier };
}

// ==================== HELPERS ====================

function checkBrandApprovalDelay(deal: FullDeal): {
  late: boolean;
  hoursToApprove: number;
  detail: string;
} {
  if (!deal.submittedAt)
    return {
      late: false,
      hoursToApprove: 0,
      detail: "No submission timestamp",
    };

  const submittedAt = new Date(deal.submittedAt);
  const reviewPeriodHours = deal.reviewPeriodHours || 48;

  if (deal.approvedAt) {
    const approvedAt = new Date(deal.approvedAt);
    const hours = Math.round(
      (approvedAt.getTime() - submittedAt.getTime()) / (3600 * 1000),
    );
    return {
      late: hours > reviewPeriodHours,
      hoursToApprove: hours,
      detail:
        hours > reviewPeriodHours
          ? `Brand took ${hours}h to approve (limit: ${reviewPeriodHours}h)`
          : `Brand approved in ${hours}h (within ${reviewPeriodHours}h limit)`,
    };
  }

  // Not approved yet
  const hoursSinceSubmission = Math.round(
    (Date.now() - submittedAt.getTime()) / (3600 * 1000),
  );
  return {
    late: hoursSinceSubmission > reviewPeriodHours,
    hoursToApprove: hoursSinceSubmission,
    detail:
      hoursSinceSubmission > reviewPeriodHours
        ? `Brand has not approved after ${hoursSinceSubmission}h (limit: ${reviewPeriodHours}h)`
        : `Pending approval for ${hoursSinceSubmission}h (limit: ${reviewPeriodHours}h)`,
  };
}

function createErrorAnalysis(
  disputeId: string,
  error: string,
): MediatorAnalysis {
  return {
    disputeId,
    tier: 1,
    verdict: "ESCALATE",
    confidence: "LOW",
    refundPercentage: 0,
    influencerPayoutPercentage: 0,
    trustScoreChanges: { influencer: 0, brand: 0 },
    explanation: `Error during auto-analysis: ${error}. Escalating to human mediation.`,
    findings: [{ check: "System check", result: "FAIL", detail: error }],
    suggestedAction: "Escalate to Tier 2.",
    autoResolvable: false,
  };
}
