/**
 * Leaderboard API Route
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const { searchParams } = new URL(request.url);

    const type = searchParams.get("type") || "allTime"; // allTime, monthly, city
    const category = searchParams.get("category");
    const city = searchParams.get("city");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

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
      userId: profile.userId,
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
}
