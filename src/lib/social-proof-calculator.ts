/**
 * Social Proof Calculator — Rule-Based Follower Authenticity & Content Quality Scoring
 *
 * Calculates followerAuthenticityScore and contentQualityScore for influencers.
 * Runs on profile creation and periodically via weekly cron.
 *
 * STRICT RULE-BASED LOGIC ONLY — NO ML.
 */

import prisma from "./db";
import { logger } from "./logger";

// ==================== TYPES ====================

export interface SocialProofResult {
  followerAuthenticityScore: number; // 0-100
  contentQualityScore: number; // 0-100
  breakdown: SocialProofBreakdown;
}

export interface SocialProofBreakdown {
  // Authenticity factors
  engagementRateScore: number;
  followingRatioScore: number;
  accountAgeScore: number;
  commentDiversityScore: number;
  growthConsistencyScore: number;
  // Quality factors
  avgEngagementScore: number;
  postingConsistencyScore: number;
  contentVarietyScore: number;
  completionRateScore: number;
}

// ==================== MAIN CALCULATORS ====================

/**
 * Calculate follower authenticity score based on engagement patterns.
 * Higher score = more likely real followers.
 */
export function calculateFollowerAuthenticity(params: {
  followers: number;
  following: number;
  engagementRate: number; // Average engagement rate %
  accountAgeDays: number;
  avgCommentsPerPost: number;
  avgLikesPerPost: number;
  uniqueCommentersRatio: number; // 0-1 (unique commenters / total comments sampled)
  followerGrowthMonthly: number; // % monthly growth
}): number {
  let score = 50; // Base score

  // Factor 1: Engagement Rate vs Follower Count (25 points)
  // Industry benchmarks:
  // Nano (1K-10K): 4-6% → +25
  // Micro (10K-50K): 2-4% → +20
  // Mid (50K-500K): 1-3% → +15
  // Macro (500K+): 0.5-2% → +10
  // Too high or zero = suspicious
  const engagementScore = calculateEngagementScore(
    params.followers,
    params.engagementRate,
  );
  score += engagementScore;

  // Factor 2: Following/Follower Ratio (15 points)
  // Good: < 0.5 (not a follow-back farm)
  // Warning: 0.5-1.0
  // Bad: > 1.0 (follows more than followers — possible fake)
  if (params.followers > 0) {
    const ratio = params.following / params.followers;
    if (ratio < 0.3) score += 15;
    else if (ratio < 0.5) score += 10;
    else if (ratio < 1.0) score += 5;
    else score -= 10; // Following more than followers
  }

  // Factor 3: Account Age vs Follower Count (10 points)
  // Legit growth: ~100-500 followers/month for nano/micro
  // Suspicious: > 10K followers in < 90 days
  if (params.accountAgeDays > 0) {
    const followersPerDay = params.followers / params.accountAgeDays;
    if (followersPerDay < 50)
      score += 10; // Organic growth
    else if (followersPerDay < 200)
      score += 5; // Fast but plausible
    else score -= 10; // Suspiciously fast
  }

  // Factor 4: Comment Diversity (10 points)
  // High unique commenters = real engagement
  // Low diversity = bot comments
  if (params.uniqueCommentersRatio > 0.8) score += 10;
  else if (params.uniqueCommentersRatio > 0.5) score += 5;
  else if (params.uniqueCommentersRatio < 0.3) score -= 5;

  // Factor 5: Growth Consistency (10 points)
  // Steady monthly growth vs wild spikes
  if (params.followerGrowthMonthly >= 0 && params.followerGrowthMonthly < 10)
    score += 10;
  else if (params.followerGrowthMonthly < 20) score += 5;
  else if (params.followerGrowthMonthly > 50) score -= 10; // Spike

  // Clamp to 0-100
  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate content quality score based on posting patterns and engagement.
 */
export function calculateContentQuality(params: {
  avgEngagementRate: number; // Average across last 10 posts
  postingFrequencyPerWeek: number; // Posts per week
  contentTypeVariety: number; // Number of different content types used (1-5)
  completedDeals: number;
  totalDeals: number;
  averageRating: number; // 0-5
  onTimeDeliveryRate: number; // 0-1
}): number {
  let score = 50; // Base score

  // Factor 1: Average Engagement (20 points)
  if (params.avgEngagementRate > 3) score += 20;
  else if (params.avgEngagementRate > 2) score += 15;
  else if (params.avgEngagementRate > 1) score += 10;
  else if (params.avgEngagementRate > 0.5) score += 5;
  else score -= 5;

  // Factor 2: Posting Consistency (10 points)
  // 2-5 posts/week is ideal
  if (
    params.postingFrequencyPerWeek >= 2 &&
    params.postingFrequencyPerWeek <= 5
  )
    score += 10;
  else if (
    params.postingFrequencyPerWeek >= 1 &&
    params.postingFrequencyPerWeek <= 7
  )
    score += 5;
  else if (params.postingFrequencyPerWeek > 10) score -= 5; // Spammy

  // Factor 3: Content Variety (5 points)
  if (params.contentTypeVariety >= 3) score += 5;
  else if (params.contentTypeVariety >= 2) score += 3;

  // Factor 4: Deal Completion Rate (10 points)
  if (params.totalDeals > 0) {
    const completionRate = params.completedDeals / params.totalDeals;
    if (completionRate >= 0.9) score += 10;
    else if (completionRate >= 0.7) score += 5;
    else if (completionRate < 0.5) score -= 5;
  }

  // Factor 5: Rating (10 points)
  if (params.averageRating >= 4.5) score += 10;
  else if (params.averageRating >= 4.0) score += 7;
  else if (params.averageRating >= 3.5) score += 4;
  else if (params.averageRating < 3.0 && params.averageRating > 0) score -= 5;

  // Factor 6: On-time delivery (5 points)
  if (params.onTimeDeliveryRate >= 0.9) score += 5;
  else if (params.onTimeDeliveryRate >= 0.7) score += 3;
  else if (params.onTimeDeliveryRate < 0.5 && params.totalDeals > 0) score -= 3;

  return Math.max(0, Math.min(100, score));
}

// ==================== ORCHESTRATOR ====================

/**
 * Recalculate and save social proof scores for a specific influencer.
 */
export async function recalculateSocialProof(
  userId: string,
): Promise<SocialProofResult | null> {
  try {
    const profile = await prisma.influencerProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        instagramFollowers: true,
        instagramEngagementRate: true,
        youtubeSubscribers: true,
        youtubeEngagementRate: true,
        totalDeals: true,
        completedDeals: true,
        averageRating: true,
        accountAge: true,
        user: {
          select: { createdAt: true },
        },
      },
    });

    if (!profile) {
      logger.warn("recalculateSocialProof: Profile not found", { userId });
      return null;
    }

    // Fetch deal stats for quality calculation
    const deals = await prisma.deal.findMany({
      where: {
        influencer: { userId },
        status: { in: ["VERIFIED", "COMPLETED"] },
      },
      select: {
        submittedAt: true,
        postingDeadline: true,
      },
    });

    const onTimeDeals = deals.filter(
      (d: any) =>
        d.postingDeadline &&
        d.submittedAt &&
        new Date(d.submittedAt) <= new Date(d.postingDeadline),
    ).length;
    const onTimeRate = deals.length > 0 ? onTimeDeals / deals.length : 1;

    const followers =
      profile.instagramFollowers || profile.youtubeSubscribers || 0;
    const engagementRate =
      profile.instagramEngagementRate || profile.youtubeEngagementRate || 0;
    const accountAgeDays = Math.floor(
      (Date.now() -
        new Date(profile.accountAge || profile.user.createdAt).getTime()) /
      (86400 * 1000),
    );

    // Calculate scores
    const followerAuthenticityScore = calculateFollowerAuthenticity({
      followers,
      following: 0, // Would need API data in production
      engagementRate,
      accountAgeDays,
      avgCommentsPerPost: 0, // Would need API data
      avgLikesPerPost: 0, // Would need API data
      uniqueCommentersRatio: 0.7, // Default assumption
      followerGrowthMonthly: 5, // Default assumption (steady growth)
    });

    const contentQualityScore = calculateContentQuality({
      avgEngagementRate: engagementRate,
      postingFrequencyPerWeek: 3, // Default assumption
      contentTypeVariety: 2, // Default assumption
      completedDeals: profile.completedDeals,
      totalDeals: profile.totalDeals,
      averageRating: profile.averageRating,
      onTimeDeliveryRate: onTimeRate,
    });

    // Save to profile
    await prisma.influencerProfile.update({
      where: { userId },
      data: {
        followerAuthenticityScore,
        contentQualityScore,
      },
    });

    const result: SocialProofResult = {
      followerAuthenticityScore,
      contentQualityScore,
      breakdown: {
        engagementRateScore: calculateEngagementScore(
          followers,
          engagementRate,
        ),
        followingRatioScore: 10, // Default without API data
        accountAgeScore: accountAgeDays > 180 ? 10 : 5,
        commentDiversityScore: 7, // Default
        growthConsistencyScore: 10, // Default
        avgEngagementScore: engagementRate > 2 ? 15 : 10,
        postingConsistencyScore: 5,
        contentVarietyScore: 3,
        completionRateScore:
          profile.totalDeals > 0
            ? Math.round((profile.completedDeals / profile.totalDeals) * 10)
            : 5,
      },
    };

    logger.info("Social proof recalculated", {
      userId,
      followerAuthenticityScore,
      contentQualityScore,
    });

    return result;
  } catch (error) {
    logger.error("recalculateSocialProof failed", error, { userId });
    return null;
  }
}

