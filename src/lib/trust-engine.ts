/**
 * Trust Engine - Central orchestrator for Digital Reputation Score (DRS) & Trust Gates.
 * Fetches real data from DB, runs the calculators from drs-score.ts, saves results.
 */

import prisma from "./db";
import { Prisma, ViolationType } from "@prisma/client";
import { createActivityLog } from "./audit";
import { logger } from "./logger";
import {
  calculateInfluencerDRS,
  calculateBrandDRS,
  calculateLevel,
  InfluencerDRSFactors,
  BrandDRSFactors,
  DRSResult,
  getDRSTierAndLimit,
} from "./drs-score";

// ==================== TRUST GATE (Deal Limit Enforcement) ====================

export interface TrustGateResult {
  allowed: boolean;
  maxDealAmount: number; // paise (-1 = unlimited)
  currentTier: string;
  currentScore: number;
  reason?: string;
}

/**
 * Check if a user can participate in a deal of the given amount.
 * Validates against their DRS Tier.
 */
export async function checkTrustGate(
  userId: string,
  dealAmountPaise: number,
): Promise<TrustGateResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { trustScore: true, userType: true, status: true },
  });

  if (!user) {
    return {
      allowed: false,
      maxDealAmount: 0,
      currentTier: "UNKNOWN",
      currentScore: 0,
      reason: "User not found",
    };
  }

  if (user.status === "BANNED" || user.status === "SUSPENDED") {
    return {
      allowed: false,
      maxDealAmount: 0,
      currentTier: "BANNED",
      currentScore: user.trustScore,
      reason: "Account is banned or suspended",
    };
  }

  const score = user.trustScore;
  // Use the shared getDRSTierAndLimit helper to get consistent logic
  const { tier, maxDealAmount } = getDRSTierAndLimit(score);

  if (tier === "FLAGGED") {
    return {
      allowed: false,
      maxDealAmount: 0,
      currentTier: tier,
      currentScore: score,
      reason: `DRS too low (${score}/900). Account flagged for manual review.`,
    };
  }

  if (maxDealAmount !== -1 && dealAmountPaise > maxDealAmount) {
    return {
      allowed: false,
      maxDealAmount,
      currentTier: tier,
      currentScore: score,
      reason: `Deal amount ₹${(dealAmountPaise / 100).toLocaleString("en-IN")} exceeds your '${tier}' tier limit. Improve your DRS to unlock higher limits.`,
    };
  }

  return {
    allowed: true,
    maxDealAmount,
    currentTier: tier,
    currentScore: score,
  };
}

// ==================== RECALCULATE & SAVE DRS ====================

type TrustTrigger =
  | "DEAL_COMPLETED"
  | "DEAL_VERIFIED"
  | "REVIEW_RECEIVED"
  | "DISPUTE_RESOLVED"
  | "CONTENT_REJECTED"
  | "LATE_DELIVERY"
  | "VERIFICATION_APPROVED"
  | "TERMS_VIOLATION"
  | "POST_DELETED"
  | "ADMIN_ADJUSTMENT";

/**
 * Recalculate DRS and Level for a user.
 * Fetches all relevant data, runs the calculator, saves the result.
 */
