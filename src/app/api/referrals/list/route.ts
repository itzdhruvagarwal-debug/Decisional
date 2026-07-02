import { apiWrapper } from "@/lib/api-wrapper";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { Prisma } from "@prisma/client";
import { roundPaise } from "@/lib/utils";

async function _handler_GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const skip = (page - 1) * limit;

    const total = await prisma.user.count({
      where: { referredBy: session.user.id },
    });

    const referrals = await prisma.user.findMany({
      where: { referredBy: session.user.id },
      select: {
        id: true,
        email: true,
        userType: true,
        createdAt: true,
        status: true,
        verificationLevel: true,
        influencerProfile: { select: { displayName: true, completedDeals: true } },
        brandProfile: { select: { companyName: true, totalCampaigns: true, totalSpent: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    // Fetch all referral rewards for the user's wallet to compute unattributed earnings and exact referral matching
    const referralRewards = await prisma.transaction.findMany({
      where: {
        wallet: { userId: session.user.id },
        type: "CREDIT",
        status: "COMPLETED",
        metadata: {
          path: ["referralUserId"],
          not: Prisma.AnyNull,
        },
      },
      select: { amount: true, metadata: true },
    });

    const exactEarningsByReferral = new Map<string, number>();
    let unattributedEarnings = 0;
    for (const reward of referralRewards) {
      const metadata = reward.metadata as { referralUserId?: string } | null;
      const referralUserId = metadata?.referralUserId;
      if (referralUserId) {
        exactEarningsByReferral.set(
          referralUserId,
          (exactEarningsByReferral.get(referralUserId) || 0) + reward.amount,
        );
      } else {
        unattributedEarnings += reward.amount;
      }
    }

    const unattributedShare =
      total > 0 ? roundPaise(unattributedEarnings / total) : 0;

    const formattedReferrals = referrals.map((ref) => {
      const isActive =
        ref.influencerProfile
          ? ref.influencerProfile.completedDeals > 0
          : ref.brandProfile
          ? (ref.brandProfile.totalSpent > 0 || ref.brandProfile.totalCampaigns > 0)
          : false;

      return {
        id: ref.id,
        name:
          ref.influencerProfile?.displayName ||
          ref.brandProfile?.companyName ||
          ref.email.split("@")[0],
        email: ref.email.replace(/(.{2}).*(@.*)/, "$1***$2"), // Mask email for privacy
        joinedAt: ref.createdAt,
        status: isActive ? "ACTIVE" : "PENDING",
        verified: ref.verificationLevel !== "NONE",
        type: ref.userType,
        earnings: (exactEarningsByReferral.get(ref.id) || 0) + unattributedShare,
      };
    });

    return NextResponse.json({
      referrals: formattedReferrals,
      total,
      page,
      limit,
    });
  } catch (error) {
    logger.error("Failed to fetch referrals list", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}


// Wrapped handlers via apiWrapper
export const GET = apiWrapper(_handler_GET);
