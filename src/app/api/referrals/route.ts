import { NextResponse } from "next/server";
import { apiWrapper } from "@/lib/api-wrapper";
import prisma from "@/lib/db";
import { auth } from "@/lib/auth";

export const GET = apiWrapper(async (_req) => {
  const session = await auth();
  const userId = session!.user!.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
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
      (sum: number, tx: { amount: number }) => sum + tx.amount,
      0,
    ) || 0;

  return NextResponse.json({
    referralCode: user.referralCode,
    totalReferrals: user._count.referredUsers,
    totalEarned: totalEarned,
    referralLink: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/register?ref=${user.referralCode}`,
  });
}, { requireAuth: true });
