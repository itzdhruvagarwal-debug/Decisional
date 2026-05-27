import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { BADGES } from "@/lib/badges";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Fetch user's earned badges
    const userBadges = await prisma.userBadge.findMany({
      where: { userId },
      include: { badge: true },
    });

    const _earnedBadgeIds = new Set(userBadges.map((ub: any) => ub.badgeId));

    // We want to return ALL badges, marking which ones are earned.
    // However, DB badge IDs are CUIDs, but match our BADGES constant by 'name'.
    // Let's map by name.

    const allDbBadges = await prisma.badge.findMany();
    const dbBadgeMap = new Map(allDbBadges.map((b: any) => [b.name, b]));

    const responseBadges = BADGES.map((def: any) => {
      const _dbBadge = dbBadgeMap.get(def.name);
      const userBadge = userBadges.find(
        (ub: any) => ub.badge?.name === def.name,
      );

      return {
        ...def,
        earned: !!userBadge,
        earnedAt: userBadge?.earnedAt || null,
        progress: 0,
      };
    });

    // Calculate level progress
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { xp: true, level: true },
    });

    return NextResponse.json({
      badges: responseBadges,
      stats: {
        xp: user?.xp || 0,
        level: user?.level || 1,
        totalBadges: userBadges.length,
        availableBadges: BADGES.length,
      },
    });
  } catch (error) {
    logger.error("Badges fetch error", error);
    return NextResponse.json(
      { error: "Failed to fetch badges", details: String(error) },
      { status: 500 },
    );
  }
}