export async function updateTrustAndLevel(
  userId: string,
  trigger: TrustTrigger,
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        userType: true,
        xp: true,
        level: true,
        trustScore: true,
        createdAt: true,
        verificationLevel: true,
      },
    });

    if (!user) {
      logger.warn("updateTrustAndLevel: User not found", { userId, trigger });
      return;
    }

    let result: DRSResult | null = null;
    let newScore = user.trustScore;

    if (user.userType === "INFLUENCER") {
      result = await recalculateInfluencerDRSInternal(userId, user);
      newScore = result.score;
    } else if (user.userType === "BRAND") {
      result = await recalculateBrandDRSInternal(userId);
      newScore = result.score;
    } else {
      return;
    }

    // Deduct active progressive penalties from the last 90 days
    try {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 86400 * 1000);
      const recentViolations = await prisma.userViolation.findMany({
        where: {
          userId,
          createdAt: { gte: ninetyDaysAgo },
        },
      });

      let progressiveReduction = 0;
      for (const v of recentViolations) {
        let rawMetadata = null;
        if (v.metadata) {
          if (typeof v.metadata === "string") {
            rawMetadata = JSON.parse(v.metadata);
          } else {
            rawMetadata = v.metadata;
          }
        }
        const metadata =
          rawMetadata && typeof rawMetadata === "object"
            ? (rawMetadata as Record<string, unknown>)
            : null;
        if (metadata && typeof metadata.trustReduction === "number") {
          progressiveReduction += metadata.trustReduction;
        }
      }
      newScore = newScore - progressiveReduction;
    } catch (err) {
      logger.error("Failed to apply progressive penalty reduction during DRS calculation", err);
    }

    // Task 5: Enforce strict trust score range (300-900) and prevent overflow
    // This provides a final guard against manual adjustments or rounding errors.
    newScore = Math.max(300, Math.min(900, Math.round(newScore)));


    // Recalculate level from XP (retaining XP logic)
    const levelInfo = calculateLevel(user.xp)!;
    const newLevel = levelInfo.level;

    // Only update if something changed
    if (newScore !== user.trustScore || newLevel !== user.level) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          trustScore: newScore,
          level: newLevel,
        },
      });

      // Award new trust score badges dynamically if applicable
      try {
        const { checkAndAwardBadges } = await import("./gamification-engine");
        await checkAndAwardBadges(userId, "TRUST_UPDATED");
      } catch (badgeError) {
        logger.error("Failed to check badges after trust update", badgeError, { userId });
      }

      // Log the change
      if (result) {
        await createActivityLog({
          userId,
          action: "DRS_UPDATE",
          metadata: {
            trigger,
            oldScore: user.trustScore,
            newScore,
            oldLevel: user.level,
            newLevel,
            tier: result.tier,
            breakdown: result.breakdown,
          },
        });
      }

      logger.info("DRS updated", {
        userId,
        trigger,
        oldScore: user.trustScore,
        newScore,
        oldLevel: user.level,
        newLevel,
      });
    }
  } catch (error) {
    // Trust score failures should NOT crash the caller (e.g., deal completion)
    logger.error("updateTrustAndLevel failed — non-fatal", error, {
      userId,
      action: trigger,
    });
  }
}

// ==================== INFLUENCER DATA FETCHER ====================

