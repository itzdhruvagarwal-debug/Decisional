import prisma from "./db";
import { Prisma } from "@prisma/client";
import { logger } from "./logger";
import { isEligibleForReferralEarnings } from "./enterprise-trust-guard";
import { addUserXp, checkAndAwardBadges } from "./gamification-engine";

/**
 * Referral Engine — 5-Tier System
 *
 * Bronze  (10 referrals):  +250 XP, 1% fee discount
 * Silver  (50 referrals):  +1500 XP, 1.5% fee discount
 * Gold    (100 referrals): +3500 XP, 2% fee discount
 * Platinum(500 referrals): 1% GMV revenue share (lifetime)
 * Diamond (1000 referrals): 2% GMV revenue share (lifetime) + equity option
 */

export interface ReferralTier {
  name: string;
  min: number;
  commission: number; // For backward compatibility / generic use
  feeDiscount: number; // % discount on user's own platform fees
  revenueShare: number; // % of ALL referral revenue (lifetime)
  xpReward: number; // XP granted on reaching tier
  label: string;
  color: string;
  icon: string;
}

export const REFERRAL_TIERS: Record<string, ReferralTier> = {
  STARTER: {
    name: "STARTER",
    min: 0,
    commission: 0,
    feeDiscount: 0,
    revenueShare: 0,
    xpReward: 0,
    label: "Starter",
    color: "#6b7280",
    icon: "🌱",
  },
  BRONZE: {
    name: "BRONZE",
    min: 10,
    commission: 0,
    feeDiscount: 1,
    revenueShare: 0,
    xpReward: 250,
    label: "Bronze",
    color: "#cd7f32",
    icon: "🥉",
  },
  SILVER: {
    name: "SILVER",
    min: 50,
    commission: 0,
    feeDiscount: 1.5,
    revenueShare: 0,
    xpReward: 1500,
    label: "Silver",
    color: "#c0c0c0",
    icon: "🥈",
  },
  GOLD: {
    name: "GOLD",
    min: 100,
    commission: 0,
    feeDiscount: 2,
    revenueShare: 0,
    xpReward: 3500,
    label: "Gold",
    color: "#ffd700",
    icon: "🥇",
  },
  PLATINUM: {
    name: "PLATINUM",
    min: 500,
    commission: 0,
    feeDiscount: 2, // Retains Gold discount
    revenueShare: 0.01, // 1% of GMV
    xpReward: 0,
    label: "Platinum",
    color: "#e5e4e2",
    icon: "💎",
  },
  DIAMOND: {
    name: "DIAMOND",
    min: 1000,
    commission: 0,
    feeDiscount: 2, // Retains Gold discount
    revenueShare: 0.02, // 2% of GMV
    xpReward: 0,
    label: "Diamond",
    color: "#b9f2ff",
    icon: "🔷",
  },
};

/**
 * Determine referral tier from active referral count.
 */
export function getTierFromCount(activeReferrals: number): ReferralTier {
  if (activeReferrals >= REFERRAL_TIERS.DIAMOND!.min)
    return REFERRAL_TIERS.DIAMOND!;
  if (activeReferrals >= REFERRAL_TIERS.PLATINUM!.min)
    return REFERRAL_TIERS.PLATINUM!;
  if (activeReferrals >= REFERRAL_TIERS.GOLD!.min) return REFERRAL_TIERS.GOLD!;
  if (activeReferrals >= REFERRAL_TIERS.SILVER!.min)
    return REFERRAL_TIERS.SILVER!;
  if (activeReferrals >= REFERRAL_TIERS.BRONZE!.min)
    return REFERRAL_TIERS.BRONZE!;
  return REFERRAL_TIERS.STARTER!;
}

/**
 * Get next tier info for progression display.
 */
export function getNextTier(currentTier: ReferralTier): ReferralTier | null {
  const tierOrder: ReferralTier[] = [
    REFERRAL_TIERS.STARTER!,
    REFERRAL_TIERS.BRONZE!,
    REFERRAL_TIERS.SILVER!,
    REFERRAL_TIERS.GOLD!,
    REFERRAL_TIERS.PLATINUM!,
    REFERRAL_TIERS.DIAMOND!,
  ];
  const idx = tierOrder.findIndex((t) => t.name === currentTier.name);
  return idx >= 0 && idx < tierOrder.length - 1 ? tierOrder[idx + 1] ?? null : null;
}

// ==================== REFERRAL STATS ====================

