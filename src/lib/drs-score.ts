/**
 * Digital Reputation Score (DRS) Calculator
 * Advanced rule-based system for calculating user reputation.
 * Replaces the legacy Trust Score system.
 */

// ==================== INFLUENCER DRS ====================

export interface InfluencerDRSFactors {
  completedDeals: number;
  fiveStarReviews: number;
  onTimeDeliveries: number;
  lateDeliveries: number;
  poorReviews: number;
  contentRejections: number;
  disputesLost: number;
  disputesWon: number;
  identityVerified: boolean;
  accountAgeDays: number;
  engagementRate: number;
  fakeFollowersDetected: boolean;
  termsViolations: number;
  paymentFraudAttempts: number; // Specifies a permanent ban offense
  avgReferralDRS: number; // Average DRS of users referred by this influencer
  successfulReferrals: number; // Count of ACTIVE referred users
  profileCompleteness: number; // Percentage 0-100
}

export interface DRSResult {
  score: number;
  tier: "FLAGGED" | "LIMITED" | "NORMAL" | "TRUSTED" | "ELITE";
  maxDealAmount: number; // in paise
  breakdown: {
    factor: string;
    impact: number;
    reason: string;
  }[];
}

export function calculateInfluencerDRS(
  factors: InfluencerDRSFactors,
): DRSResult {
  const breakdown: DRSResult["breakdown"] = [];
  let score = 50; // Starting score

  // === PERFORMANCE ===
  const dealBonus = factors.completedDeals * 2;
  if (dealBonus > 0) {
    score += dealBonus;
    breakdown.push({
      factor: "Deal Experience",
      impact: dealBonus,
      reason: `${factors.completedDeals} deals completed`,
    });
  }

  // === QUALITY ===
  const reviewBonus = factors.fiveStarReviews * 5;
  if (reviewBonus > 0) {
    score += reviewBonus;
    breakdown.push({
      factor: "5-Star Quality",
      impact: reviewBonus,
      reason: `${factors.fiveStarReviews} perfect reviews`,
    });
  }

  // === RELIABILITY ===
  const onTimeBonus = factors.onTimeDeliveries * 3;
  if (onTimeBonus > 0) {
    score += onTimeBonus;
    breakdown.push({
      factor: "Reliability",
      impact: onTimeBonus,
      reason: `${factors.onTimeDeliveries} on-time deliveries`,
    });
  }

  // === VERIFICATION & IDENTITY ===
  if (factors.identityVerified) {
    score += 10;
    breakdown.push({
      factor: "Identity Verified",
      impact: 10,
      reason: "Identity verification complete",
    });
  }

  // === ACCOUNT AGE ===
  if (factors.accountAgeDays >= 365) {
    score += 5;
    breakdown.push({
      factor: "Account Age",
      impact: 5,
      reason: "Account > 1 year old",
    });
  }

  // === HIGH ENGAGEMENT RATE ===
  if (factors.engagementRate >= 3.0) {
    score += 10;
    breakdown.push({
      factor: "High Engagement",
      impact: 10,
      reason: `Healthy engagement rate detected`,
    });
  }

  // === ZERO DISPUTES BONUS ===
  if (
    factors.completedDeals >= 50 &&
    factors.disputesLost === 0 &&
    factors.disputesWon === 0
  ) {
    score += 15;
    breakdown.push({
      factor: "Dispute-Free Record",
      impact: 15,
      reason: `50+ deals with zero disputes`,
    });
  }

  // === NEGATIVE FACTORS (Penalties) ===

  if (factors.lateDeliveries > 0) {
    const penalty = factors.lateDeliveries * 5;
    score -= penalty;
    breakdown.push({
      factor: "Late Deliveries",
      impact: -penalty,
      reason: `${factors.lateDeliveries} late deliveries`,
    });
  }

  if (factors.poorReviews > 0) {
    const penalty = factors.poorReviews * 10;
    score -= penalty;
    breakdown.push({
      factor: "Negative Reviews",
      impact: -penalty,
      reason: `${factors.poorReviews} poor ratings`,
    });
  }

  if (factors.contentRejections > 0) {
    const penalty = factors.contentRejections * 3;
    score -= penalty;
    breakdown.push({
      factor: "Content Rejections",
      impact: -penalty,
      reason: `${factors.contentRejections} content rejections`,
    });
  }

  if (factors.disputesLost > 0) {
    const penalty = factors.disputesLost * 15;
    score -= penalty;
    breakdown.push({
      factor: "Disputes Raised/Lost",
      impact: -penalty,
      reason: `${factors.disputesLost} disputes recorded`,
    });
  }

  if (factors.fakeFollowersDetected) {
    score -= 20;
    breakdown.push({
      factor: "AI Fraud Detection",
      impact: -20,
      reason: "Fake followers anomaly detected",
    });
  }

  if (factors.termsViolations > 0) {
    const penalty = factors.termsViolations * 50;
    score -= penalty;
    breakdown.push({
      factor: "Terms Violation",
      impact: -penalty,
      reason: `${factors.termsViolations} TOS violations`,
    });
  }

  if (factors.paymentFraudAttempts > 0) {
    score -= 100;
    breakdown.push({
      factor: "Fraud Attempt",
      impact: -100,
      reason: "Payment fraud triggers permanent ban logic",
    });
  }

  // Cap score 0-100
  score = Math.max(0, Math.min(100, score));

  // Determine Tier
  let tier: DRSResult["tier"];
  let maxDealAmount: number;

  if (score <= 30) {
    tier = "FLAGGED";
    maxDealAmount = 0;
  } else if (score <= 50) {
    tier = "LIMITED";
    maxDealAmount = 500000;   // ₹5K
  } else if (score <= 70) {
    tier = "NORMAL";
    maxDealAmount = 2500000;  // ₹25K
  } else if (score <= 85) {
    tier = "TRUSTED";
    maxDealAmount = 10000000; // ₹1L
  } else {
    tier = "ELITE";
    maxDealAmount = -1;       // Unlimited
  }

  return { score, tier, maxDealAmount, breakdown };
}