async function recalculateInfluencerDRSInternal(
  userId: string,
  user: { createdAt: Date; verificationLevel: string },
): Promise<DRSResult> {
  // 1. Fetch Profile & Basics
  const profile = await prisma.influencerProfile.findUnique({
    where: { userId },
    select: {
      completedDeals: true,
      totalEarnings: true,
      instagramEngagementRate: true,
      bio: true,
      city: true,
      avatar: true,
    },
  });

  // 2. Fetch Reviews
  const reviews = await prisma.review.findMany({
    where: {
      deal: { influencer: { userId } },
      reviewerType: "BRAND",
    },
    select: { rating: true },
  });

  const fiveStarReviews = reviews.filter((r) => r.rating === 5).length;
  const poorReviews = reviews.filter((r) => r.rating <= 2).length;

  // 3. Fetch Deal Stats (On-time vs Late)
  const deals = await prisma.deal.findMany({
    where: {
      influencer: { userId },
      status: { in: ["VERIFIED", "COMPLETED"] },
    },
    select: {
      submittedAt: true,
      postingDeadline: true,
      revisionsUsed: true,
      maxRevisions: true,
    },
  });

  // On-Time: Submitted before deadline (if deadline exists) or handled quickly
  // Late: Submitted after deadline
  // Rejections: Revisions used > Max/2 ? Approx logic:
  // If revisionsUsed > 1, count as "Rejection" interaction
  const onTimeDeliveries = deals.filter(
    (d) =>
      d.postingDeadline &&
      d.submittedAt &&
      new Date(d.submittedAt) <= new Date(d.postingDeadline),
  ).length;
  const lateDeliveries = deals.filter(
    (d) =>
      d.postingDeadline &&
      d.submittedAt &&
      new Date(d.submittedAt) > new Date(d.postingDeadline),
  ).length;
  const contentRejections = deals.reduce(
    (acc: number, d) => acc + (d.revisionsUsed || 0),
    0,
  ); // Total revisions driven by rejections

  // 4. Fetch Disputes
  // Count resolved disputes — parse influencerOutcome JSON for reliable matching
  const resolvedDisputes = await prisma.dispute.findMany({
    where: {
      deal: { influencer: { userId } },
      status: "RESOLVED",
    },
    select: { resolution: true, influencerOutcome: true },
  });

  // Disputes "lost" = influencerOutcome JSON shows trust score penalty
  const disputesLost = resolvedDisputes.filter((d) => {
    try {
      if (!d.influencerOutcome) return false;
      const outcome = typeof d.influencerOutcome === "string"
        ? JSON.parse(d.influencerOutcome)
        : d.influencerOutcome;
      return typeof outcome === "object" && outcome !== null && outcome.trust_score_change < 0;
    } catch {
      return false;
    }
  }).length;

  const disputesWon = resolvedDisputes.length - disputesLost;

  // 5. Referrals
  const referralStats = await prisma.user.aggregate({
    where: { referredBy: userId, trustScore: { gte: 700 } }, // Quality referrals
    _count: true,
    _avg: { trustScore: true },
  });

  // 6. Violations & Fraud
  const termsViolationsCount = await prisma.userViolation.count({
    where: { userId, type: "TERMS_VIOLATION" },
  });

  const fraudViolations = await prisma.userViolation.count({
    where: { userId, type: "FRAUD" },
  });

  // 6. Profile Completeness
  let completeness = 0;
  if (profile?.bio) completeness += 20;
  if (profile?.avatar) completeness += 20;
  if (profile?.city) completeness += 20;
  if (user.verificationLevel !== "NONE") completeness += 40;

  const paymentFraudAttempts = await prisma.userViolation.count({
    where: { userId, type: "PAYMENT_FRAUD" as ViolationType },
  });

  // MAP TO DRS FACTORS
  const factors: InfluencerDRSFactors = {
    completedDeals: profile?.completedDeals || 0,
    totalEarningsPaise: profile?.totalEarnings || 0,
    fiveStarReviews,
    onTimeDeliveries,
    lateDeliveries,
    poorReviews,
    contentRejections,
    disputesLost,
    disputesWon,
    identityVerified:
      user.verificationLevel === "IDENTITY" ||
      user.verificationLevel === "FULL",
    accountAgeDays: Math.floor(
      (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24),
    ),
    engagementRate: profile?.instagramEngagementRate || 0,
    fakeFollowersDetected: fraudViolations > 0,
    termsViolations: termsViolationsCount,
    paymentFraudAttempts: paymentFraudAttempts,
    successfulReferrals: referralStats._count,
    avgReferralDRS: referralStats._avg.trustScore || 0,
    profileCompleteness: completeness,
  };

  return calculateInfluencerDRS(factors);
}

// ==================== BRAND DATA FETCHER ====================

