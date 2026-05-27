import prisma from "./db";
import { Prisma } from "@prisma/client";
import { BADGES, BadgeDefinition } from "./badges";
import { calculateLevel } from "./drs-score";

/**
 * Gamification Engine
 * Handles badge awarding, XP calculation, and level updates.
 */

export async function finalizeDealGamification(
  userId: string,
  amount: number,
  tx: any
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

  try {
    const { processReferralReward } = await import("./referral-engine");
    await processReferralReward(userId, amount, tx);
  } catch (_err) {
    // Non-blocking
  }

  await checkAndAwardBadges(userId, "DEAL_COMPLETED", tx);
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
    | "FIVE_STAR_RATING",
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
  // We filter out badges already owned
  const unearnedBadges = BADGES.filter((b) => !ownedBadgeIds.has(b.id));

  for (const badge of unearnedBadges) {
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
        earned = await checkEarnings(user, badge.id, db);
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
        earned = await checkReviews(user.id, 1, 5, db);
        break;
      case "five_5_star":
        earned = await checkReviews(user.id, 5, 5, db);
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
        earned = await checkBrandCampaignBadge(user, badge.id, db);
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

async function awardBadges(
  userId: string,
  badges: BadgeDefinition[],
  db: Prisma.TransactionClient | typeof prisma,
) {
  // 1. Ensure badges exist in DB
  for (const badge of badges) {
    await db.badge.upsert({
      where: { name: badge.name }, // Badge name is unique in schema
      update: {},
      create: {
        name: badge.name,
        description: badge.description,
        icon: badge.icon,
        category: badge.category,
        xpReward: badge.xpReward,
        criteria: {},
        id: badge.id,
      },
    });
  }

  // 2. Create UserBadge records and add XP
  let totalXp = 0;

  for (const badge of badges) {
    // Get the DB badge ID
    const dbBadge = await db.badge.findUnique({ where: { name: badge.name } });
    if (!dbBadge) continue;

    await db.userBadge.create({
      data: {
        userId,
        badgeId: dbBadge.id,
      },
    });
    totalXp += badge.xpReward;

    // Notification
    await db.notification.create({
      data: {
        userId,
        type: "badge_earned",
        title: `New Badge Unlocked: ${badge.name} ${badge.icon}`,
        message: `Congratulations! You've earned the "${badge.name}" badge and ${badge.xpReward} XP!`,
        data: { badgeId: badge.id },
      },
    });
  }

  // 3. Update User XP
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

  await db.activityLog.create({
    data: {
      userId,
      action: "XP_AWARDED",
      metadata: {
        reason,
        xpAwarded: amount,
        totalXp: updatedUser.xp,
        oldLevel: updatedUser.level,
        newLevel: nextLevel,
      },
    },
  });

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
): Promise<boolean> {
  const prismaRef = db;
  let amount = 0;
  const wallet = await prismaRef.wallet.findUnique({
    where: { userId: user.id },
  });
  if (!wallet) return false;

  amount = wallet.totalEarned / 100;

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
): Promise<boolean> {
  const prismaRef = db;

  const influencer = await prismaRef.influencerProfile.findUnique({
    where: { userId },
  });
  const brand = await prismaRef.brandProfile.findUnique({ where: { userId } });

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
): Promise<boolean> {
  if (user.userType !== "BRAND" || !user.brandProfile) return false;

  switch (badgeId) {
    case "first_campaign":
      return user.brandProfile.totalCampaigns >= 1;
    case "campaign_master":
      return user.brandProfile.totalCampaigns >= 25;
    case "big_spender": {
      const largeCampaign = await db.campaign.findFirst({
        where: {
          brandId: user.brandProfile.id,
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
          brandId: user.brandProfile.id,
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