// ==================== BRAND DRS ====================

export interface BrandDRSFactors {
  completedCampaigns: number;
  fastApprovals: number;
  lateApprovals: number;
  fairReviews: number;
  disputesLost: number;
  companyVerified: boolean;
  paymentReliability: number;
  termsViolations: number;
  // Spec additions
  longTermPartnerships: number; // Spec: Long-term partnership +5
  unfairRejections: number; // Spec: Unfair rejections -10
  influencerComplaints: number; // Spec: Influencer complaints -15
}

export function calculateBrandDRS(factors: BrandDRSFactors): DRSResult {
  const breakdown: DRSResult["breakdown"] = [];
  let score = 40; // Brands start at 40

  // === ACTIVITY ===
  const campaignBonus = factors.completedCampaigns * 3;
  if (campaignBonus > 0) {
    score += campaignBonus;
    breakdown.push({
      factor: "Campaign History",
      impact: campaignBonus,
      reason: `${factors.completedCampaigns} campaigns completed`,
    });
  }

  // === AGILITY ===
  const approvalBonus = factors.fastApprovals * 2;
  if (approvalBonus > 0) {
    score += approvalBonus;
    breakdown.push({
      factor: "Fast Approvals",
      impact: approvalBonus,
      reason: `${factors.fastApprovals} quick approvals`,
    });
  }

  // === RELIABILITY ===
  if (factors.paymentReliability >= 0.98 && factors.completedCampaigns > 0) {
    score += 10;
    breakdown.push({
      factor: "Payment Reliability",
      impact: 10,
      reason: "High payment success rate",
    });
  }

  if (factors.companyVerified) {
    score += 15;
    breakdown.push({
      factor: "Business Verified",
      impact: 15,
      reason: "Company registration verified",
    });
  }

  // === LONG TERM PARTNERSHIPS ===
  if (factors.longTermPartnerships > 0) {
    const partnerBonus = factors.longTermPartnerships * 5;
    score += partnerBonus;
    breakdown.push({
      factor: "Long-term Partnerships",
      impact: partnerBonus,
      reason: `${factors.longTermPartnerships} repeat influencer relationships`,
    });
  }

  // === FAIR REVIEWS ===
  if (factors.fairReviews > 0) {
    const fairBonus = factors.fairReviews * 5;
    score += fairBonus;
    breakdown.push({
      factor: "Fair Reviews",
      impact: fairBonus,
      reason: `${factors.fairReviews} fair reviews given to influencers`,
    });
  }

  // === PENALTIES ===
  if (factors.lateApprovals > 0) {
    const penalty = factors.lateApprovals * 3;
    score -= penalty;
    breakdown.push({
      factor: "Slow Responses",
      impact: -penalty,
      reason: `${factors.lateApprovals} delays in approval`,
    });
  }

  if (factors.unfairRejections > 0) {
    const penalty = factors.unfairRejections * 10;
    score -= penalty;
    breakdown.push({
      factor: "Unfair Rejections",
      impact: -penalty,
      reason: `${factors.unfairRejections} unfair content rejections`,
    });
  }

  if (factors.disputesLost > 0) {
    const penalty = factors.disputesLost * 20;
    score -= penalty;
    breakdown.push({
      factor: "Payment Disputes",
      impact: -penalty,
      reason: `${factors.disputesLost} payment disputes`,
    });
  }

  if (factors.influencerComplaints > 0) {
    const penalty = factors.influencerComplaints * 15;
    score -= penalty;
    breakdown.push({
      factor: "Influencer Complaints",
      impact: -penalty,
      reason: `${factors.influencerComplaints} complaints received`,
    });
  }

  if (factors.termsViolations > 0) {
    const penalty = factors.termsViolations * 100;
    score -= penalty;
    breakdown.push({
      factor: "Terms Violation",
      impact: -penalty,
      reason: `${factors.termsViolations} TOS violations`,
    });
  }

  score = Math.max(0, Math.min(100, score));

  // Determine Tier
  let tier: DRSResult["tier"];
  let maxDealAmount: number;

  if (score <= 30) {
    tier = "FLAGGED";
    maxDealAmount = 0;
  } else if (score <= 50) {
    tier = "LIMITED";
    maxDealAmount = 500000;   // ₹5K
  } else if (score <= 70) {
    tier = "NORMAL";
    maxDealAmount = 2500000;  // ₹25K
  } else if (score <= 85) {
    tier = "TRUSTED";
    maxDealAmount = 10000000; // ₹1L
  } else {
    tier = "ELITE";
    maxDealAmount = -1;       // Unlimited
  }

  return { score, tier, maxDealAmount, breakdown };
}

// ==================== LEVELS ====================

export const LEVELS = [
  { level: 1, name: "Rookie", minXP: 0 },
  { level: 2, name: "Rising Star", minXP: 101 },
  { level: 3, name: "Creator", minXP: 501 },
  { level: 4, name: "Pro", minXP: 1501 },
  { level: 5, name: "Expert", minXP: 3001 },
  { level: 6, name: "Elite", minXP: 6001 },
  { level: 7, name: "Master", minXP: 10001 },
  { level: 8, name: "Champion", minXP: 20001 },
  { level: 9, name: "Icon", minXP: 40001 },
  { level: 10, name: "Legend", minXP: 75000 },
] as const;

export function calculateLevel(xp: number) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i]!.minXP) return LEVELS[i]!;
  }
  return LEVELS[0]!;
}

// Spec: Higher search ranking + lower platform fees per level
// 10% (base) → 9% (level 4+) → 8% (level 6+) → 7% (level 8+)
export function getPlatformFeePercentage(level: number): number {
  if (level >= 8) return 7; // Champion, Icon, Legend
  if (level >= 6) return 8; // Elite, Master
  if (level >= 4) return 9; // Pro, Expert
  return 10; // Rookie, Rising Star, Creator
}
