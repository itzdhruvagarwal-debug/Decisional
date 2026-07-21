import prisma from "./db";
import { Prisma, PrismaClient } from "@prisma/client";
import { BADGES, BadgeDefinition } from "./badges";
import { calculateLevel } from "./drs-score";
import { NotificationService } from "@/services/notification.service";
import { logger } from "./logger";
import { createActivityLog } from "./audit";

/** Either prisma client or a transaction client — used as db param throughout */
type DbClient = PrismaClient | Prisma.TransactionClient;

/** Minimal user shape fetched by checkAndAwardBadges */
interface GamificationUser {
  id: string;
  userType: string;
  trustScore: number;
  verificationLevel?: string | null;
  influencerProfile: {
    id: string;
    bio?: string | null;
    categories?: string | null;
    city?: string | null;
    completedDeals: number;
    averageRating?: number;
    instagramFollowers?: number | null;
    instagramEngagementRate?: number | null;
    youtubeEngagementRate?: number | null;
  } | null;
  brandProfile: {
    id: string;
    description?: string | null;
    industry?: string | null;
    companyName?: string;
    totalCampaigns: number;
  } | null;
  badges: { badgeId: string }[];
}

/**
 * Gamification Engine
 * Handles badge awarding, XP calculation, and level updates.
 */

export async function finalizeDealGamification(
  userId: string,
  amount: number,
  tx: Prisma.TransactionClient,
  options?: {
    skipReferral?: boolean;
    treasuryWalletId?: string;
    dealId?: string;
  }
) {
  // Update influencer profile stats
  await tx.influencerProfile.update({
    where: { userId },
    data: {
      completedDeals: { increment: 1 },
      totalEarnings: { increment: amount },
    },
  });

  // Award XP for completing deal
  await addUserXp(userId, 100, "DEAL_COMPLETED", tx);

  let referralResult;
  if (!options?.skipReferral) {
    try {
      const { processReferralReward } = await import("./referral-engine");
      referralResult = await processReferralReward(userId, amount, tx, options?.treasuryWalletId, options?.dealId);
    } catch (err) {
      logger.warn("Non-blocking referral reward processing failed", {
        error: err instanceof Error ? err.message : String(err),
        userId,
        dealId: options?.dealId,
      });
    }
  }

  await checkAndAwardBadges(userId, "DEAL_COMPLETED", tx);
  return referralResult;
}

export async function awardBadgeIfNotExists(
  userId: string,
  badgeId: string,
  tx?: Prisma.TransactionClient,
) {
  const db = tx || prisma;
  const badgeDef = BADGES.find((b) => b.id === badgeId);
  if (!badgeDef) return;

  await awardBadges(userId, [badgeDef], db);
}

const TRIGGER_TO_BADGES: Record<string, string[]> = {
  CAMPAIGN_CREATED: [
    "first_campaign",
    "campaign_master",
    "big_spender",
    "mega_campaign",
    "fast_approver",
    "roi_master",
    "partnership_pro",
    "fair_payer",
  ],
  DEAL_COMPLETED: [
    "first_deal",
    "five_deals",
    "ten_deals",
    "twenty_five_deals",
    "fifty_deals",
    "hundred_deals",
    "five_hundred_deals",
    "thousand_deals",
    "earn_1k",
    "earn_10k",
    "earn_50k",
    "earn_1lakh",
    "earn_5lakh",
    "earn_10lakh",
    "earn_1crore",
    "fraud_shield",
    "strict_compliance",
    "cibil_elite",
    "deal_streak_5",
    "deal_streak_10",
    "fast_earner",
    "speed_demon",
    "early_bird",
    "no_revisions",
    "night_owl",
    "weekend_warrior",
    "diverse_portfolio",
    "loyalist",
    "perfect_rating",
    "category_king",
    "city_champion",
    "holiday_special",
    "trendsetter",
    "viral_post",
  ],
  VERIFICATION: ["verified_identity", "profile_complete", "social_connected", "verified_pro"],
  LOGIN: [
    "first_login",
    "profile_complete",
    "highly_responsive",
    "comeback_kid",
    "bug_reporter",
    "feedback_giver",
    "beta_tester",
    "mystery_badge",
  ],
  REFERRAL: ["first_referral", "five_referrals", "ten_referrals", "referral_king"],
  FIRST_REVIEW: ["first_5_star", "five_5_star", "ten_5_star", "creative_genius"],
  FIVE_STAR_RATING: ["first_5_star", "five_5_star", "ten_5_star", "creative_genius"],
  REVIEW_RECEIVED: ["first_5_star", "five_5_star", "ten_5_star", "creative_genius"],
  TRUST_UPDATED: ["trust_novice", "trust_prime", "trust_super_prime", "trust_sovereign", "cibil_elite"],
};

