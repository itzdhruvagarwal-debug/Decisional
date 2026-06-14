/**
 * Leaderboard API Route
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { apiWrapper } from "@/lib/api-wrapper";

export const GET = apiWrapper(async (request: NextRequest) => {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);

    const type = searchParams.get("type") || "allTime"; // allTime, monthly, city
    const category = searchParams.get("category");
    const city = searchParams.get("city");
    const userType = searchParams.get("userType")?.toLowerCase();
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

    if (userType === "brand") {
      const brandProfiles = await prisma.brandProfile.findMany({
        where: {
          user: { trustScore: { gte: 51 } },
        },
        include: {
          _count: {
            select: { deals: true },
          },
        },
        orderBy: {
          totalSpent: "desc",
        },
        take: limit,
      });

      const leaderboard = brandProfiles.map((profile: any, index: number) => ({
        rank: index + 1,
        name: profile.companyName,
        avatar: profile.logo,
        totalSpent: profile.totalSpent,
        totalDeals: profile._count.deals,
        badge:
          index === 0 ? "👑" : index === 1 ? "🥈" : index === 2 ? "🥉" : null,
      }));

      let userRank = null;
      if (session?.user?.id) {
        const userProfile = await prisma.brandProfile.findUnique({
          where: { userId: session.user.id },
          include: {
            _count: {
              select: { deals: true },
            },
          },
        });

        if (userProfile) {
          const rank = await prisma.brandProfile.count({
            where: {
              totalSpent: { gt: userProfile.totalSpent },
              user: { trustScore: { gte: 51 } },
            },
          });

          userRank = {
            rank: rank + 1,
            name: userProfile.companyName,
            avatar: userProfile.logo,
            totalSpent: userProfile.totalSpent,
            totalDeals: userProfile._count.deals,
          };
        }
      }

      return NextResponse.json({
        leaderboard,
        userRank,
        type,
      });
    }

    const where: Record<string, unknown> = {
      user: { trustScore: { gte: 51 } }, // Gamification Connection
    };

    if (category) {
      where.categories = { contains: category };
    }

    if (city || (type === "city" && session?.user?.id)) {
      // If city filter or city leaderboard, need to get user's city
      if (!city && session?.user?.id) {
        const profile = await prisma.influencerProfile.findUnique({
          where: { userId: session.user.id },
          select: { city: true },
        });
        if (profile?.city) {
          where.city = profile.city;
        }
      } else if (city) {
        where.city = city;
      }
    }

    // Get leaderboard
    const profiles = await prisma.influencerProfile.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            xp: true,
            level: true,
          },
        },
      },
      orderBy: {
        user: { xp: "desc" },
      },
      take: limit,
    });

    const leaderboard = profiles.map((profile: any, index: number) => ({
      rank: index + 1,
      name: profile.displayName,
      avatar: profile.avatar,
      city: profile.city,
      categories: profile.categories,
      xp: profile.user.xp,
      level: profile.user.level,
      completedDeals: profile.completedDeals,
      badge:
        index === 0 ? "👑" : index === 1 ? "🥈" : index === 2 ? "🥉" : null,
    }));

    // Get current user's rank if logged in
    let userRank = null;
    if (session?.user?.id) {
      const userProfile = await prisma.influencerProfile.findUnique({
        where: { userId: session.user.id },
        include: { user: { select: { xp: true } } },
      });

      if (userProfile) {
        const rank = await prisma.user.count({
          where: {
            xp: { gt: userProfile.user.xp },
            userType: "INFLUENCER",
            trustScore: { gte: 51 },
          },
        });

        userRank = {
          rank: rank + 1,
          name: userProfile.displayName,
          avatar: userProfile.avatar,
          xp: userProfile.user.xp,
          completedDeals: userProfile.completedDeals,
        };
      }
    }

    return NextResponse.json({
      leaderboard,
      userRank,
      type,
    });
  } catch (error) {
    logger.error("Leaderboard fetch error", error);
    return NextResponse.json(
      { error: "Failed to fetch leaderboard" },
      { status: 500 },
    );
  }
});
