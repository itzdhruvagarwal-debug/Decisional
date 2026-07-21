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
import { randomInt } from "node:crypto";
import {
  verifyContractSignature,
  type ContractTerms,
  type ContractSignature as ContractSig,
} from "./contract-engine";
import { refundPayment } from "./razorpay";
import {
  Dispute,
  Deal,
  UserType,
  ContentSubmission,
  PaymentHold,
  TransactionType,
  TransactionStatus,
  Prisma,
  DealStatus,
  DisputeStatus,
} from "@prisma/client";

type FullDeal = Deal & {
  campaign: { title: string; deliverables: Prisma.JsonValue; requirements: string };
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

  if (!dispute?.deal) {
    return createErrorAnalysis(
      disputeId,
      "Dispute or associated deal not found",
    );
  }

  // Cast to FullDispute to satisfy types as include returns a complex object
  const typedDispute = dispute as unknown as FullDispute;
  const deal = typedDispute.deal;
  const contract = deal.contractTerms as Record<string, unknown> | null;

  // ── Contract Integrity Pre-Check ────────────────────────────────────────────
  // Before any rule-based analysis, verify that both digital signatures are
  // cryptographically valid.  A tampered contract is a critical security event:
  // immediately escalate so a human admin reviews it rather than auto-resolving.
  const contractIntegrityFinding = checkContractSignatureIntegrity(deal);
  if (contractIntegrityFinding.result === "FAIL") {
    logger.warn("Contract signature tamper detected — forcing escalation", {
      disputeId,
      dealId: deal.id,
    });
    return {
      disputeId,
      tier: 1,
      verdict: "ESCALATE",
      confidence: "HIGH",
      refundPercentage: 0,
      influencerPayoutPercentage: 0,
      trustScoreChanges: { influencer: 0, brand: 0 },
      explanation:
        "Contract signature verification failed: one or both digital signatures do not match the stored contract terms. " +
        "This indicates a possible contract tampering attempt. Escalating to human mediation for forensic review.",
      findings: [contractIntegrityFinding],
      suggestedAction: "Escalate to Tier 2 human mediation for forensic review of contract signatures.",
      autoResolvable: false,
    };
  }

  // Route to type-specific analyzer
  let analysis: MediatorAnalysis;
  switch (typedDispute.type) {
    case "TIMELINE":
      analysis = analyzeTimelineDispute(typedDispute, deal, contract);
      break;
    case "QUALITY":
      analysis = analyzeQualityDispute(typedDispute, deal, contract);
      break;
    case "CONTENT_DELETED":
      analysis = analyzeContentDeletedDispute(typedDispute, deal);
      break;
    case "PAYMENT":
      analysis = analyzePaymentDispute(typedDispute, deal);
      break;
    case "TERMS_VIOLATION":
      analysis = analyzeTermsViolationDispute(typedDispute, deal, contract);
      break;
    default:
      analysis = analyzeGenericDispute(typedDispute, deal);
  }

  // Prepend the contract-integrity finding to the returned analysis findings
  // so admins can always see whether signatures were valid.
  analysis.findings = [contractIntegrityFinding, ...analysis.findings];

  return analysis;
}

/**
 * Verify the cryptographic integrity of both contract signatures on a deal.
 * Returns a single Finding that can be prepended to any analysis result.
 */