export async function getReferralStats(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      _count: {
        select: { referredUsers: true },
      },
    },
  });

  if (!user) return null;

  const totalReferrals = user._count.referredUsers;

  // Count active referrals (users with > 0 completed deals)
  const activeReferrals = await prisma.user.count({
    where: {
      referredBy: userId,
      OR: [
        { influencerProfile: { completedDeals: { gt: 0 } } },
        { brandProfile: { totalCampaigns: { gt: 0 } } },
      ],
    },
  });

  const currentTier = getTierFromCount(activeReferrals);
  const nextTier = getNextTier(currentTier);

  // Calculate total referral earnings
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  const referralTx = await prisma.transaction.aggregate({
    where: {
      walletId: wallet?.id,
      type: "CREDIT",
      status: "COMPLETED",
      description: { contains: "Referral", mode: "insensitive" },
    },
    _sum: { amount: true },
  });

  // Lifetime referral tracking — get all referred users with their stats
  const referredUsers = await prisma.user.findMany({
    where: { referredBy: userId },
    select: {
      id: true,
      createdAt: true,
      influencerProfile: {
        select: {
          displayName: true,
          completedDeals: true,
          totalEarnings: true,
        },
      },
      brandProfile: {
        select: { companyName: true, totalCampaigns: true, totalSpent: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Generate shareable link
  const shareableLink = `${process.env.NEXT_PUBLIC_APP_URL || "https://collabx.in"}/register?ref=${user.referralCode}`;

  return {
    totalReferrals,
    activeReferrals,
    tier: currentTier,
    nextTier,
    progressToNext: nextTier
      ? {
        current: activeReferrals,
        needed: nextTier.min,
        percentage: Math.min(
          100,
          Math.round((activeReferrals / nextTier.min) * 100),
        ),
      }
      : null,
    earnings: referralTx._sum.amount || 0,
    referralCode: user.referralCode,
    shareableLink,
    referredUsers: referredUsers.map((ru: any) => ({
      id: ru.id,
      name:
        ru.influencerProfile?.displayName ||
        ru.brandProfile?.companyName ||
        "User",
      joinedAt: ru.createdAt,
      deals:
        ru.influencerProfile?.completedDeals ||
        ru.brandProfile?.totalCampaigns ||
        0,
      earnings:
        ru.influencerProfile?.totalEarnings || ru.brandProfile?.totalSpent || 0,
    })),
    feeDiscount: currentTier.feeDiscount,
  };
}

// ==================== REFERRAL REWARD PROCESSING ====================

/**
 * Process a referral reward for a completed deal.
 * Includes commission + revenue share for Platinum/Diamond tiers.
 */
export async function processReferralReward(
  userId: string,
  dealAmount: number,
  tx?: Prisma.TransactionClient,
) {
  const db = tx || prisma;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { referredBy: true },
  });

  if (!user || !user.referredBy) return;

  const referrerId = user.referredBy;

  // Security gate: Check if referrer has a high enough trust score to earn rewards
  const referrerUser = await db.user.findUnique({
    where: { id: referrerId },
    select: { trustScore: true },
  });

  if (!referrerUser || !isEligibleForReferralEarnings(referrerUser.trustScore)) {
    logger.warn(`Referrer ${referrerId} trust score too low to earn referral rewards. Deal ignored.`);
    return;
  }

  // Find out if this is the user's first active referral event (deal/campaign)
  const triggeringUser = await db.user.findUnique({
    where: { id: userId },
    select: {
      userType: true,
      influencerProfile: { select: { completedDeals: true } },
      brandProfile: { select: { totalCampaigns: true } },
    },
  });

  const isFirstActiveEvent =
    triggeringUser?.userType === "INFLUENCER"
      ? triggeringUser.influencerProfile?.completedDeals === 1
      : triggeringUser.brandProfile?.totalCampaigns === 1;

  // Recount active referrals currently (which already includes the completed deal in the DB transaction)
  const activeReferralsCurrent = await db.user.count({
    where: {
      referredBy: referrerId,
      OR: [
        { influencerProfile: { completedDeals: { gt: 0 } } },
        { brandProfile: { totalCampaigns: { gt: 0 } } },
      ],
    },
  });

  // Calculate active referrals before this transaction.
  // If this was their very first completed event, they were not active before.
  const activeReferralsBefore = isFirstActiveEvent
    ? Math.max(0, activeReferralsCurrent - 1)
    : activeReferralsCurrent;

  const previousTier = getTierFromCount(activeReferralsBefore);
  const currentTier = getTierFromCount(activeReferralsCurrent);

  // 1. Commission logic is replaced with the Revenue Share GMV System requested
  // "A sirf B ke earnings pe kamata hai (multi-level nahi)" -> revenue share on GMV
  // Note: For Bronze/Silver/Gold there is NO GMV share, only fee discounts.
  const revenueShareAmount =
    currentTier.revenueShare > 0
      ? Math.round(dealAmount * currentTier.revenueShare)
      : 0;

  const totalReward = revenueShareAmount;

  // Award XP if tier upgraded
  let tierUpgraded = false;
  if (currentTier.name !== previousTier.name && currentTier.xpReward > 0) {
    tierUpgraded = true;
    await addUserXp(referrerId, currentTier.xpReward, "REFERRAL_TIER_UP", db);
  }

  if (isFirstActiveEvent) {
    await checkAndAwardBadges(referrerId, "REFERRAL", db);
  }

  // If there's no monetary reward but they leveled up, we still want to notify them
  if (totalReward <= 0) {
    if (tierUpgraded) {
      await db.notification.create({
        data: {
          userId: referrerId,
          type: "referral_tier_up",
          title: `${currentTier.icon} Reached ${currentTier.label} Tier!`,
          message: `Congratulations! You unlocked the ${currentTier.label} tier and earned ${currentTier.xpReward} XP. Enjoy your ${currentTier.feeDiscount}% fee discount!`,
        },
      });
    }
    return;
  }

  // 2. We already calculated totalReward and revenueShareAmount above.
  // We continue logic seamlessly.
  if (totalReward <= 0) return;

  // 3. Credit referrer wallet
  const referrerWallet = await db.wallet.findUnique({
    where: { userId: referrerId },
  });
  if (!referrerWallet) return;

  await db.wallet.update({
    where: { id: referrerWallet.id },
    data: {
      balance: { increment: totalReward },
      totalEarned: { increment: totalReward },
    },
  });

  // 4. Record transaction
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const revenueNote =
    revenueShareAmount > 0
      ? ` + ₹${(revenueShareAmount / 100).toFixed(2)} revenue share`
      : "";

  await db.transaction.create({
    data: {
      walletId: referrerWallet.id,
      type: "CREDIT",
      amount: totalReward,
      status: "COMPLETED",
      metadata: {
        referralUserId: userId,
        tier: currentTier.name,
        revenueShareAmount,
      },
      description: `Referral Bonus (${currentTier.label} Tier): ₹${(totalReward / 100).toFixed(2)} GMV share`,
    },
  });

  // 5. Notify referrer
  await db.notification.create({
    data: {
      userId: referrerId,
      type: "referral_bonus",
      title: `${currentTier.icon} Referral Bonus Earned!`,
      message: tierUpgraded
        ? `You leveled up to ${currentTier.label} (+${currentTier.xpReward} XP) and earned ₹${(totalReward / 100).toFixed(2)} GMV share lifetime passive income!`
        : `You earned ₹${(totalReward / 100).toFixed(2)} lifetime passive income from a referral's deal!`,
      data: JSON.parse(
        JSON.stringify({
          amount: totalReward,
          tier: currentTier.label,
          revenueShare: revenueShareAmount,
        }),
      ),
    },
  });

  logger.info("Referral reward processed", {
    referrerId,
    userId,
    totalReward,
    tier: currentTier.label,
    revenueShareAmount,
    tierUpgraded,
    xpAwarded: tierUpgraded ? currentTier.xpReward : 0
  });
}

// ==================== FEE DISCOUNT CALCULATOR ====================

/**
 * Calculate the effective platform fee for a user considering referral tier discounts.
 */
export async function getEffectivePlatformFee(
  userId: string,
): Promise<{
  baseFee: number;
  discount: number;
  effectiveFee: number;
  tier: string;
}> {
  const baseFee = Number(process.env.PLATFORM_FEE_PERCENTAGE) || 10;

  const activeReferrals = await prisma.user.count({
    where: {
      referredBy: userId,
      OR: [
        { influencerProfile: { completedDeals: { gt: 0 } } },
        { brandProfile: { totalCampaigns: { gt: 0 } } },
      ],
    },
  });

  const tier = getTierFromCount(activeReferrals);
  const effectiveFee = Math.max(0, baseFee - tier.feeDiscount);

  return {
    baseFee,
    discount: tier.feeDiscount,
    effectiveFee,
    tier: tier.label,
  };
}