async function checkMilestoneEarningsReferrals(
  badgeId: string,
  user: GamificationUser,
  db: DbClient,
  wallet: { totalEarned: number } | null
): Promise<boolean> {
  if (badgeId.startsWith("first_deal") || badgeId.endsWith("_deals")) {
    return await checkDealCount(user, badgeId, db);
  }
  if (badgeId.startsWith("earn_")) {
    return await checkEarnings(user, badgeId, db, wallet);
  }
  if (badgeId.endsWith("_referral") || badgeId.endsWith("_referrals") || badgeId === "referral_king") {
    return await checkReferralCount(user, badgeId, db);
  }
  return false;
}

async function checkVerificationReviews(
  badgeId: string,
  userId: string,
  user: GamificationUser,
  db: DbClient,
  influencerProfile: GamificationUser["influencerProfile"],
  brandProfile: GamificationUser["brandProfile"]
): Promise<boolean> {
  switch (badgeId) {
    case "verified_identity":
      return user.verificationLevel === "IDENTITY" || user.verificationLevel === "FULL";
    case "social_connected": {
      const [insta, yt] = await Promise.all([
        db.oAuthAccount.findFirst({ where: { userId, provider: "instagram" } }),
        db.oAuthAccount.findFirst({ where: { userId, provider: "youtube" } }),
      ]);
      return !!(insta && yt);
    }
    case "verified_pro": {
      const profile = user.influencerProfile;
      if (profile) {
        const followers = profile.instagramFollowers || 0;
        const er = profile.instagramEngagementRate || 0;
        return followers >= 10000 && er >= 300;
      }
      return false;
    }
    case "profile_complete":
      if (user.userType === "INFLUENCER" && user.influencerProfile?.bio && user.influencerProfile?.categories) return true;
      if (user.userType === "BRAND" && user.brandProfile?.description && user.brandProfile?.industry) return true;
      return false;
    case "first_5_star":
      return await checkReviews(user.id, 1, 5, db, influencerProfile, brandProfile);
    case "five_5_star":
      return await checkReviews(user.id, 5, 5, db, influencerProfile, brandProfile);
    case "ten_5_star":
      return await checkReviews(user.id, 10, 5, db, influencerProfile, brandProfile);
    default:
      return false;
  }
}

async function checkDealStreak(badgeId: string, userId: string, db: DbClient, startOfMonth: Date): Promise<boolean> {
  const count = await db.deal.count({
    where: { influencerId: userId, status: "COMPLETED", completedAt: { gte: startOfMonth } },
  });
  if (badgeId === "deal_streak_5") return count >= 5;
  if (badgeId === "deal_streak_10") return count >= 10;
  return false;
}

async function checkFinancialStreak(badgeId: string, userId: string, db: DbClient, startOfMonth: Date): Promise<boolean> {
  if (badgeId === "fast_earner") {
    const monthlyPayouts = await db.transaction.aggregate({
      where: {
        wallet: { userId },
        type: "CREDIT",
        dealId: { not: null },
        createdAt: { gte: startOfMonth },
      },
      _sum: { amount: true },
    });
    const earnedAmount = monthlyPayouts?._sum?.amount ?? 0;
    return earnedAmount >= 5000000;
  }
  return false;
}