function verifySignatures(
  contractTerms: ContractTerms,
  influencerSig?: ContractSig,
  brandSig?: ContractSig
): { failures: string[]; error?: Error } {
  const failures: string[] = [];
  try {
    if (influencerSig && !verifyContractSignature(contractTerms, influencerSig)) {
      failures.push("influencer signature hash mismatch");
    }
    if (brandSig && !verifyContractSignature(contractTerms, brandSig)) {
      failures.push("brand signature hash mismatch");
    }
    return { failures };
  } catch (err) {
    return {
      failures,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

function checkContractSignatureIntegrity(
  deal: FullDeal,
): Finding {
  const contractSignatureRaw = deal.contractSignature;
  const contractTerms = deal.contractTerms as ContractTerms | null;

  if (!contractTerms) {
    return {
      check: "Contract signature integrity",
      result: "N/A",
      detail: "No contract terms stored on the deal — signature verification skipped.",
    };
  }

  if (!contractSignatureRaw) {
    return {
      check: "Contract signature integrity",
      result: "WARNING",
      detail: "No digital signatures on file. Deal may not have been fully counter-signed.",
    };
  }

  interface ContractSignatureObj {
    influencerSignature?: ContractSig;
    brandSignature?: ContractSig;
  }

  const sig = contractSignatureRaw && typeof contractSignatureRaw === "object"
    ? (contractSignatureRaw as unknown as ContractSignatureObj)
    : {};
  const influencerSig = sig.influencerSignature;
  const brandSig = sig.brandSignature;

  const { failures, error } = verifySignatures(contractTerms, influencerSig, brandSig);

  if (error) {
    return {
      check: "Contract signature integrity",
      result: "WARNING",
      detail: `Signature verification could not be completed: ${error.message}. Proceeding with caution.`,
    };
  }

  if (failures.length > 0) {
    return {
      check: "Contract signature integrity",
      result: "FAIL",
      detail: `Contract tampering detected — ${failures.join("; ")}. ` +
        `Influencer signed: ${influencerSig ? "yes" : "no"}, Brand signed: ${brandSig ? "yes" : "no"}.`,
    };
  }

  const signedParties = [influencerSig ? "influencer" : "", brandSig ? "brand" : ""].filter(Boolean);
  const passed = signedParties.length > 0;

  return {
    check: "Contract signature integrity",
    result: passed ? "PASS" : "N/A",
    detail: passed
      ? `All signatures verified: ${signedParties.join(", ")}.`
      : "Neither party has signed — signature verification skipped.",
  };
}

// ==================== TIMELINE DISPUTE ====================

function checkSubmissionDeadline(deal: FullDeal, findings: Finding[]): { submissionDeadline: Date | null; submittedAt: Date | null } {
  const submissionDeadline = deal.submissionDeadline ? new Date(deal.submissionDeadline) : null;
  const latestSubmission = deal.contentSubmissions?.[0];
  const submittedAt = latestSubmission?.submittedAt ? new Date(latestSubmission.submittedAt) : null;

  if (submissionDeadline && submittedAt) {
    const isOnTime = submittedAt <= submissionDeadline;
    const hoursLate = isOnTime ? 0 : Math.round((submittedAt.getTime() - submissionDeadline.getTime()) / (3600 * 1000));
    findings.push({
      check: "Submitted before deadline",
      result: isOnTime ? "PASS" : "FAIL",
      detail: isOnTime ? `Submitted on time` : `Submitted ${hoursLate}h after deadline`,
    });
  } else {
    findings.push({
      check: "Submitted before deadline",
      result: "N/A",
      detail: "Deadline or submission timestamp not available",
    });
  }

  return { submissionDeadline, submittedAt };
}

function checkBrandApprovalTimeliness(deal: FullDeal, findings: Finding[]): { late: boolean; detail: string } {
  const brandApprovedLate = checkBrandApprovalDelay(deal);
  findings.push({
    check: "Brand reviewed within 48h",
    result: brandApprovedLate.late ? "FAIL" : "PASS",
    detail: brandApprovedLate.detail,
  });
  return brandApprovedLate;
}

function checkPostingDeadline(deal: FullDeal, findings: Finding[]) {
  const postingDeadline = deal.postingDeadline ? new Date(deal.postingDeadline) : null;
  const postedAt = deal.postedAt ? new Date(deal.postedAt) : null;
  if (postingDeadline && postedAt) {
    const isOnTime = postedAt <= postingDeadline;
    findings.push({
      check: "Posted before posting deadline",
      result: isOnTime ? "PASS" : "FAIL",
      detail: isOnTime ? "Posted on time" : "Posted after deadline",
    });
  }
}

function determineTimelineVerdict(
  dispute: FullDispute,
  deal: FullDeal,
  hasSubmission: boolean,
  submissionDeadline: Date | null,
  submittedAt: Date | null,
  brandApprovedLate: { late: boolean; detail: string },
  findings: Finding[]
): MediatorAnalysis {
  const raisedByInfluencer = dispute.raisedBy.userType === "INFLUENCER";
  const influencerMissedDeadline =
    !hasSubmission ||
    (submissionDeadline && submittedAt && submittedAt > submissionDeadline);
  const brandDelayed = brandApprovedLate.late;

  if (raisedByInfluencer && brandDelayed) {
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
      suggestedAction: "Auto-approve content and release payment to influencer. Apply 10% late fee from brand.",
      autoResolvable: true,
    };
  }

  if (!raisedByInfluencer && influencerMissedDeadline) {
    const hoursLate =
      submissionDeadline && submittedAt
        ? Math.round((submittedAt.getTime() - submissionDeadline.getTime()) / (3600 * 1000))
        : 999;

    if (hoursLate > 48 || !hasSubmission) {
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
        suggestedAction: "Release pre-authorized payment back to brand. Penalize influencer trust score.",
        autoResolvable: true,
      };
    } else {
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
        suggestedAction: "50% refund to brand, 50% payment to influencer. Minor trust score penalty for influencer.",
        autoResolvable: true,
      };
    }
  }

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

function analyzeTimelineDispute(
  dispute: FullDispute,
  deal: FullDeal,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  contract: Record<string, unknown> | null,
): MediatorAnalysis {
  const findings: Finding[] = [];

  // Check 1: Was content submitted?
  const hasSubmission = (deal.contentSubmissions || []).length > 0;
  findings.push({
    check: "Content submitted",
    result: hasSubmission ? "PASS" : "FAIL",
    detail: hasSubmission
      ? `${deal.contentSubmissions.length} submission(s) found`
      : "No content submissions found",
  });

  // Check 2: Submission deadline check
  const { submissionDeadline, submittedAt } = checkSubmissionDeadline(deal, findings);

  // Check 3: Brand approval timeliness check
  const brandApprovedLate = checkBrandApprovalTimeliness(deal, findings);

  // Check 4: Posting deadline check
  checkPostingDeadline(deal, findings);

  // Determine verdict
  return determineTimelineVerdict(
    dispute,
    deal,
    hasSubmission,
    submissionDeadline,
    submittedAt,
    brandApprovedLate,
    findings
  );
}

// ==================== QUALITY DISPUTE ====================

function analyzeQualityDispute(
  dispute: FullDispute,
  deal: FullDeal,
  _contract: Record<string, unknown> | null,
): MediatorAnalysis {
  const findings: Finding[] = [];

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

  const isCompleted = deal.status === "COMPLETED" || deal.status === "VERIFIED";

  findings.push(
    {
      check: "Payment secured in wallet escrow",
      result: isPaymentSecured ? "PASS" : "FAIL",
      detail: `Deal status: ${deal.status}`,
    },
    {
      check: "Deal completed",
      result: isCompleted ? "PASS" : "WARNING",
      detail: `Deal status: ${deal.status}`,
    },
    {
      check: "Wallet reserve system integrity",
      result: "PASS",
      detail: "Wallet escrow system secures funds prior to deal activation",
    }
  );

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
interface CompletedDealClawbackConfig {
  tx: Prisma.TransactionClient;
  deal: FullDeal;
  brandUserId: string | null;
  influencerUserId: string;
  actualDeduct: number;
  debtPending: number;
  treasuryClawback: number;
  brandRefundActual: number;
  analysis: MediatorAnalysis;
}

async function applyCompletedDealClawback(config: CompletedDealClawbackConfig) {
  const {
    tx,
    deal,
    brandUserId,
    influencerUserId,
    actualDeduct,
    debtPending,
    treasuryClawback,
    brandRefundActual,
    analysis,
  } = config;

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
      totalEarned: { decrement: Math.min(actualDeduct, influencerWallet.totalEarned ?? 0) },
      debt: { increment: debtPending },
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

  // Credit Brand Wallet (Refund) up to brandRefundActual
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

    const debtSuffix = debtPending > 0 ? ` (Pending debt: ${debtPending} Paise)` : "";
    const description = `Dispute clawback for brand refund (${analysis.refundPercentage}%)${debtSuffix}`;

    const transactions = [
      {
        walletId: influencerWallet.id,
        dealId: deal.id,
        type: "CLAWBACK" as TransactionType,
        amount: actualDeduct,
        status: "COMPLETED" as TransactionStatus,
        description,
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

async function handleActiveDealBrandRefund(
  tx: Prisma.TransactionClient,
  brandUserId: string,
  totalAmount: number,
  brandRefund: number
) {
  const debitResult = await tx.wallet.updateMany({
    where: { userId: brandUserId, pendingBalance: { gte: totalAmount } },
    data: {
      pendingBalance: { decrement: totalAmount },
      ...(brandRefund > 0 ? { balance: { increment: brandRefund } } : {}),
    },
  });

  if (debitResult.count === 0) {
    throw AppError.badRequest("Invalid deal state: missing wallet reserve for dispute settlement");
  }
}

interface ActiveDealEscrowSettlementConfig {
  tx: Prisma.TransactionClient;
  deal: FullDeal;
  brandUserId: string | null;
  influencerUserId: string;
  influencerShare: number;
  brandRefund: number;
  totalAmount: number;
  analysis: MediatorAnalysis;
}

async function handleRazorpayGatewayRefund(
  deal: FullDeal,
  brandRefund: number,
  analysis: MediatorAnalysis
) {
  if (brandRefund > 0 && deal.paymentHold?.razorpayPaymentId) {
    try {
      await refundPayment({
        paymentId: deal.paymentHold.razorpayPaymentId as string,
        amount: brandRefund,
        speed: "normal",
        notes: {
          dealId: deal.id,
          reason: `Dispute auto-resolution refund (${analysis.refundPercentage}% back to brand)`,
        },
      });
      logger.info("Razorpay refund issued for card-funded dispute settlement", {
        dealId: deal.id,
        paymentId: deal.paymentHold.razorpayPaymentId,
        refundAmount: brandRefund,
      });
    } catch (refundErr) {
      // Log and continue — wallet credit above has already succeeded. The
      // Razorpay refund failure should trigger a manual follow-up; we don't
      // want to roll back the entire dispute resolution for a payment-gateway
      // transient error.
      logger.error(
        "Razorpay refund failed during dispute resolution — wallet credited but gateway refund pending manual retry",
        refundErr instanceof Error ? refundErr : new Error(String(refundErr)),
        { dealId: deal.id, paymentId: deal.paymentHold.razorpayPaymentId, brandRefund },
      );
    }
  }
}

async function handleBrandWalletRefund(
  tx: Prisma.TransactionClient,
  deal: FullDeal,
  brandUserId: string | null,
  brandRefund: number,
  influencerShare: number,
  analysis: MediatorAnalysis
) {
  if (brandRefund <= 0) return;
  if (!brandUserId) {
    throw AppError.badRequest("Brand owner missing during wallet dispute refund");
  }

  let brandWallet = await tx.wallet.findUnique({
    where: { userId: brandUserId },
  });
  if (!brandWallet) {
    brandWallet = await tx.wallet.create({
      data: { userId: brandUserId, balance: 0, pendingBalance: 0 },
    });
  }

  const brandWalletUpdate = await tx.wallet.updateMany({
    where: {
      id: brandWallet.id,
      ...(deal.reservedFromWallet ? {} : { pendingBalance: { gte: brandRefund } }),
    },
    data: deal.reservedFromWallet
      ? { balance: { increment: brandRefund } }
      : { pendingBalance: { decrement: brandRefund } },
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

async function applyActiveDealEscrowSettlement(config: ActiveDealEscrowSettlementConfig) {
  const {
    tx,
    deal,
    brandUserId,
    influencerUserId,
    influencerShare,
    brandRefund,
    totalAmount,
    analysis,
  } = config;

  if (!deal.reservedFromWallet) {
    if (!brandUserId) {
      throw AppError.badRequest("Brand owner missing during wallet dispute settlement");
    }

    await handleActiveDealBrandRefund(tx, brandUserId, totalAmount, brandRefund);
    await handleRazorpayGatewayRefund(deal, brandRefund, analysis);
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

  await handleBrandWalletRefund(tx, deal, brandUserId, brandRefund, influencerShare, analysis);
}

interface ResolutionResults {
  influencerRefResult: { referrerId?: string } | undefined;
  brandRefResult: { referrerId?: string } | undefined;
}

type DisputeAcceptedBy = "AUTO" | "INFLUENCER" | "BRAND" | "ADMIN";

interface ResolutionTransactionConfig {
  tx: Prisma.TransactionClient;
  disputeId: string;
  dispute: FullDispute;
  deal: FullDeal;
  analysis: MediatorAnalysis;
  brandUserId: string | null;
  influencerUserId: string;
  brandRefund: number;
  influencerClawback: number;
  treasuryClawback: number;
  influencerShare: number;
  settlementCharge: number;
  totalAmount: number;
  acceptedBy: DisputeAcceptedBy;
  feeRatio: number;
}

async function applyFinancialResolution(
  tx: Prisma.TransactionClient,
  params: {
    analysis: MediatorAnalysis;
    isCompleted: boolean;
    deal: FullDeal;
    brandUserId: string | null;
    influencerUserId: string;
    actualDeduct: number;
    debtPending: number;
    treasuryClawback: number;
    brandRefundActual: number;
    influencerShare: number;
    brandRefund: number;
    totalAmount: number;
  }
) {
  const {
    analysis,
    isCompleted,
    deal,
    brandUserId,
    influencerUserId,
    actualDeduct,
    debtPending,
    treasuryClawback,
    brandRefundActual,
    influencerShare,
    brandRefund,
    totalAmount,
  } = params;

  if (analysis.verdict !== "ESCALATE" && analysis.verdict !== "DISMISSED") {
    if (isCompleted) {
      await applyCompletedDealClawback({
        tx,
        deal,
        brandUserId,
        influencerUserId,
        actualDeduct,
        debtPending,
        treasuryClawback,
        brandRefundActual,
        analysis,
      });
    } else if (totalAmount > 0) {
      await applyActiveDealEscrowSettlement({
        tx,
        deal,
        brandUserId,
        influencerUserId,
        influencerShare,
        brandRefund,
        totalAmount,
        analysis,
      });
    }
  }
}

async function handleCompletedDealPostSettlement(
  tx: Prisma.TransactionClient,
  params: {
    analysis: MediatorAnalysis;
    deal: FullDeal;
    brandUserId: string | null;
    influencerUserId: string;
    influencerShare: number;
    feeRatio: number;
    settlementCharge: number;
  }
) {
  const { analysis, deal, brandUserId, influencerUserId, influencerShare, feeRatio, settlementCharge } = params;
  let influencerRefResult: { referrerId?: string } | undefined = undefined;
  let brandRefResult: { referrerId?: string } | undefined = undefined;

  if (deal.brandId && influencerShare > 0) {
    await tx.brandProfile.update({
      where: { id: deal.brandId },
      data: {
        totalSpent: { increment: settlementCharge },
      },
    });
  }

  const isFavoredOrSplit = analysis.verdict === "INFLUENCER_FAVORED" || analysis.verdict === "SPLIT";
  if (isFavoredOrSplit) {
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
        logger.warn("Brand referral reward failed in dispute mediator", {
          error: err instanceof Error ? err.message : String(err),
          brandUserId,
        });
      }
    }
  }

  return { influencerRefResult, brandRefResult };
}

async function applyDealStatusAndRevenues(
  tx: Prisma.TransactionClient,
  params: {
    analysis: MediatorAnalysis;
    deal: FullDeal;
    brandUserId: string | null;
    influencerUserId: string;
    influencerShare: number;
    feeRatio: number;
    settlementCharge: number;
  }
): Promise<ResolutionResults> {
  const { analysis, deal } = params;
  let influencerRefResult: { referrerId?: string } | undefined = undefined;
  let brandRefResult: { referrerId?: string } | undefined = undefined;

  if (analysis.verdict === "ESCALATE" || analysis.verdict === "DISMISSED") {
    return { influencerRefResult, brandRefResult };
  }

  const isFavoredOrSplit = analysis.verdict === "INFLUENCER_FAVORED" || analysis.verdict === "SPLIT";
  const dealStatus = isFavoredOrSplit ? "COMPLETED" : "CANCELLED";

  await tx.deal.update({
    where: { id: deal.id },
    data: {
      status: dealStatus,
      completedAt: dealStatus === "COMPLETED" ? new Date() : null,
    },
  });

  if (dealStatus === "COMPLETED") {
    const res = await handleCompletedDealPostSettlement(tx, params);
    influencerRefResult = res.influencerRefResult;
    brandRefResult = res.brandRefResult;
  } else {
    await tx.campaign.update({
      where: { id: deal.campaignId },
      data: {
        reservedAmount: { decrement: deal.amount },
        reservedTotalAmount: { decrement: getDealTotalAmount(deal) },
      },
    });
  }

  return { influencerRefResult, brandRefResult };
}

async function createResolutionNotifications(
  tx: Prisma.TransactionClient,
  disputeId: string,
  verdict: string,
  explanation: string,
  dealId: string,
  brandUserId: string | null,
  influencerUserId: string,
) {
  const title =
    verdict === "ESCALATE"
      ? "Dispute Escalated to Mediation ⚖️"
      : `Dispute Resolved — ${verdict.replace("_", " ")} 📋`;
  const message = explanation.substring(0, 200);

  if (influencerUserId) {
    await NotificationService.createNotification({
      userId: influencerUserId,
      type: "dispute",
      title,
      message,
      data: { disputeId, dealId, verdict },
    }, tx);
  }

  if (brandUserId) {
    await NotificationService.createNotification({
      userId: brandUserId,
      type: "dispute",
      title,
      message,
      data: { disputeId, dealId, verdict },
    }, tx);
  }
}

async function executeResolutionTransaction(config: ResolutionTransactionConfig): Promise<ResolutionResults> {
  const {
    tx,
    disputeId,
    dispute,
    deal,
    analysis,
    brandUserId,
    influencerUserId,
    brandRefund,
    influencerClawback,
    treasuryClawback,
    influencerShare,
    settlementCharge,
    totalAmount,
    acceptedBy,
    feeRatio,
  } = config;

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

  // Atomic Status Lock
  const lockCheck = await tx.dispute.updateMany({
    where: {
      id: disputeId,
      status: { in: ["OPEN", "TIER1_AUTO", "TIER2_MEDIATION", "TIER3_ARBITRATION"] },
    },
    data: {
      status: analysis.verdict === "ESCALATE" ? "TIER2_MEDIATION" : "RESOLVED",
      tier: analysis.verdict === "ESCALATE" ? 2 : 1,
      resolution: analysis.explanation,
      resolvedAt: analysis.verdict === "ESCALATE" ? null : new Date(),
      resolvedAmicably: analysis.verdict !== "ESCALATE",
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

  // Handle financial resolution
  const brandRefundActual = actualDeduct + treasuryClawback;
  await applyFinancialResolution(tx, {
    analysis,
    isCompleted,
    deal,
    brandUserId,
    influencerUserId,
    actualDeduct,
    debtPending,
    treasuryClawback,
    brandRefundActual,
    influencerShare,
    brandRefund,
    totalAmount,
  });

  const { influencerRefResult, brandRefResult } = await applyDealStatusAndRevenues(tx, {
    analysis,
    deal,
    brandUserId,
    influencerUserId,
    influencerShare,
    feeRatio,
    settlementCharge,
  });

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
    if (!dispute.dealStatusAtCreation && deal.submittedContentUrl) {
      previousStatus = "CONTENT_SUBMITTED";
    }
    await tx.deal.update({
      where: { id: deal.id },
      data: { status: previousStatus as DealStatus },
    });
  }

  // Notify both parties
  await createResolutionNotifications(
    tx,
    disputeId,
    analysis.verdict,
    analysis.explanation,
    deal.id,
    brandUserId,
    influencerUserId,
  );

  return { influencerRefResult, brandRefResult };
}

async function validateDisputeStatus(
  checkDispute: { status: DisputeStatus; tier: number } | null,
  disputeId: string
): Promise<{ success: boolean; message: string }> {
  if (!checkDispute) return { success: false, message: "Dispute not found" };

  if (
    checkDispute.status === "RESOLVED" ||
    checkDispute.status === "TIER2_MEDIATION" ||
    checkDispute.status === "TIER3_ARBITRATION"
  ) {
    const lock = await prisma.dispute.updateMany({
      where: { id: disputeId, status: "TIER3_ARBITRATION" },
      data: {
        status: "TIER3_ARBITRATION",
        updatedAt: new Date(),
      },
    });

    if (lock.count === 0) {
      return { success: false, message: "Dispute already resolved, closed, or being processed." };
    }
  }

  return { success: true, message: "" };
}

function calculateResolutionAmounts(analysis: MediatorAnalysis, deal: FullDeal) {
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

  return {
    influencerShare,
    brandRefund,
    totalAmount,
    feeRatio,
    settlementCharge,
    influencerClawback,
    treasuryClawback,
  };
}

function resolveDisputeCategory(disputeType: string): ViolationCategory {
  if (disputeType === "CONTENT_DELETED") return "POST_DELETION";
  if (disputeType === "TIMELINE") return "MISSED_DEADLINE";
  if (disputeType === "PAYMENT") return "PAYMENT_FRAUD";
  return "OTHER";
}

async function applyBrandFavoredPenalty(
  influencerUserId: string,
  disputeType: string,
  explanation: string,
  submittedContentUrl?: string,
  disputeId?: string
) {
  const category = resolveDisputeCategory(disputeType);
  try {
    await applyProgressivePenalty(
      influencerUserId,
      category,
      `Dispute resolution verdict brand favored: ${explanation || "Terms violation"}`,
      submittedContentUrl
    );
  } catch (penaltyError) {
    logger.error(
      "Failed to apply progressive penalty in dispute resolution",
      penaltyError instanceof Error ? penaltyError : new Error(String(penaltyError)),
      { disputeId, userId: influencerUserId }
    );
  }
}

async function handlePostResolutionWork(
  dispute: FullDispute,
  analysis: MediatorAnalysis,
  deal: FullDeal,
  brandUserId: string | null,
  influencerUserId: string,
  disputeId: string
) {
  if (analysis.verdict === "ESCALATE") return;

  if (analysis.verdict === "BRAND_FAVORED") {
    await applyBrandFavoredPenalty(
      influencerUserId,
      dispute.type,
      analysis.explanation,
      deal.submittedContentUrl ?? undefined,
      disputeId
    );
  } else if (analysis.trustScoreChanges.influencer !== 0) {
    await updateTrustAndLevel(influencerUserId, "DISPUTE_RESOLVED");
  }

  if (brandUserId && analysis.trustScoreChanges.brand !== 0) {
    await updateTrustAndLevel(brandUserId, "DISPUTE_RESOLVED");
  }
}

async function invalidateDisputePlatformFeeCaches(
  influencerRefResult: { referrerId?: string } | undefined,
  brandRefResult: { referrerId?: string } | undefined,
) {
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
      logger.warn("Failed to invalidate platform fee cache after dispute resolution", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function runResolutionTransactionWithRetries(params: {
  disputeId: string;
  dispute: FullDispute;
  deal: FullDeal;
  analysis: MediatorAnalysis;
  brandUserId: string | null;
  influencerUserId: string;
  brandRefund: number;
  influencerClawback: number;
  treasuryClawback: number;
  influencerShare: number;
  settlementCharge: number;
  totalAmount: number;
  acceptedBy: "AUTO" | "INFLUENCER" | "BRAND" | "ADMIN";
  feeRatio: number;
}) {
  const MAX_RETRIES = 5;
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const txResult = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        return executeResolutionTransaction({
          tx,
          disputeId: params.disputeId,
          dispute: params.dispute,
          deal: params.deal,
          analysis: params.analysis,
          brandUserId: params.brandUserId,
          influencerUserId: params.influencerUserId,
          brandRefund: params.brandRefund,
          influencerClawback: params.influencerClawback,
          treasuryClawback: params.treasuryClawback,
          influencerShare: params.influencerShare,
          settlementCharge: params.settlementCharge,
          totalAmount: params.totalAmount,
          acceptedBy: params.acceptedBy,
          feeRatio: params.feeRatio,
        });
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });

      return txResult;
    } catch (error) {
      const isSerializationConflict =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034";
      if (isSerializationConflict && attempt < MAX_RETRIES) {
        logger.warn(`applyResolution transaction serialization conflict (attempt ${attempt}/${MAX_RETRIES}), retrying...`, { disputeId: params.disputeId });
        await new Promise((resolve) => setTimeout(resolve, randomInt(50, 151)));
        continue;
      }
      logger.error("applyResolution transaction failed", error instanceof Error ? error : new Error(String(error)), { disputeId: params.disputeId });
      throw error;
    }
  }
  throw new Error("applyResolution transaction failed after maximum retries");
}

export async function applyResolution(
  disputeId: string,
  analysis: MediatorAnalysis,
  acceptedBy: "AUTO" | "INFLUENCER" | "BRAND" | "ADMIN",
): Promise<{ success: boolean; message: string }> {
  try {
    const checkDispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      select: { status: true, tier: true, resolution: true },
    });
    const validation = await validateDisputeStatus(checkDispute, disputeId);
    if (!validation.success) return validation;

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

    if (!dispute) return { success: false, message: "Dispute not found" };

    const deal = dispute.deal;
    const influencerUserId = deal.influencer.userId;
    const brandUserId = deal.brand?.userId;

    const {
      influencerShare,
      brandRefund,
      totalAmount,
      feeRatio,
      settlementCharge,
      influencerClawback,
      treasuryClawback,
    } = calculateResolutionAmounts(analysis, deal);

    const txResult = await runResolutionTransactionWithRetries({
      disputeId,
      dispute,
      deal,
      analysis,
      brandUserId: brandUserId ?? null,
      influencerUserId,
      brandRefund,
      influencerClawback,
      treasuryClawback,
      influencerShare,
      settlementCharge,
      totalAmount,
      acceptedBy,
      feeRatio,
    });

    const influencerRefResult = txResult.influencerRefResult;
    const brandRefResult = txResult.brandRefResult;

    await invalidateDisputePlatformFeeCaches(influencerRefResult, brandRefResult);

    await handlePostResolutionWork(dispute, analysis, deal, brandUserId ?? null, influencerUserId, disputeId);

    return {
      success: true,
      message:
        analysis.verdict === "ESCALATE"
          ? "Dispute escalated to Tier 2 human mediation"
          : `Dispute resolved: ${analysis.verdict.replace("_", " ")}`,
    };
  } catch (error) {
    logger.error("applyResolution failed", error instanceof Error ? error : new Error(String(error)), { disputeId });
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
