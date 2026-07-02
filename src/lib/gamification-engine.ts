import prisma from "./db";
import { Prisma } from "@prisma/client";
import { BADGES, BadgeDefinition } from "./badges";
import { calculateLevel } from "./drs-score";
import { NotificationService } from "@/services/notification.service";
import { createActivityLog } from "./audit";

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
    } catch (_err) {
      // Non-blocking
    }
  }

  await checkAndAwardBadges(userId, "DEAL_COMPLETED", tx);
  return referralResult;
}

const TRIGGER_TO_BADGES: Record<string, string[]> = {
  CAMPAIGN_CREATED: ["first_campaign", "campaign_master", "big_spender", "mega_campaign"],
  DEAL_COMPLETED: [
    "first_deal",
    "five_deals",
    "ten_deals",
    "twenty_five_deals",
    "fifty_deals",
    "hundred_deals",
    "five_hundred_deals",
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
  ],
  VERIFICATION: ["verified_identity", "profile_complete"],
  LOGIN: ["first_login", "profile_complete"],
  REFERRAL: ["first_referral", "five_referrals", "ten_referrals", "referral_king"],
  FIRST_REVIEW: ["first_5_star", "five_5_star"],
  FIVE_STAR_RATING: ["first_5_star", "five_5_star"],
  REVIEW_RECEIVED: ["first_5_star", "five_5_star"],
  TRUST_UPDATED: ["trust_novice", "trust_prime", "trust_super_prime", "trust_sovereign", "cibil_elite"],
};

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

    switch (badge.id) {
      // --- MILESTONES ---
      case "first_deal":
      case "five_deals":
      case "ten_deals":
      case "twenty_five_deals":
      case "fifty_deals":
      case "hundred_deals":
      case "five_hundred_deals":
        earned = await checkDealCount(user, badge.id, db);
        break;

      // --- EARNINGS ---
      case "earn_1k":
      case "earn_10k":
      case "earn_50k":
      case "earn_1lakh":
      case "earn_5lakh":
      case "earn_10lakh":
      case "earn_1crore":
        earned = await checkEarnings(user, badge.id, db, wallet);
        break;

      // --- VERIFICATION ---
      case "verified_identity":
        earned =
          user.verificationLevel === "IDENTITY" ||
          user.verificationLevel === "FULL";
        break;
      case "profile_complete":
        // Simplified check: if profile exists and strict fields are present
        if (
          user.userType === "INFLUENCER" &&
          user.influencerProfile?.bio &&
          user.influencerProfile?.categories
        )
          earned = true;
        if (
          user.userType === "BRAND" &&
          user.brandProfile?.description &&
          user.brandProfile?.industry
        )
          earned = true;
        break;

      // --- REVIEWS ---
      case "first_5_star":
        earned = await checkReviews(user.id, 1, 5, db, influencerProfile, brandProfile);
        break;
      case "five_5_star":
        earned = await checkReviews(user.id, 5, 5, db, influencerProfile, brandProfile);
        break;

      // --- OTHERS ---
      case "first_login":
        earned = true; // Triggered on login
        break;

      // --- REFERRALS ---
      case "first_referral":
      case "five_referrals":
      case "ten_referrals":
      case "referral_king":
        earned = await checkReferralCount(user, badge.id, db);
        break;

      // --- BRAND ---
      case "first_campaign":
      case "campaign_master":
      case "big_spender":
      case "mega_campaign":
        earned = await checkBrandCampaignBadge(user, badge.id, db, brandProfile);
        break;

      // --- CIBIL TRUST MILESTONES ---
      case "trust_novice":
      case "trust_prime":
      case "trust_super_prime":
      case "trust_sovereign":
      case "cibil_elite":
        earned = await checkTrustBadge(user, badge.id, db, influencerProfile);
        break;

      // --- COMPLIANCE & SECURITY ---
      case "fraud_shield":
        earned = await checkFraudShieldBadge(badge.id, completedDealsCount, fraudViolationsCount);
        break;
      case "strict_compliance":
        earned = await checkStrictComplianceBadge(badge.id, zeroRevisionDealsCount);
        break;
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

import { randomUUID } from "crypto";

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

async function checkFraudShieldBadge(
  badgeId: string,
  completedDealsCount: number,
  fraudViolationsCount: number,
): Promise<boolean> {
  // Fraud shield: Completed 10 deals with zero fraud flags
  if (completedDealsCount < 10) return false;
  return fraudViolationsCount === 0;
}

async function checkStrictComplianceBadge(
  badgeId: string,
  zeroRevisionDealsCount: number,
): Promise<boolean> {
  // Compliance Champion: 5 deals approved with zero revisions
  return zeroRevisionDealsCount >= 5;
}