async function checkSpeedAndTimingStreak(badgeId: string, userId: string, db: DbClient): Promise<boolean> {
  if (badgeId === "speed_demon") {
    const speedDeals = await db.deal.findMany({
      where: { influencerId: userId, status: "COMPLETED", submittedAt: { not: null }, startedAt: { not: null } },
      select: { submittedAt: true, startedAt: true },
    });
    return speedDeals.some((d: { submittedAt: Date | null; startedAt: Date | null }) => {
      const diff = new Date(d.submittedAt!).getTime() - new Date(d.startedAt!).getTime();
      return diff <= 24 * 60 * 60 * 1000;
    });
  }
  if (badgeId === "early_bird") {
    const earlyDeals = await db.deal.findMany({
      where: { influencerId: userId, status: "COMPLETED", submittedAt: { not: null } },
      select: { submittedAt: true, submissionDeadline: true },
    });
    const earlyCount = earlyDeals.filter((d: { submittedAt: Date | null; submissionDeadline: Date }) => new Date(d.submittedAt!).getTime() < new Date(d.submissionDeadline).getTime()).length;
    return earlyCount >= 5;
  }
  if (badgeId === "night_owl") {
    const nightDeals = await db.deal.findMany({
      where: { influencerId: userId, status: "COMPLETED", submittedAt: { not: null } },
      select: { submittedAt: true },
    });
    return nightDeals.some((d: { submittedAt: Date | null }) => {
      const hour = new Date(d.submittedAt!).getHours();
      return hour >= 2 && hour < 5;
    });
  }
  if (badgeId === "weekend_warrior") {
    const weekendDeals = await db.deal.findMany({
      where: { influencerId: userId, status: "COMPLETED", completedAt: { not: null } },
      select: { completedAt: true },
    });
    return weekendDeals.some((d: { completedAt: Date | null }) => new Date(d.completedAt!).getDay() === 0);
  }
  return false;
}

async function checkPortfolioAndLoyaltyStreak(badgeId: string, userId: string, db: DbClient): Promise<boolean> {
  if (badgeId === "diverse_portfolio") {
    const portfolioDeals = await db.deal.findMany({
      where: { influencerId: userId, status: "COMPLETED" },
      include: { campaign: { select: { targetCategories: true } } },
    });
    const categoriesSet = new Set<string>();
    for (const deal of portfolioDeals) {
      if (deal.campaign?.targetCategories) {
        for (const cat of deal.campaign.targetCategories) {
          categoriesSet.add(cat);
        }
      }
    }
    return categoriesSet.size >= 5;
  }
  if (badgeId === "loyalist") {
    const loyaltyGroups = await db.deal.groupBy({
      by: ["brandId"],
      where: { influencerId: userId, status: "COMPLETED", brandId: { not: null } },
      _count: { id: true },
    });
    return loyaltyGroups.some((group: { _count: { id: number | null } }) => (group._count.id ?? 0) >= 5);
  }
  return false;
}

async function checkRatingAndViralStreak(badgeId: string, userId: string, db: DbClient, influencerProfile: GamificationUser["influencerProfile"]): Promise<boolean> {
  if (badgeId === "perfect_rating") {
    const rating = influencerProfile?.averageRating || 0;
    const completedDeals = influencerProfile?.completedDeals || 0;
    return completedDeals >= 10 && rating === 500;
  }
  if (badgeId === "creative_genius") {
    const creativeReviews = await db.review.findFirst({
      where: {
        receiverId: userId,
        comment: { contains: "creative", mode: "insensitive" },
      },
    });
    return !!creativeReviews;
  }
  if (badgeId === "viral_post") {
    const igAvg = influencerProfile?.instagramEngagementRate || 0;
    const ytAvg = influencerProfile?.youtubeEngagementRate || 0;
    const myCompletedDeals = await db.deal.findMany({
      where: { influencerId: userId, status: "COMPLETED" },
      select: { id: true, postUrl: true },
    });
    const dealIds = myCompletedDeals.map((d: { id: string; postUrl?: string | null }) => d.id);
    if (dealIds.length === 0) return false;

    const snapshots = await db.engagementSnapshot.findMany({
      where: { dealId: { in: dealIds } },
      select: { engagementRate: true, dealId: true },
    });

    return snapshots.some((snap: { engagementRate: number; dealId: string }) => {
      const deal = myCompletedDeals.find((d: { id: string; postUrl?: string | null }) => d.id === snap.dealId);
      const url = (deal?.postUrl || "").toLowerCase();
      if (url.includes("instagram.com") || url.includes("ig.me")) {
        return igAvg > 0 && snap.engagementRate >= igAvg * 10;
      }
      if (url.includes("youtube.com") || url.includes("youtu.be")) {
        return ytAvg > 0 && snap.engagementRate >= ytAvg * 10;
      }
      const avg = Math.max(igAvg, ytAvg);
      return avg > 0 && snap.engagementRate >= avg * 10;
    });
  }
  return false;
}

