import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const referrals = await prisma.user.findMany({
      where: { referredBy: session.user.id },
      select: {
        id: true,
        email: true,
        userType: true,
        createdAt: true,
        status: true,
        verificationLevel: true,
        influencerProfile: { select: { displayName: true } },
        brandProfile: { select: { companyName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const referralRewards = await prisma.transaction.findMany({
      where: {
        wallet: { userId: session.user.id },
        type: "CREDIT",
        status: "COMPLETED",
        description: { contains: "Referral", mode: "insensitive" },
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
      referrals.length > 0 ? Math.floor(unattributedEarnings / referrals.length) : 0;

    const formattedReferrals = referrals.map((ref: any) => ({
      id: ref.id,
      name:
        ref.influencerProfile?.displayName ||
        ref.brandProfile?.companyName ||
        ref.email.split("@")[0],
      email: ref.email.replace(/(.{2}).*(@.*)/, "$1***$2"), // Mask email for privacy
      joinedAt: ref.createdAt,
      status: ref.status,
      verified: ref.verificationLevel !== "NONE",
      type: ref.userType,
      earnings: (exactEarningsByReferral.get(ref.id) || 0) + unattributedShare,
    }));

    return NextResponse.json({ referrals: formattedReferrals });
  } catch (error) {
    logger.error("Failed to fetch referrals list", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
