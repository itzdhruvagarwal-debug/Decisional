/**
 * Analytics Engine — Enhanced with Portfolio, ROI, and Admin Metrics
 *
 * Influencer: Earnings chart, success rate, portfolio, top posts
 * Brand: Campaign ROI, cost per engagement, influencer comparison
 * Admin: Real-time stats, growth metrics (CAC, K-factor, churn), cash flow
 */

import prisma from "./db";
import { getReferralStats } from "./referral-engine";
// BADGES removed (unused) from './badges';
import { logger } from "./logger";
import { updateTrustAndLevel } from "./trust-engine";
import { subMonths, format } from "date-fns";

function getPrimaryCategory(value: unknown): string {
  if (Array.isArray(value)) {
    return String(value[0] || "Other").trim() || "Other";
  }

  if (typeof value === "string") {
    return value.split(",")[0]?.trim() || "Other";
  }

  return "Other";
}

// ==================== INFLUENCER ANALYTICS ====================

export async function getInfluencerAnalytics(userId: string) {
  const profile = await prisma.influencerProfile.findUnique({
    where: { userId },
    include: {
      user: {
        select: {
          trustScore: true,
          xp: true,
          level: true,
          verificationLevel: true,
          createdAt: true,
        },
      },
    },
  });

  if (!profile) {
    logger.error("Influencer profile not found for analytics", { userId });
    throw new Error("Influencer profile not found");
  }

  // 1. Overview Stats
  const totalEarnings = profile.totalEarnings;
  const completedDeals = profile.completedDeals;

  const activeDeals = await prisma.deal.count({
    where: {
      influencerId: profile.id,
      status: {
        in: [
          "ACTIVE",
          "CONTENT_SUBMITTED",
          "REVISION_REQUESTED",
          "CONTENT_APPROVED",
          "POSTED",
          "VERIFICATION_PENDING",
        ],
      },
    },
  });

  // 2. Earnings History (Last 12 Months)
  const earningsHistory = await getMonthlyEarnings(profile.id);

  // 3. Performance Metrics
  const deliveryRate = await calculateDeliveryRate(profile.id);

  // 4. Recent Activity
  const recentActivity = await prisma.activityLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { action: true, createdAt: true, metadata: true },
  });

  // 5. Gamification & Referrals
  const referralStats = await getReferralStats(userId, { includeUsers: false });
  const userBadges = await prisma.userBadge.findMany({
    where: { userId },
    include: { badge: true },
    orderBy: { earnedAt: "desc" },
    take: 5,
  });

  const recentBadges = userBadges.map((ub: any) => ({
    ...ub.badge,
    earnedAt: ub.earnedAt,
  }));

  // 6. Top Performing Content (deals with highest ratings)
  const topDeals = await prisma.deal.findMany({
    where: {
      influencerId: profile.id,
      status: "COMPLETED",
    },
    orderBy: { amount: "desc" },
    take: 5,
    select: {
      id: true,
      amount: true,
      completedAt: true,
      postUrl: true,
      campaign: { select: { title: true } },
    },
  });

  // 7. Category Breakdown
  const allDeals = await prisma.deal.findMany({
    where: { influencerId: profile.id, status: "COMPLETED" },
    include: { campaign: { select: { targetCategories: true } } },
  });
  const categoryMap = new Map<string, number>();
  allDeals.forEach((d: any) => {
    const cat = getPrimaryCategory(d.campaign?.targetCategories);
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
  });
  const categoryBreakdown = Array.from(categoryMap.entries())
    .map(([category, count]) => ({
      category,
      count,
      percentage: Math.round((count / allDeals.length) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  // 8. Success Rate
  const totalClosed = await prisma.deal.count({
    where: {
      influencerId: profile.id,
      status: { in: ["COMPLETED", "CANCELLED"] },
    },
  });
  const totalCompleted = await prisma.deal.count({
    where: { influencerId: profile.id, status: "COMPLETED" },
  });
  const successRate =
    totalClosed > 0 ? Math.round((totalCompleted / totalClosed) * 100) : 100;

  logger.debug("InfluencerAnalytics data fetched successfully", { userId });
  return {
    overview: {
      totalEarnings,
      completedDeals,
      activeDeals,
      averageRating: profile.averageRating,
      trustScore: Math.min(profile.user?.trustScore || 0, 100),
      level: profile.user?.level || 1,
      xp: profile.user?.xp || 0,
      successRate,
      memberSince: profile.user?.createdAt,
    },
    earningsHistory,
    performance: {
      deliveryRate,
      engagementRate: profile.instagramEngagementRate || 0,
      successRate,
    },
    topContent: topDeals.map((d: any) => ({
      id: d.id,
      campaignTitle: d.campaign?.title || "Direct Deal",
      amount: d.amount,
      completedAt: d.completedAt,
      postUrl: d.postUrl,
    })),
    categoryBreakdown,
    recentActivity,
    gamification: {
      recentBadges,
      referralStats,
    },
  };
}

async function getMonthlyEarnings(influencerId: string) {
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), i);
    return { date: d, month: format(d, "MMM yyyy"), amount: 0 };
  }).reverse();

  const wallet = await prisma.wallet.findFirst({
    where: { user: { influencerProfile: { id: influencerId } } },
  });

  if (!wallet) return months;

  const transactions = await prisma.transaction.findMany({
    where: {
      walletId: wallet.id,
      type: "CREDIT",
      createdAt: { gte: subMonths(new Date(), 12) },
    },
  });

  transactions.forEach((tx: any) => {
    const monthStr = format(tx.createdAt, "MMM yyyy");
    const monthObj = months.find((m) => m.month === monthStr);
    if (monthObj) monthObj.amount += tx.amount;
  });

  return months.map((m) => ({ month: m.month, amount: m.amount }));
}