async function checkLocationAndOtherStreak(badgeId: string, userId: string, db: DbClient, influencerProfile: GamificationUser["influencerProfile"]): Promise<boolean> {
  if (badgeId === "category_king") {
    const myCompleted = influencerProfile?.completedDeals || 0;
    if (myCompleted === 0) return false;

    const categories = (influencerProfile?.categories || "")
      .split(",")
      .map((c: string) => c.trim().toLowerCase())
      .filter(Boolean);
    if (categories.length === 0) return false;

    const allProfiles = await db.influencerProfile.findMany({
      select: { categories: true, completedDeals: true },
    });

    return categories.some((cat: string) => {
      const catProfiles = allProfiles.filter((p: { categories?: string | null; completedDeals?: number }) => (p.categories || "")
          .split(",")
          .map((c: string) => c.trim().toLowerCase())
          .includes(cat)
      );
      const maxCompleted = Math.max(...catProfiles.map((p: { completedDeals?: number }) => p.completedDeals || 0));
      return myCompleted >= maxCompleted;
    });
  }
  if (badgeId === "city_champion") {
    const myCity = (influencerProfile?.city || "").trim().toLowerCase();
    if (!myCity) return false;
    const myCompletedDeals = influencerProfile?.completedDeals || 0;
    if (myCompletedDeals === 0) return false;

    const sameCityProfiles = await db.influencerProfile.findMany({
      where: { city: { mode: "insensitive", equals: myCity } },
      select: { completedDeals: true },
    });
    const maxCompletedDeals = Math.max(...sameCityProfiles.map((p: { completedDeals?: number }) => p.completedDeals || 0));
    return myCompletedDeals >= maxCompletedDeals;
  }
  if (badgeId === "comeback_kid") {
    const logins = await db.loginAttempt.findMany({
      where: { userId, success: true },
      orderBy: { createdAt: "desc" },
      take: 2,
    });
    if (logins.length < 2) return false;
    const latestLogin = logins[0]!.createdAt;
    const previousLogin = logins[1]!.createdAt;
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;
    return latestLogin.getTime() - previousLogin.getTime() >= ninetyDays;
  }
  if (badgeId === "trendsetter") {
    const firstUsers = await db.user.findMany({
      orderBy: { createdAt: "asc" },
      take: 100,
      select: { id: true },
    });
    return firstUsers.some((u: { id: string }) => u.id === userId);
  }
  if (badgeId === "holiday_special") {
    const completedDeals = await db.deal.findMany({
      where: { influencerId: userId, status: "COMPLETED" },
      select: { completedAt: true },
    });
    return completedDeals.some((d: { completedAt: Date | null }) => {
      if (!d.completedAt) return false;
      const month = d.completedAt.getMonth();
      return month === 9 || month === 10;
    });
  }
  return false;
}

async function checkStreakActivity(
  badgeId: string,
  userId: string,
  user: GamificationUser,
  db: DbClient,
  completedDealsCount: number,
  influencerProfile: GamificationUser["influencerProfile"]
): Promise<boolean> {
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  if (badgeId === "first_login") return true;
  if (badgeId === "highly_responsive") {
    const messageCount = await db.message.count({ where: { senderId: userId } });
    return messageCount >= 10;
  }
  if (badgeId.startsWith("deal_streak_")) {
    return checkDealStreak(badgeId, userId, db, startOfMonth);
  }
  if (badgeId === "fast_earner") {
    return checkFinancialStreak(badgeId, userId, db, startOfMonth);
  }
  if (["speed_demon", "early_bird", "night_owl", "weekend_warrior"].includes(badgeId)) {
    return checkSpeedAndTimingStreak(badgeId, userId, db);
  }
  if (["diverse_portfolio", "loyalist"].includes(badgeId)) {
    return checkPortfolioAndLoyaltyStreak(badgeId, userId, db);
  }
  if (["perfect_rating", "creative_genius", "viral_post"].includes(badgeId)) {
    return checkRatingAndViralStreak(badgeId, userId, db, influencerProfile);
  }
  return checkLocationAndOtherStreak(badgeId, userId, db, influencerProfile);
}

