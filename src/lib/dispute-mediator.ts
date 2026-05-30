/**
 * Dispute Mediator — Tier 1 AI Auto-Resolution Engine
 *
 * Rule-based analysis for all dispute types.
 * Compares deal data, contract terms, submissions, and timelines
 * to produce a fair resolution suggestion automatically.
 *
 * NO ML / NO BLOCKCHAIN — Pure rule-based logic.
 */

import prisma from "./db";
import { logger } from "./logger";
import { updateTrustAndLevel } from "./trust-engine";
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
} from "@prisma/client";

type FullDeal = Deal & {
  campaign: { title: string; deliverables: any; requirements: string };
  influencer: {
    userId: string;
    displayName: string;
    completedDeals: number;
    averageRating: number;
  };
  brand: { userId: string; companyName: string } | null;
  contentSubmissions: ContentSubmission[];
  paymentHold: PaymentHold | null;
  reviews: any[];
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
      trustScoreChanges: { influencer: 0, brand: -5 },
      explanation: `Brand failed to review content within the 48-hour review window. Per contract terms, content is auto-approved and influencer receives full payment. Brand receives a trust score penalty.`,
      findings,
      suggestedAction:
        "Auto-approve content and release payment to influencer. Apply 5% late fee from brand.",
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
        trustScoreChanges: { influencer: -10, brand: 0 },
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
        trustScoreChanges: { influencer: -5, brand: 0 },
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
      trustScoreChanges: { influencer: 0, brand: -3 },
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
      trustScoreChanges: { influencer: -30, brand: 0 },
      explanation: `Post was verified but deleted/made private within the 30-day contract window. Per contract terms, 50% clawback applies. Influencer receives major trust score penalty.`,
      findings,
      suggestedAction:
        "Execute 50% clawback from influencer wallet. Apply -30 trust score penalty. Create violation record.",
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
      trustScoreChanges: { influencer: -20, brand: 0 },
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
      trustScoreChanges: { influencer: 0, brand: -2 },
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

  // Check 1: Payment pre-auth status
  const holdStatus = deal.paymentHold?.status;
  findings.push({
    check: "Payment pre-authorized",
    result:
      holdStatus === "HELD" || holdStatus === "CAPTURED" ? "PASS" : "FAIL",
    detail: `Payment hold status: ${holdStatus || "NONE"}`,
  });

  // Check 2: Was deal completed?
  const isCompleted = deal.status === "COMPLETED" || deal.status === "VERIFIED";
  findings.push({
    check: "Deal completed",
    result: isCompleted ? "PASS" : "WARNING",
    detail: `Deal status: ${deal.status}`,
  });

  // Check 3: Wallet credit check
  // (Payment disputes should be nearly impossible with pre-auth)
  findings.push({
    check: "Pre-auth system integrity",
    result: "PASS",
    detail: "Pre-authorization system prevents payment disputes by design",
  });

  // Payment disputes should almost never happen due to pre-auth
  return {
    disputeId: dispute.id,
    tier: 1,
    verdict: holdStatus === "HELD" ? "INFLUENCER_FAVORED" : "ESCALATE",
    confidence: holdStatus === "HELD" ? "HIGH" : "LOW",
    refundPercentage: 0,
    influencerPayoutPercentage: holdStatus === "HELD" ? 100 : 0,
    trustScoreChanges: { influencer: 0, brand: 0 },
    explanation:
      holdStatus === "HELD"
        ? `Payment is pre-authorized and held. If deal conditions are met, payment will auto-release. No payment dispute is valid while pre-auth is active.`
        : `Payment dispute detected with hold status "${holdStatus}". This is unusual in a pre-auth system. Escalating for manual investigation.`,
    findings,
    suggestedAction:
      holdStatus === "HELD"
        ? "Dismiss dispute. Payment is secured via pre-authorization."
        : "Escalate to Tier 2 for technical payment investigation.",
    autoResolvable: holdStatus === "HELD",
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
// Helper to import capture/cancel (assuming they exist or need to be imported)
import { capturePayment, releasePreAuth } from "./razorpay";

// ... existing code ...

export async function applyResolution(
  disputeId: string,
  analysis: MediatorAnalysis,
  acceptedBy: "AUTO" | "INFLUENCER" | "BRAND" | "ADMIN",
): Promise<{ success: boolean; message: string }> {
  try {
    // Idempotency Check (Pre-Transaction)
    const checkDispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      select: { status: true },
    });
    if (checkDispute?.status === "RESOLVED") {
      return { success: true, message: "Dispute already resolved" };
    }

    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        deal: {
          include: {
            influencer: { select: { userId: true } },
            brand: { select: { userId: true } },
            paymentHold: true,
          },
        },
      },
    });

    if (!dispute) return { success: false, message: "Dispute not found" };

    const deal = dispute.deal;
    const influencerUserId = deal.influencer.userId;
    const brandUserId = deal.brand?.userId;
    const hold = deal.paymentHold;

    // 1. Financial calculations outside transaction
    let influencerShare = 0;
    let brandRefund = 0;
    let totalAmount = 0;

    if (
      analysis.verdict !== "ESCALATE" &&
      analysis.verdict !== "DISMISSED" &&
      hold
    ) {
      totalAmount = hold.amount;
      influencerShare = Math.round(
        (totalAmount * analysis.influencerPayoutPercentage) / 100,
      );
      brandRefund = totalAmount - influencerShare;
    }

    // 2. Perform external gateway calls outside database transaction
    let capturedPaymentId: string | undefined;

    if (
      analysis.verdict !== "ESCALATE" &&
      analysis.verdict !== "DISMISSED" &&
      hold &&
      hold.status === "HELD"
    ) {
      if (influencerShare > 0) {
        try {
          const captured = await capturePayment({
            paymentId: hold.razorpayPaymentId!,
            amount: influencerShare,
          });
          capturedPaymentId = captured.paymentId;
        } catch (err) {
          logger.error("Failed to capture dispute resolution payment", err);
          return {
            success: false,
            message: "Payment capture failed during dispute resolution",
          };
        }
      } else {
        // Full Refund to Brand -> Void the Auth
        try {
          await releasePreAuth(hold.razorpayOrderId);
        } catch (err) {
          logger.error("Failed to release pre-auth hold during dispute resolution", err);
          // Don't fail the entire mediation if release fails (as it can expire automatically on Razorpay),
          // but we still want to log it.
        }
      }
    }

    // 3. Database Transaction for state updates
    await prisma.$transaction(async (tx: any) => {
      // Atomic Status Check and Lock
      const freshDispute = await tx.dispute.update({
        where: { id: disputeId },
        data: { updatedAt: new Date() },
      });
      if (freshDispute?.status === "RESOLVED") return; // Idempotent exit

      let actualDeduct = 0;
      let debtPending = 0;

      if (
        analysis.verdict !== "ESCALATE" &&
        analysis.verdict !== "DISMISSED" &&
        hold &&
        hold.status === "CAPTURED" &&
        brandRefund > 0
      ) {
        const influencerWallet = await tx.wallet.findUnique({
          where: { userId: influencerUserId },
        });
        if (!influencerWallet) {
          throw new Error("Influencer wallet missing during clawback");
        }
        actualDeduct = Math.min(influencerWallet.balance, brandRefund);
        debtPending = brandRefund - actualDeduct;
      }

      // Update dispute status
      await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status:
            analysis.verdict === "ESCALATE" ? "TIER2_MEDIATION" : "RESOLVED",
          tier: analysis.verdict === "ESCALATE" ? 2 : 1,
          resolution: analysis.explanation,
          resolvedAt: analysis.verdict === "ESCALATE" ? null : new Date(),
          influencerOutcome: JSON.stringify({
            payment_percentage: analysis.influencerPayoutPercentage,
            trust_score_change: analysis.trustScoreChanges.influencer,
            ...(debtPending > 0 ? { debtPending } : {}),
          }),
          brandOutcome: JSON.stringify({
            refund_percentage: analysis.refundPercentage,
            trust_score_change: analysis.trustScoreChanges.brand,
          }),
        },
      });

      // Handle financial resolution (only if resolved, not escalated)
      if (
        analysis.verdict !== "ESCALATE" &&
        analysis.verdict !== "DISMISSED" &&
        hold
      ) {
        if (hold.status === "HELD") {
          // Scenario A: Money is still held on Gateway (Pre-Auth)
          if (influencerShare > 0) {
            await tx.paymentHold.update({
              where: { id: hold.id },
              data: { status: "CAPTURED", capturedAt: new Date() },
            });

            // Credit Influencer
            const wallet = await tx.wallet.upsert({
              where: { userId: influencerUserId },
              create: {
                userId: influencerUserId,
                balance: influencerShare,
                totalEarned: influencerShare,
              },
              update: {
                balance: { increment: influencerShare },
                totalEarned: { increment: influencerShare },
              },
            });

            await tx.transaction.create({
              data: {
                walletId: wallet.id,
                dealId: deal.id,
                type: "CREDIT",
                amount: influencerShare,
                status: "COMPLETED",
                description: `Dispute Resolution Payout (${analysis.influencerPayoutPercentage}%)`,
                razorpayPaymentId: capturedPaymentId || hold.razorpayPaymentId,
              },
            });
          } else {
            // Full Refund to Brand -> Void the Auth
            await tx.paymentHold.update({
              where: { id: hold.id },
              data: { status: "RELEASED" }, // Released back to brand
            });
          }
        } else if (hold.status === "CAPTURED") {
          // Scenario B: Money was already paid to Influencer (Clawback needed)
          if (brandRefund > 0) {
            // Debit Influencer (Enforce Debt) up to actualDeduct
            await tx.wallet.update({
              where: { userId: influencerUserId },
              data: {
                balance: { decrement: actualDeduct },
                totalEarned: { decrement: actualDeduct }, // Correct earnings history
              },
            });

            // Credit Brand Wallet (Refund)
            if (brandUserId) {
              const brandWallet = await tx.wallet.upsert({
                where: { userId: brandUserId },
                create: { userId: brandUserId, balance: brandRefund },
                update: { balance: { increment: brandRefund } },
              });

              const influencerWallet = await tx.wallet.findUnique({
                where: { userId: influencerUserId },
                select: { id: true },
              });

              if (!influencerWallet) {
                throw new Error("Influencer wallet missing during clawback");
              }

              await tx.transaction.createMany({
                data: [
                  {
                    walletId: influencerWallet.id,
                    dealId: deal.id,
                    type: "CLAWBACK",
                    amount: actualDeduct,
                    status: "COMPLETED",
                    description: `Dispute clawback for brand refund (${analysis.refundPercentage}%)${debtPending > 0 ? ` (Pending debt: ${debtPending} Paise)` : ""}`,
                  },
                  {
                    walletId: brandWallet.id,
                    dealId: deal.id,
                    type: "REFUND",
                    amount: brandRefund,
                    status: "COMPLETED",
                    description: `Dispute refund from influencer clawback (${analysis.refundPercentage}%)`,
                  },
                ],
              });
            }
          }
        }

        // Log activity
        if (influencerUserId) {
          await tx.activityLog.create({
            data: {
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
            },
          });
        }
      }

      // 3. If dismissed, re-open the deal
      if (analysis.verdict === "DISMISSED") {
        let previousStatus = "PAYMENT_PENDING";
        if (deal.submittedContentUrl) {
          previousStatus = "CONTENT_SUBMITTED";
        } else if (hold && hold.status === "HELD") {
          previousStatus = "PAYMENT_HELD";
        }
        await tx.deal.update({
          where: { id: deal.id },
          data: { status: previousStatus },
        });
      }

      // 4. Notify both parties
      if (influencerUserId) {
        await tx.notification.create({
          data: {
            userId: influencerUserId,
            type: "dispute_update",
            title:
              analysis.verdict === "ESCALATE"
                ? "Dispute Escalated to Mediation ⚖️"
                : `Dispute Resolved — ${analysis.verdict.replace("_", " ")} 📋`,
            message: analysis.explanation.substring(0, 200),
            data: { disputeId, dealId: deal.id, verdict: analysis.verdict },
          },
        });
      }

      if (brandUserId) {
        await tx.notification.create({
          data: {
            userId: brandUserId,
            type: "dispute_update",
            title:
              analysis.verdict === "ESCALATE"
                ? "Dispute Escalated to Mediation ⚖️"
                : `Dispute Resolved — ${analysis.verdict.replace("_", " ")} 📋`,
            message: analysis.explanation.substring(0, 200),
            data: { disputeId, dealId: deal.id, verdict: analysis.verdict },
          },
        });
      }
    });

    // 5. Apply trust score changes (outside transaction for safety)
    if (analysis.verdict !== "ESCALATE") {
      if (analysis.trustScoreChanges.influencer !== 0) {
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