async function recalculateBrandDRSInternal(userId: string): Promise<DRSResult> {
  const brandProfile = await prisma.brandProfile.findUnique({
    where: { userId },
    select: { id: true, isGstVerified: true },
  });

  const profileId = brandProfile?.id;
  const isVerified = brandProfile?.isGstVerified || false;

  // Count completed campaigns
  let completedCampaigns = 0;
  if (brandProfile) {
    completedCampaigns = await prisma.campaign.count({
      where: { brandId: brandProfile.id, status: "COMPLETED" },
    });
  }

  // Disputes — brand relations
  const disputeWhere = { deal: { brand: { userId } } };

  const resolvedDisputes = await prisma.dispute.findMany({
    where: {
      ...disputeWhere,
      status: "RESOLVED",
    },
    select: { resolution: true, brandOutcome: true },
  });

  const disputesLost = resolvedDisputes.filter((d) => {
    try {
      if (!d.brandOutcome) return false;
      const outcome = typeof d.brandOutcome === "string"
        ? JSON.parse(d.brandOutcome)
        : d.brandOutcome;
      return typeof outcome === "object" && outcome !== null && outcome.trust_score_change < 0;
    } catch {
      return false;
    }
  }).length;

  // Spec: Fair reviews from influencers (count reviews where influencer reviewed the brand)
  const dealWhereForBrand = brandProfile
    ? { brandId: brandProfile.id }
    : { brandId: "none" };

  const influencerReviews = await prisma.review.findMany({
    where: {
      deal: dealWhereForBrand,
      reviewerType: "INFLUENCER",
    },
    select: { rating: true },
  });
  const fairReviews = influencerReviews.filter(
    (r) => r.rating >= 4,
  ).length;

  // Spec: Long-term partnerships — count influencers worked with 3+ times
  const repeatInfluencers = profileId
    ? await prisma.deal.groupBy({
      by: ["influencerId"],
      where: {
        ...dealWhereForBrand,
        status: { in: ["COMPLETED", "VERIFIED"] },
      },
      _count: true,
      having: {
        influencerId: { _count: { gte: 3 } },
      },
    })
    : [];
  const longTermPartnerships = repeatInfluencers.length;

  // Spec: Unfair rejections — deals rejected by brand then overturned
  const unfairRejections = resolvedDisputes.filter((d) => {
    try {
      if (!d.brandOutcome) return false;
      const outcome = typeof d.brandOutcome === "string"
        ? JSON.parse(d.brandOutcome)
        : d.brandOutcome;
      return typeof outcome === "object" && outcome !== null && outcome.trust_score_change < 0 && outcome.refund_percentage < 100;
    } catch {
      return false;
    }
  }).length;

  // Spec: Influencer complaints — open/resolved disputes raised by influencers against this brand
  const influencerComplaints = await prisma.dispute.count({
    where: {
      ...disputeWhere,
      raisedBy: { userType: "INFLUENCER" },
    },
  });

  const factors: BrandDRSFactors = {
    completedCampaigns: completedCampaigns,
    fastApprovals: completedCampaigns, // Assume efficient until we have real timing data
    lateApprovals: await calculateLateApprovals(userId, dealWhereForBrand),
    fairReviews,
    disputesLost,
    companyVerified: isVerified,
    paymentReliability: 1.0,
    termsViolations: 0,
    longTermPartnerships,
    unfairRejections,
    influencerComplaints,
  };

  return calculateBrandDRS(factors);
}

async function calculateLateApprovals(
  userId: string,
  dealWhere: Prisma.DealWhereInput,
): Promise<number> {
  const deals = await prisma.deal.findMany({
    where: {
      ...dealWhere,
      status: { in: ["COMPLETED", "VERIFIED", "CONTENT_APPROVED"] },
      submittedAt: { not: null },
      approvedAt: { not: null },
    },
    select: {
      submittedAt: true,
      approvedAt: true,
      reviewPeriodHours: true,
    },
  });

  return deals.filter((d) => {
    if (!d.submittedAt || !d.approvedAt) return false;
    const submitted = new Date(d.submittedAt).getTime();
    const approved = new Date(d.approvedAt).getTime();
    const allowedDuration = (d.reviewPeriodHours || 48) * 3600 * 1000;
    return approved - submitted > allowedDuration;
  }).length;
}