interface BrandComplianceConfig {
  badgeId: string;
  userId: string;
  user: GamificationUser;
  db: DbClient;
  brandProfile: GamificationUser["brandProfile"];
  completedDealsCount: number;
  fraudViolationsCount: number;
  zeroRevisionDealsCount: number;
}

async function checkBrandFastApprover(userId: string, db: DbClient): Promise<boolean> {
  const submissions = await db.contentSubmission.findMany({
    where: {
      deal: { brand: { userId } },
      status: "APPROVED",
    },
    select: { submittedAt: true, reviewedAt: true },
  });
  const fastCount = submissions.filter((s: { reviewedAt: Date | null; submittedAt: Date | null }) => {
    if (!s.reviewedAt || !s.submittedAt) return false;
    const diff = new Date(s.reviewedAt).getTime() - new Date(s.submittedAt).getTime();
    return diff <= 6 * 60 * 60 * 1000;
  }).length;
  return fastCount >= 10;
}

async function checkBrandRoiMaster(userId: string, db: DbClient): Promise<boolean> {
  const campaigns = await db.campaign.findMany({
    where: { brand: { userId } },
    select: { id: true },
  });
  if (campaigns.length === 0) return false;

  for (const campaign of campaigns) {
    const deals = await db.deal.findMany({
      where: { campaignId: campaign.id, status: "COMPLETED" },
      include: { engagementSnapshots: true },
    });

    if (deals.length === 0) continue;

    let totalSpend = 0;
    let totalEstimatedValue = 0;

    for (const deal of deals) {
      totalSpend += deal.amount;
      const snapshot =
        deal.engagementSnapshots.find((s: { interval: string }) => s.interval === "7d") ||
        deal.engagementSnapshots.find((s: { interval: string }) => s.interval === "48h") ||
        deal.engagementSnapshots.find((s: { interval: string }) => s.interval === "24h") ||
        deal.engagementSnapshots[0];

      if (snapshot) {
        const totalEngagements =
          snapshot.likes +
          snapshot.comments +
          snapshot.shares +
          snapshot.saves;
        const views = snapshot.views ?? 0;
        const clicks = snapshot.clicks ?? 0;
        const estimatedValue =
          views * 20 + totalEngagements * 100 + clicks * 500;
        totalEstimatedValue += estimatedValue;
      }
    }

    if (totalSpend > 0 && totalEstimatedValue >= 5 * totalSpend) {
      return true;
    }
  }
  return false;
}

async function checkBrandPartnershipPro(brandProfile: GamificationUser["brandProfile"], db: DbClient): Promise<boolean> {
  const brandProfileId = brandProfile?.id;
  if (!brandProfileId) return false;
  const repeatDeals = await db.deal.groupBy({
    by: ["influencerId"],
    where: { brandId: brandProfileId, status: "COMPLETED" },
    _count: { id: true },
  });
  const repeatPartners = repeatDeals.filter((group: { _count: { id: number | null } }) => (group._count.id ?? 0) >= 2).length;
  return repeatPartners >= 5;
}

async function checkBrandCompliance(
  config: BrandComplianceConfig
): Promise<boolean> {
  const {
    badgeId,
    userId,
    user,
    db,
    brandProfile,
    completedDealsCount,
    fraudViolationsCount,
    zeroRevisionDealsCount,
  } = config;
  switch (badgeId) {
    case "first_campaign":
    case "campaign_master":
    case "big_spender":
    case "mega_campaign":
      return await checkBrandCampaignBadge(user, badgeId, db, brandProfile);
    case "trust_novice":
    case "trust_prime":
    case "trust_super_prime":
    case "trust_sovereign":
    case "cibil_elite":
      return await checkTrustBadge(user, badgeId, db, user.influencerProfile);
    case "fraud_shield":
      return completedDealsCount >= 10 && fraudViolationsCount === 0;
    case "strict_compliance":
      return zeroRevisionDealsCount >= 5;
    case "no_revisions":
      return zeroRevisionDealsCount >= 1;
    case "fast_approver":
      return checkBrandFastApprover(userId, db);
    case "roi_master":
      return checkBrandRoiMaster(userId, db);
    case "partnership_pro":
      return checkBrandPartnershipPro(brandProfile, db);
    case "fair_payer": {
      const campaigns = await db.campaign.findMany({
        where: { brand: { userId } },
        select: { perInfluencerBudget: true },
      });
      const averageBudget = campaigns.reduce((acc: number, c: { perInfluencerBudget: number | null }) => acc + (c.perInfluencerBudget || 0), 0) / (campaigns.length || 1);
      return averageBudget >= 5000000;
    }
    default:
      return false;
  }
}

