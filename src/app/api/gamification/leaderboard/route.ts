import { apiWrapper } from "@/lib/api-wrapper";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";
import { subDays } from "date-fns";
import { logger } from "@/lib/logger";

async function _handler_GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter") || "all-time"; // all-time | weekly
    const city = searchParams.get("city") || "";
    const category = searchParams.get("category") || "";
    const limit = Math.min(Number.parseInt(searchParams.get("limit") || "20", 10), 50);

    // ==================== INFLUENCER LEADERBOARD ====================

    const influencerWhere: Prisma.UserWhereInput = {
      userType: "INFLUENCER",
      status: "ACTIVE",
      trustScore: { gte: 51 }, // Trust Score Gamification Connection (Must be Normal+ to be on leaderboard)
      influencerProfile: { isNot: null },
    };

    // City filter
    if (city) {
      influencerWhere.influencerProfile = {
        is: {
          city: { contains: city, mode: "insensitive" as const },
        },
      };
    }

    // Category filter
    if (category) {
      influencerWhere.influencerProfile = {
        is: {
          ...(city ? { city: { contains: city, mode: "insensitive" as const } } : {}),
          categories: { contains: category, mode: "insensitive" as const },
        },
      };
    }

    const influencerOrderBy: Prisma.UserOrderByWithRelationInput = { xp: "desc" };

    // Weekly filter — order by deals completed in last 7 days
    if (filter === "weekly") {
      // For weekly, we'll get top performers by recent deal completions
      const weekAgo = subDays(new Date(), 7);

      const weeklyTopInfluencers = await prisma.deal.groupBy({
        by: ["influencerId"],
        where: {
          status: "COMPLETED",
          completedAt: { gte: weekAgo },
        },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: limit,
      });

      const influencerIds = weeklyTopInfluencers.map(
        (d: { influencerId: string }) => d.influencerId,
      );

      const profiles = await prisma.influencerProfile.findMany({
        where: {
          id: { in: influencerIds },
          ...(city
            ? { city: { contains: city, mode: "insensitive" as const } }
            : {}),
          ...(category
            ? {
              categories: {
                contains: category,
                mode: "insensitive" as const,
              },
            }
            : {}),
        },
        include: {
          user: {
            select: { id: true, xp: true, level: true, trustScore: true },
          },
        },
      });

      const weeklyInfluencers = weeklyTopInfluencers
        .map((d) => {
          const profile = profiles.find((p) => p.id === d.influencerId);
          if (!profile) return null;
          return {
            id: profile.user.id,
            name: profile.displayName,
            avatar: profile.avatar,
            subtitle: profile.categories?.split(",")[0] || "",
            city: profile.city || "",
            score: d._count.id, // Deals completed this week
            xp: profile.user.xp,
            trustScore: profile.user.trustScore,
            level: profile.user.level,
            isWeeklyChampion: false as boolean,
          };
        })
        .filter((influencer): influencer is NonNullable<typeof influencer> => Boolean(influencer && influencer.trustScore >= 51));

      // Mark #1 as "Hot Creator"
      if (weeklyInfluencers.length > 0 && weeklyInfluencers[0]) {
        weeklyInfluencers[0].isWeeklyChampion = true;
      }

      // ================== BRANDS (WEEKLY) ==================
      const weeklyTopBrands = await getTopBrands(limit, "weekly", city);

      return NextResponse.json({
        filter: "weekly",
        influencers: weeklyInfluencers,
        brands: weeklyTopBrands,
      });
    }

    // ==================== ALL-TIME LEADERBOARD ====================

    const topInfluencers = await prisma.user.findMany({
      where: influencerWhere,
      take: limit,
      orderBy: influencerOrderBy,
      select: {
        id: true,
        xp: true,
        level: true,
        trustScore: true,
        influencerProfile: {
          select: {
            displayName: true,
            avatar: true,
            categories: true,
            city: true,
            completedDeals: true,
            totalEarnings: true,
          },
        },
      },
    });

    const topBrands = await getTopBrands(limit, "all-time", city);

    // Hall of Fame — top 3 all-time
    const hallOfFame = topInfluencers.slice(0, 3).map((u, i: number) => ({
      rank: i + 1,
      id: u.id,
      name: u.influencerProfile?.displayName,
      avatar: u.influencerProfile?.avatar,
      xp: u.xp,
      level: u.level,
      deals: u.influencerProfile?.completedDeals || 0,
    }));

    return NextResponse.json({
      filter: "all-time",
      influencers: topInfluencers.map((u) => ({
        id: u.id,
        name: u.influencerProfile?.displayName,
        avatar: u.influencerProfile?.avatar,
        subtitle: u.influencerProfile?.categories?.split(",")[0] || "",
        city: u.influencerProfile?.city || "",
        score: u.xp,
        trustScore: Math.min(u.trustScore, 100),
        level: u.level,
        deals: u.influencerProfile?.completedDeals || 0,
      })),
      brands: topBrands,
      hallOfFame,
    });
  } catch (error) {
    logger.error("Leaderboard fetch error", error);
    return NextResponse.json(
      { error: "Failed to fetch leaderboard" },
      { status: 500 },
    );
  }
}

// ==================== HELPER ====================

async function getTopBrands(limit: number, filter: string, city: string) {
  if (filter === "weekly") {
    const weekAgo = subDays(new Date(), 7);
    const weeklyBrands = await prisma.deal.groupBy({
      by: ["brandId"],
      where: {
        status: "COMPLETED",
        completedAt: { gte: weekAgo },
        brandId: { not: null },
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: limit,
    });

    const brandIds = weeklyBrands
      .map((d) => d.brandId)
      .filter(Boolean) as string[];
    const profiles = await prisma.brandProfile.findMany({
      where: {
        id: { in: brandIds },
        ...(city ? { city: { contains: city, mode: "insensitive" as const } } : {}),
      },
      include: {
        user: { select: { id: true, xp: true, level: true, trustScore: true } },
      },
    });

    return weeklyBrands
      .map((d) => {
        const profile = profiles.find((p) => p.id === d.brandId);
        if (!profile) return null;
        return {
          id: profile.user.id,
          name: profile.companyName,
          logo: profile.logo,
          subtitle: profile.industry,
          score: d._count.id,
          xp: profile.user.xp,
          level: profile.user.level,
          trustScore: profile.user.trustScore,
        };
      })
      .filter((brand): brand is NonNullable<typeof brand> => Boolean(brand && brand.trustScore >= 51));
  }

  const brands = await prisma.user.findMany({
    where: {
      userType: "BRAND",
      status: "ACTIVE",
      trustScore: { gte: 51 }, // Gamification Connection
      brandProfile: {
        is: city
          ? { city: { contains: city, mode: "insensitive" as const } }
          : {},
      },
    },
    take: limit,
    orderBy: { trustScore: "desc" },
    select: {
      id: true,
      xp: true,
      level: true,
      trustScore: true,
      brandProfile: {
        select: {
          companyName: true,
          logo: true,
          industry: true,
          totalCampaigns: true,
        },
      },
    },
  });

  return brands.map((u) => ({
    id: u.id,
    name: u.brandProfile?.companyName,
    logo: u.brandProfile?.logo,
    subtitle: u.brandProfile?.industry,
    score: Math.min(u.trustScore, 100),
    xp: u.xp,
    level: u.level,
    campaigns: u.brandProfile?.totalCampaigns || 0,
  }));
}


// Wrapped handlers via apiWrapper
export const GET = apiWrapper(_handler_GET);
