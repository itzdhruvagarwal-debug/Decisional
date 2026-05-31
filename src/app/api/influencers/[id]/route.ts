import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { apiWrapper } from "@/lib/api-wrapper";
import prisma from "@/lib/db";
import { WalletService } from "@/services/wallet.service";
import { requireActiveAdmin } from "@/lib/admin-auth";

export const GET = apiWrapper(async (req, { params }) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.userType !== "BRAND" && session.user.userType !== "ADMIN") {
    return NextResponse.json(
      { error: "Forbidden: brand access required" },
      { status: 403 },
    );
  }
  if (session.user.userType === "ADMIN") {
    await requireActiveAdmin(session.user);
  }

  const influencerId = (await params).id as string;
  const userId = session.user.id;

  const influencer = await prisma.influencerProfile.findUnique({
    where: { id: influencerId },
    include: { user: { select: { trustScore: true } } },
  });

  if (!influencer) {
    return NextResponse.json(
      { error: "Influencer not found" },
      { status: 404 },
    );
  }

  // Include the viewer's wallet info so the frontend knows if they can afford the minRate
  let walletInfo = null;
  try {
    walletInfo = await WalletService.getWallet(
      userId,
      1,
      1,
      undefined,
      session.user.userType,
    );
  } catch (_e) {
    // Fallback or ignore
  }

  return NextResponse.json({
    influencer: {
      id: influencer.id,
      userId: influencer.userId,
      displayName: influencer.displayName,
      bio: influencer.bio,
      avatar: influencer.avatar,
      city: influencer.city,
      state: influencer.state,
      instagramHandle: influencer.instagramHandle,
      instagramFollowers: influencer.instagramFollowers,
      instagramEngagementRate: influencer.instagramEngagementRate,
      youtubeHandle: influencer.youtubeHandle,
      youtubeSubscribers: influencer.youtubeSubscribers,
      youtubeEngagementRate: influencer.youtubeEngagementRate,
      categories: influencer.categories,
      languages: influencer.languages,
      minRate: influencer.minRate,
      maxRate: influencer.maxRate,
      trustScore: influencer.user.trustScore,
      totalCompletedDeals: influencer.completedDeals,
      averageRating: influencer.averageRating,
    },
    viewerWallet: walletInfo?.wallet
      ? {
          balance: walletInfo.wallet.balance,
          availableBalance:
            walletInfo.wallet.balance - (walletInfo.wallet as any).totalHeld,
        }
      : null,
  });
});
