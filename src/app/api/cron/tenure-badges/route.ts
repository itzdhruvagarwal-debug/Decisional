import { NextRequest, NextResponse } from "next/server";
import { apiWrapper } from "@/lib/api-wrapper";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { awardBadgeIfNotExists } from "@/lib/gamification-engine";
import { validateCronSecret } from "../guard";
import { subDays } from "date-fns";

async function _handler_POST(_req: NextRequest) {
  await validateCronSecret();

  const now = new Date();

  // 1. platform_veteran: Active on platform for 1 year (365 days)
  const oneYearAgo = subDays(now, 365);
  const veterans = await prisma.user.findMany({
    where: {
      createdAt: { lte: oneYearAgo },
      userType: "INFLUENCER",
      badges: { none: { badgeId: "platform_veteran" } },
    },
    select: { id: true },
  });

  for (const user of veterans) {
    await awardBadgeIfNotExists(user.id, "platform_veteran");
  }

  // 2. brand_ambassador: Active on platform for 6 months (180 days)
  const sixMonthsAgo = subDays(now, 180);
  const brandAmbassadors = await prisma.user.findMany({
    where: {
      createdAt: { lte: sixMonthsAgo },
      userType: "BRAND",
      badges: { none: { badgeId: "brand_ambassador" } },
    },
    select: { id: true },
  });

  for (const user of brandAmbassadors) {
    await awardBadgeIfNotExists(user.id, "brand_ambassador");
  }

  // 3. og_member: Joined within first month of launch (launch date: 2026-01-01)
  const LAUNCH_DATE = new Date("2026-01-01T00:00:00.000Z");
  const ONE_MONTH_AFTER_LAUNCH = new Date(LAUNCH_DATE.getTime() + 30 * 24 * 60 * 60 * 1000);
  const ogMembers = await prisma.user.findMany({
    where: {
      createdAt: { gte: LAUNCH_DATE, lte: ONE_MONTH_AFTER_LAUNCH },
      badges: { none: { badgeId: "og_member" } },
    },
    select: { id: true },
  });

  for (const user of ogMembers) {
    await awardBadgeIfNotExists(user.id, "og_member");
  }

  // 4. hot_creator: Topped the weekly leaderboard (highest completed deals in the last 7 days)
  const sevenDaysAgo = subDays(now, 7);
  const topInfluencerDeals = await prisma.deal.groupBy({
    by: ["influencerId"],
    where: {
      status: "COMPLETED",
      completedAt: { gte: sevenDaysAgo },
    },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 1,
  });

  let hotCreatorUserId: string | null = null;
  if (topInfluencerDeals.length > 0 && topInfluencerDeals[0]?.influencerId) {
    const influencer = await prisma.influencerProfile.findUnique({
      where: { id: topInfluencerDeals[0].influencerId },
      select: { userId: true },
    });
    if (influencer) {
      hotCreatorUserId = influencer.userId;
      await awardBadgeIfNotExists(influencer.userId, "hot_creator");
    }
  }

  logger.info("Tenure and leaderboard badges cron execution complete", {
    veteransAwarded: veterans.length,
    brandAmbassadorsAwarded: brandAmbassadors.length,
    ogMembersAwarded: ogMembers.length,
    hotCreatorAwardedTo: hotCreatorUserId,
  });

  return NextResponse.json({
    success: true,
    veteransAwarded: veterans.length,
    brandAmbassadorsAwarded: brandAmbassadors.length,
    ogMembersAwarded: ogMembers.length,
    hotCreatorAwardedTo: hotCreatorUserId,
  });
}

export const POST = apiWrapper(_handler_POST);