async function calculateDeliveryRate(influencerId: string) {
  const totalDeals = await prisma.deal.count({
    where: { influencerId, status: { in: ["COMPLETED", "CANCELLED"] } },
  });

  if (totalDeals === 0) return 100;

  const completed = await prisma.deal.count({
    where: { influencerId, status: "COMPLETED" },
  });

  return Math.round((completed / totalDeals) * 100);
}

// ==================== BRAND ANALYTICS (Enhanced) ====================

export async function getBrandAnalytics(userId: string) {
  const profile = await prisma.brandProfile.findUnique({
    where: { userId },
    include: {
      user: {
        select: { trustScore: true, verificationLevel: true, createdAt: true },
      },
    },
  });

  if (profile && profile.user.trustScore < 50) {
    await updateTrustAndLevel(userId, "ADMIN_ADJUSTMENT");
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { trustScore: true },
    });
    if (updatedUser) profile.user.trustScore = updatedUser.trustScore;
  }

  if (!profile) {
    logger.error("Profile not found for brand analytics", { userId });
    throw new Error("Brand profile not found");
  }

  // 1. Overview
  const totalSpent = profile.totalSpent;
  const activeCampaigns = profile.activeCampaigns;
  const totalCampaigns = profile.totalCampaigns;

  const activeDeals = await prisma.deal.count({
    where: {
      brandId: profile.id,
      status: { notIn: ["COMPLETED", "CANCELLED", "DISPUTED"] },
    },
  });

  // 2. Spend History
  const spendHistory = await getMonthlySpend(userId);

  // 3. Campaign Performance
  const campaigns = await prisma.campaign.findMany({
    where: { brandId: profile.id },
    select: {
      id: true,
      title: true,
      status: true,
      totalBudget: true,
      targetCategories: true,
      _count: { select: { deals: true } },
      deals: {
        where: { status: "COMPLETED" },
        select: { amount: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // 4. ROI Calculation
  const completedDeals = await prisma.deal.findMany({
    where: { brandId: profile.id, status: "COMPLETED" },
    select: { amount: true, totalAmount: true },
  });
  const totalDealSpend = completedDeals.reduce(
    (sum: number, d: any) => sum + d.totalAmount,
    0,
  );
  const avgDealCost =
    completedDeals.length > 0
      ? Math.round(totalDealSpend / completedDeals.length)
      : 0;

  // 5. Content Type Performance
  const categoryPerf = await prisma.deal.groupBy({
    by: ["status"],
    where: { brandId: profile.id },
    _count: true,
    _sum: { amount: true },
  });

  // 6. Micro vs Macro comparison
  const influencerDeals = await prisma.deal.findMany({
    where: { brandId: profile.id, status: "COMPLETED" },
    select: {
      amount: true,
      influencer: {
        select: {
          instagramFollowers: true,
          totalEarnings: true,
          averageRating: true,
        },
      },
    },
  });

  const micro = influencerDeals.filter(
    (d: any) => (d.influencer?.instagramFollowers || 0) < 50000,
  );
  const macro = influencerDeals.filter(
    (d: any) => (d.influencer?.instagramFollowers || 0) >= 50000,
  );

  const microVsMacro = {
    micro: {
      count: micro.length,
      avgCost:
        micro.length > 0
          ? Math.round(
              micro.reduce((s: number, d: any) => s + d.amount, 0) /
                micro.length,
            )
          : 0,
      avgRating:
        micro.length > 0
          ? (
              micro.reduce(
                (s: number, d: any) => s + (d.influencer?.averageRating || 0),
                0,
              ) / micro.length
            ).toFixed(1)
          : "0",
    },
    macro: {
      count: macro.length,
      avgCost:
        macro.length > 0
          ? Math.round(
              macro.reduce((s: number, d: any) => s + d.amount, 0) /
                macro.length,
            )
          : 0,
      avgRating:
        macro.length > 0
          ? (
              macro.reduce(
                (s: number, d: any) => s + (d.influencer?.averageRating || 0),
                0,
              ) / macro.length
            ).toFixed(1)
          : "0",
    },
  };

  // 7. Referrals
  const referralStats = await getReferralStats(userId, { includeUsers: false });

  return {
    overview: {
      totalSpent,
      activeCampaigns,
      totalCampaigns,
      activeDeals,
      trustScore: Math.min(profile.user.trustScore, 100),
      completedDeals: completedDeals.length,
      avgDealCost,
      memberSince: profile.user.createdAt,
    },
    spendHistory,
    recentCampaigns: campaigns.map((c: any) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      budget: c.totalBudget,
      dealsCount: c._count.deals,
      category: getPrimaryCategory(c.targetCategories),
      completedDeals: c.deals.length,
      amountSpent: c.deals.reduce((s: number, d: any) => s + d.amount, 0),
    })),
    dealStatusBreakdown: categoryPerf.map((p: any) => ({
      status: p.status,
      count: p._count,
      totalAmount: p._sum.amount || 0,
    })),
    microVsMacro,
    referralStats,
  };
}

async function getMonthlySpend(userId: string) {
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), i);
    return { date: d, month: format(d, "MMM yyyy"), amount: 0 };
  }).reverse();

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) return months;

  const transactions = await prisma.transaction.findMany({
    where: {
      walletId: wallet.id,
      type: "DEBIT",
      createdAt: { gte: subMonths(new Date(), 12) },
    },
  });

  transactions.forEach((tx: any) => {
    const monthStr = format(tx.createdAt, "MMM yyyy");
    const monthObj = months.find((m) => m.month === monthStr);
    if (monthObj) monthObj.amount += tx.amount;
  });

  return months.map((m) => ({ month: m.month, amount: m.amount }));
}

// ==================== ADMIN ANALYTICS (Enhanced) ====================

import { AdminAnalyticsService } from "@/services/admin-analytics.service";

export async function getAdminAnalytics() {
  return await AdminAnalyticsService.getDashboardStats();
}