export async function checkAndAwardBadges(
  userId: string,
  trigger:
    | "CAMPAIGN_CREATED"
    | "DEAL_COMPLETED"
    | "REVIEW_RECEIVED"
    | "VERIFICATION"
    | "LOGIN"
    | "REFERRAL"
    | "FIRST_REVIEW"
    | "FIVE_STAR_RATING"
    | "TRUST_UPDATED",
  tx?: Prisma.TransactionClient,
) {
  const db = tx || prisma;

  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      badges: { select: { badgeId: true } },
      influencerProfile: true,
      brandProfile: true,
    },
  });

  if (!user) return;

  const ownedBadgeIds = new Set(
    user.badges.map((b: { badgeId: string }) => b.badgeId),
  );
  const newBadges: BadgeDefinition[] = [];

  // 1. Check all badges defined in BADGES
  // We filter out badges already owned and limit to those relevant to this trigger
  const unearnedBadges = BADGES.filter((b) => !ownedBadgeIds.has(b.id));
  const relevantBadgeIds = TRIGGER_TO_BADGES[trigger] || [];
  const badgesToCheck = unearnedBadges.filter((b) => relevantBadgeIds.includes(b.id));

  // Pre-fetch common data in parallel for efficiency
  const [
    wallet,
    influencerProfile,
    brandProfile,
    completedDealsCount,
    fraudViolationsCount,
    zeroRevisionDealsCount,
  ] = await Promise.all([
    db.wallet.findUnique({ where: { userId } }),
    db.influencerProfile.findUnique({ where: { userId } }),
    db.brandProfile.findUnique({ where: { userId } }),
    db.deal.count({
      where: {
        influencer: { userId },
        status: { in: ["COMPLETED", "VERIFIED"] },
      },
    }),
    db.userViolation.count({
      where: { userId, type: "FRAUD" },
    }),
    db.deal.count({
      where: {
        influencer: { userId },
        status: { in: ["COMPLETED", "VERIFIED"] },
        revisionsUsed: 0,
      },
    }),
  ]);

  for (const badge of badgesToCheck) {
    let earned = false;

    if (badge.id.startsWith("first_deal") || badge.id.endsWith("_deals") || badge.id.startsWith("earn_") || badge.id.endsWith("_referral") || badge.id.endsWith("_referrals") || badge.id === "referral_king") {
      earned = await checkMilestoneEarningsReferrals(badge.id, user, db, wallet);
    } else if (badge.id === "verified_identity" || badge.id === "social_connected" || badge.id === "verified_pro" || badge.id === "profile_complete" || badge.id.endsWith("_5_star")) {
      earned = await checkVerificationReviews(badge.id, userId, user, db, influencerProfile, brandProfile);
    } else if (badge.id.startsWith("campaign_") || badge.id === "first_campaign" || badge.id === "big_spender" || badge.id === "mega_campaign" || badge.id.startsWith("trust_") || badge.id === "cibil_elite" || badge.id === "fraud_shield" || badge.id === "strict_compliance" || badge.id === "no_revisions" || badge.id === "fast_approver" || badge.id === "roi_master" || badge.id === "partnership_pro" || badge.id === "fair_payer") {
      earned = await checkBrandCompliance({
        badgeId: badge.id,
        userId,
        user,
        db,
        brandProfile,
        completedDealsCount,
        fraudViolationsCount,
        zeroRevisionDealsCount,
      });
    } else {
      earned = await checkStreakActivity(badge.id, userId, user, db, completedDealsCount, influencerProfile);
    }

    if (earned) {
      newBadges.push(badge);
    }
  }

  // 2. Award new badges
  if (newBadges.length > 0) {
    await awardBadges(userId, newBadges, db);
  }
}

import { randomUUID } from "node:crypto";

