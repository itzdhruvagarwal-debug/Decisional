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

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        _count: {
          select: { referredUsers: true },
        },
        wallet: {
          include: {
            transactions: {
              where: {
                description: { contains: "Referral" },
              },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const totalEarned =
      user.wallet?.transactions.reduce(
        (sum: number, tx: any) => sum + tx.amount,
        0,
      ) || 0;

    return NextResponse.json({
      referralCode: user.referralCode,
      totalReferrals: user._count.referredUsers,
      totalEarned: totalEarned,
      referralLink: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/register?ref=${user.referralCode}`,
    });
  } catch (error) {
    logger.error("Referral API error", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
