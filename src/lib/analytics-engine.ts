import { AppError } from "@/lib/errors";
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
import { subMonths, format } from "date-fns";
import { getIndianFYBounds } from "./csv-export";
import { WalletService } from "@/services/wallet.service";

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

export async function getInfluencerAnalytics(userId: string, fy?: string) {
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
    throw AppError.notFound("Influencer profile not found");
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

  // 2. Earnings History (Last 12 Months or FY)
  const earningsHistory = await getMonthlyEarnings(profile.id, fy);

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

  const recentBadges = userBadges.map((ub) => ({
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
  allDeals.forEach((d) => {
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
      trustScore: Math.min(profile.user?.trustScore || 0, 900),
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
    topContent: topDeals.map((d) => ({
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

async function getMonthlyEarnings(influencerId: string, fy?: string) {
  const wallet = await prisma.wallet.findFirst({
    where: { user: { influencerProfile: { id: influencerId } } },
  });

  if (!wallet) {
    // Return empty 12-month array if no wallet
    return Array.from({ length: 12 }, (_, i) => {
      const d = subMonths(new Date(), 11 - i);
      return { month: format(d, "MMM yyyy"), amount: 0 };
    });
  }

  // Use FY date range if provided, otherwise rolling 12 months
  let startDate: Date;
  let endDate: Date;
  
  if (fy) {
    const bounds = getIndianFYBounds(fy);
    if (bounds) {
      startDate = bounds.start;
      endDate = bounds.end;
    } else {
      // Invalid FY, fallback to rolling 12 months
      startDate = new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000);
      endDate = new Date();
    }
  } else {
    // Default: rolling 12 months
    startDate = new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000);
    endDate = new Date();
  }

  // Use single GROUP BY query with date_trunc for efficient aggregation
  const monthlyData = await prisma.$queryRaw<Array<{ month: string; amount: bigint }>>`
    SELECT 
      TO_CHAR(DATE_TRUNC('month', "createdAt"), 'Mon YYYY') as month,
      COALESCE(SUM("amount"), 0) as amount
    FROM "Transaction"
    WHERE "walletId" = ${wallet.id}
      AND "type" = 'CREDIT'
      AND "createdAt" >= ${startDate}
      AND "createdAt" <= ${endDate}
    GROUP BY DATE_TRUNC('month', "createdAt")
    ORDER BY DATE_TRUNC('month', "createdAt") ASC
  `;

  // Fill in missing months with 0
  const result: Array<{ month: string; amount: number }> = [];
  const monthMap = new Map(monthlyData.map(m => [m.month, Number(m.amount)]));
  
  // Generate months based on date range
  const monthCount = 12; // FY always 12 months, rolling also 12
  const startMonth = startDate;
  
  for (let i = 0; i < monthCount; i++) {
    const d = new Date(startMonth);
    d.setMonth(d.getMonth() + i);
    const monthStr = format(d, "MMM yyyy");
    result.push({ month: monthStr, amount: monthMap.get(monthStr) || 0 });
  }

  return result;
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

export async function getBrandAnalytics(userId: string, fy?: string) {
  const profile = await prisma.brandProfile.findUnique({
    where: { userId },
    include: {
      user: {
        select: { trustScore: true, verificationLevel: true, createdAt: true },
      },
    },
  });


  if (!profile) {
    logger.error("Profile not found for brand analytics", { userId });
    throw AppError.notFound("Brand profile not found");
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

  // 2. Spend History (Last 12 Months or FY)
  const spendHistory = await getMonthlySpend(userId, fy);

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
    (sum: number, d) => sum + d.totalAmount,
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
    (d) => (d.influencer?.instagramFollowers || 0) < 50000,
  );
  const macro = influencerDeals.filter(
    (d) => (d.influencer?.instagramFollowers || 0) >= 50000,
  );

  const microVsMacro = {
    micro: {
      count: micro.length,
      avgCost:
        micro.length > 0
          ? Math.round(
              micro.reduce((s: number, d) => s + d.amount, 0) /
                micro.length,
            )
          : 0,
      avgRating:
        micro.length > 0
          ? (
              micro.reduce(
                (s: number, d) => s + (d.influencer?.averageRating || 0),
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
              macro.reduce((s: number, d) => s + d.amount, 0) /
                macro.length,
            )
          : 0,
      avgRating:
        macro.length > 0
          ? (
              macro.reduce(
                (s: number, d) => s + (d.influencer?.averageRating || 0),
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
      trustScore: Math.min(profile.user.trustScore, 900),
      completedDeals: completedDeals.length,
      avgDealCost,
      memberSince: profile.user.createdAt,
    },
    spendHistory,
    recentCampaigns: campaigns.map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      budget: c.totalBudget,
      dealsCount: c._count.deals,
      category: getPrimaryCategory(c.targetCategories),
      completedDeals: c.deals.length,
      amountSpent: c.deals.reduce((s: number, d) => s + d.amount, 0),
    })),
    dealStatusBreakdown: categoryPerf.map((p) => ({
      status: p.status,
      count: p._count,
      totalAmount: p._sum.amount || 0,
    })),
    microVsMacro,
    referralStats,
  };
}

async function getMonthlySpend(userId: string, fy?: string) {
  const wallet = await WalletService.getWalletBasic(userId);
  if (!wallet) {
    return Array.from({ length: 12 }, (_, i) => {
      const d = subMonths(new Date(), 11 - i);
      return { month: format(d, "MMM yyyy"), amount: 0 };
    });
  }

  // Use FY date range if provided, otherwise rolling 12 months
  let startDate: Date;
  let endDate: Date;
  
  if (fy) {
    const bounds = getIndianFYBounds(fy);
    if (bounds) {
      startDate = bounds.start;
      endDate = bounds.end;
    } else {
      // Invalid FY, fallback to rolling 12 months
      startDate = new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000);
      endDate = new Date();
    }
  } else {
    // Default: rolling 12 months
    startDate = new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000);
    endDate = new Date();
  }

  // Use single GROUP BY query with date_trunc for efficient aggregation
  const monthlyData = await prisma.$queryRaw<Array<{ month: string; amount: bigint }>>`
    SELECT 
      TO_CHAR(DATE_TRUNC('month', "createdAt"), 'Mon YYYY') as month,
      COALESCE(SUM("amount"), 0) as amount
    FROM "Transaction"
    WHERE "walletId" = ${wallet.id}
      AND "type" = 'DEBIT'
      AND "createdAt" >= ${startDate}
      AND "createdAt" <= ${endDate}
    GROUP BY DATE_TRUNC('month', "createdAt")
    ORDER BY DATE_TRUNC('month', "createdAt") ASC
  `;

  // Fill in missing months with 0
  const result: Array<{ month: string; amount: number }> = [];
  const monthMap = new Map(monthlyData.map(m => [m.month, Number(m.amount)]));
  
  // Generate months based on date range
  const monthCount = 12; // FY always 12 months, rolling also 12
  const startMonth = startDate;
  
  for (let i = 0; i < monthCount; i++) {
    const d = new Date(startMonth);
    d.setMonth(d.getMonth() + i);
    const monthStr = format(d, "MMM yyyy");
    result.push({ month: monthStr, amount: monthMap.get(monthStr) || 0 });
  }

  return result;
}