async function awardBadges(
  userId: string,
  badges: BadgeDefinition[],
  db: Prisma.TransactionClient | typeof prisma,
) {
  if (badges.length === 0) return;

  // 1. Ensure badges exist in DB in bulk
  const existingBadges = await db.badge.findMany({
    where: { name: { in: badges.map((b: BadgeDefinition) => b.name) } },
  });
  const existingNames = new Set(existingBadges.map((b: { name: string }) => b.name));
  const missingBadges = badges.filter((b: BadgeDefinition) => !existingNames.has(b.name));

  if (missingBadges.length > 0) {
    await db.badge.createMany({
      data: missingBadges.map((b: BadgeDefinition) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        icon: b.icon,
        category: b.category,
        xpReward: b.xpReward,
        criteria: {},
      })),
      skipDuplicates: true,
    });
  }

  // 2. Fetch all DB badge IDs
  const allDbBadges = await db.badge.findMany({
    where: { name: { in: badges.map((b: BadgeDefinition) => b.name) } },
    select: {
      id: true,
      name: true,
      icon: true,
    },
  });

  // 3. Filter out badges already owned by the user
  const ownedUserBadges = await db.userBadge.findMany({
    where: { userId, badgeId: { in: allDbBadges.map((b: { id: string }) => b.id) } },
    select: { badgeId: true },
  });
  const ownedIds = new Set(ownedUserBadges.map((ub: { badgeId: string }) => ub.badgeId));
  const newDbBadges = allDbBadges.filter((dbb: { id: string }) => !ownedIds.has(dbb.id));

  if (newDbBadges.length === 0) return;

  // 4. Create UserBadge records and send notifications
  const userBadgesToCreate = newDbBadges.map((dbb: { id: string }) => ({
    id: randomUUID(),
    userId,
    badgeId: dbb.id,
  }));

  await db.userBadge.createMany({
    data: userBadgesToCreate,
    skipDuplicates: true,
  });

  let totalXp = 0;
  for (const dbb of newDbBadges) {
    const badgeDef = badges.find((b) => b.name === dbb.name);
    if (!badgeDef) continue;
    totalXp += badgeDef.xpReward;

    // Notification
    await NotificationService.createNotification({
      userId,
      type: "badge_earned",
      title: `New Badge Unlocked: ${dbb.name} ${dbb.icon}`,
      message: `Congratulations! You've earned the "${dbb.name}" badge and ${badgeDef.xpReward} XP!`,
      data: { badgeId: dbb.id },
    }, db);
  }

  // 5. Update User XP
  if (totalXp > 0) {
    await addUserXp(userId, totalXp, "BADGE_EARNED", db);
  }
}

export async function addUserXp(
  userId: string,
  amount: number,
  reason: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  if (!Number.isInteger(amount) || amount <= 0) return null;

  const updatedUser = await db.user.update({
    where: { id: userId },
    data: { xp: { increment: amount } },
    select: { xp: true, level: true },
  });

  const nextLevel = calculateLevel(updatedUser.xp).level;
  if (nextLevel !== updatedUser.level) {
    await db.user.update({
      where: { id: userId },
      data: { level: nextLevel },
    });
  }

  await createActivityLog({
    userId,
    action: "XP_AWARDED",
    metadata: {
      reason,
      xpAwarded: amount,
      totalXp: updatedUser.xp,
      oldLevel: updatedUser.level,
      newLevel: nextLevel,
    },
  }, db);

  return { xp: updatedUser.xp, level: nextLevel };
}

// --- HELPERS ---

async function checkDealCount(
  user: {
    userType: string;
    influencerProfile?: { completedDeals: number } | null;
    brandProfile?: { totalCampaigns: number } | null;
  },
  badgeId: string,
  db: Prisma.TransactionClient | typeof prisma,
): Promise<boolean> {
  const _db = db;
  let count = 0;

  if (user.userType !== "INFLUENCER") return false;
  count = user.influencerProfile?.completedDeals || 0;

  switch (badgeId) {
    case "first_deal":
      return count >= 1;
    case "five_deals":
      return count >= 5;
    case "ten_deals":
      return count >= 10;
    case "twenty_five_deals":
      return count >= 25;
    case "fifty_deals":
      return count >= 50;
    case "hundred_deals":
      return count >= 100;
    case "five_hundred_deals":
      return count >= 500;
    case "thousand_deals":
      return count >= 1000;
    default:
      return false;
  }
}