/**
 * Batch recalculate social proof for all active influencers.
 * Used by the weekly cron job.
 */
export async function recalculateAllSocialProof(): Promise<{
  processed: number;
  failed: number;
}> {
  const influencers = await prisma.influencerProfile.findMany({
    where: {
      user: { status: "ACTIVE" },
    },
    select: { userId: true },
  });

  let processed = 0;
  let failed = 0;

  for (const inf of influencers) {
    try {
      const result = await recalculateSocialProof(inf.userId);
      if (result) {
        processed++;
      } else {
        failed++;
      }
    } catch (error) {
      logger.error("Batch social proof failed for user", error, {
        userId: inf.userId,
      });
      failed++;
    }

    // Rate limit: don't overwhelm DB (50ms between each)
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return { processed, failed };
}

// ==================== HELPERS ====================

function calculateEngagementScore(
  followers: number,
  engagementRate: number,
): number {
  if (followers < 10000) {
    // Nano: 4-6% expected
    if (engagementRate >= 4 && engagementRate <= 10) return 25;
    if (engagementRate >= 2 && engagementRate < 4) return 15;
    if (engagementRate > 10 && engagementRate <= 20) return 10; // High but possible
    if (engagementRate > 20) return -10; // Suspicious
    return 5;
  } else if (followers < 50000) {
    // Micro: 2-4% expected
    if (engagementRate >= 2 && engagementRate <= 6) return 20;
    if (engagementRate >= 1 && engagementRate < 2) return 10;
    if (engagementRate > 10) return -5;
    return 5;
  } else if (followers < 500000) {
    // Mid: 1-3% expected
    if (engagementRate >= 1 && engagementRate <= 5) return 15;
    if (engagementRate >= 0.5 && engagementRate < 1) return 8;
    if (engagementRate > 8) return -5;
    return 3;
  } else {
    // Macro: 0.5-2% expected
    if (engagementRate >= 0.5 && engagementRate <= 3) return 10;
    if (engagementRate >= 0.2 && engagementRate < 0.5) return 5;
    if (engagementRate > 5) return -5;
    return 2;
  }
}