async function checkEarnings(
  user: { id: string },
  badgeId: string,
  db: Prisma.TransactionClient | typeof prisma,
  wallet?: { totalEarned: number } | null,
): Promise<boolean> {
  let amount = 0;
  if (wallet) {
    amount = wallet.totalEarned / 100;
  } else {
    const prismaRef = db;
    const walletData = await prismaRef.wallet.findUnique({
      where: { userId: user.id },
    });
    if (!walletData) return false;
    amount = walletData.totalEarned / 100;
  }

  switch (badgeId) {
    case "earn_1k":
      return amount >= 1000;
    case "earn_10k":
      return amount >= 10000;
    case "earn_50k":
      return amount >= 50000;
    case "earn_1lakh":
      return amount >= 100000;
    case "earn_5lakh":
      return amount >= 500000;
    case "earn_10lakh":
      return amount >= 1000000;
    case "earn_1crore":
      return amount >= 10000000;
    default:
      return false;
  }
}

async function checkReviews(
  userId: string,
  countNeeded: number,
  minRating: number,
  db: Prisma.TransactionClient | typeof prisma,
  influencerProfile?: { id: string } | null,
  brandProfile?: { id: string } | null,
): Promise<boolean> {
  const prismaRef = db;

  const influencer = influencerProfile || await prismaRef.influencerProfile.findUnique({
    where: { userId },
  });
  const brand = brandProfile || await prismaRef.brandProfile.findUnique({ where: { userId } });

  const whereClause: Record<string, unknown> = {};
  if (influencer) whereClause.influencerRevieweeId = influencer.id;
  else if (brand) whereClause.brandRevieweeId = brand.id;
  else return false;

  whereClause.rating = { gte: minRating };

  const count = await prismaRef.review.count({ where: whereClause });
  return count >= countNeeded;
}

async function checkReferralCount(
  user: { id: string },
  badgeId: string,
  db: Prisma.TransactionClient | typeof prisma,
): Promise<boolean> {
  const prismaRef = db;

  const referralCount = await prismaRef.user.count({
    where: {
      referredBy: user.id,
      OR: [
        { influencerProfile: { completedDeals: { gt: 0 } } },
        { brandProfile: { totalCampaigns: { gt: 0 } } },
      ],
    },
  });

  switch (badgeId) {
    case "first_referral":
      return referralCount >= 1;
    case "five_referrals":
      return referralCount >= 5;
    case "ten_referrals":
      return referralCount >= 10;
    case "referral_king":
      return referralCount >= 50;
    default:
      return false;
  }
}

async function checkBrandCampaignBadge(
  user: {
    id: string;
    userType: string;
    brandProfile?: { id: string; totalCampaigns: number } | null;
  },
  badgeId: string,
  db: Prisma.TransactionClient | typeof prisma,
  brandProfile?: { id: string; totalCampaigns: number } | null,
): Promise<boolean> {
  const profile = brandProfile || user.brandProfile;
  if (user.userType !== "BRAND" || !profile) return false;

  switch (badgeId) {
    case "first_campaign":
      return profile.totalCampaigns >= 1;
    case "campaign_master":
      return profile.totalCampaigns >= 25;
    case "big_spender": {
      const largeCampaign = await db.campaign.findFirst({
        where: {
          brandId: profile.id,
          totalBudget: { gte: 10000000 },
          deletedAt: null,
        },
        select: { id: true },
      });
      return Boolean(largeCampaign);
    }
    case "mega_campaign": {
      const megaCampaign = await db.campaign.findFirst({
        where: {
          brandId: profile.id,
          selectedInfluencers: { gte: 50 },
          deletedAt: null,
        },
        select: { id: true },
      });
      return Boolean(megaCampaign);
    }
    default:
      return false;
  }
}

async function checkTrustBadge(
  user: { id: string; trustScore: number },
  badgeId: string,
  db: Prisma.TransactionClient | typeof prisma,
  influencerProfile?: { completedDeals: number } | null,
): Promise<boolean> {
  const score = user.trustScore;
  switch (badgeId) {
    case "trust_novice":
      return score >= 650;
    case "trust_prime":
      return score >= 750;
    case "trust_super_prime":
      return score >= 850;
    case "trust_sovereign":
      return score >= 900;
    case "cibil_elite": {
      const profile = influencerProfile || await db.influencerProfile.findUnique({
        where: { userId: user.id },
        select: { completedDeals: true },
      });
      return score >= 800 && (profile?.completedDeals || 0) >= 5;
    }
    default:
      return false;
  }
}


