import { apiWrapper } from "@/lib/api-wrapper";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { encrypt } from "@/lib/encryption";
import { auth } from "@/lib/auth";
import { appUrl } from "@/lib/app-url";
import {
  calculateYouTubeEngagement,
  exchangeYouTubeCode,
  getYouTubeChannelByToken,
} from "@/lib/youtube";

function redirect(req: NextRequest, path: string) {
  return NextResponse.redirect(appUrl(path, req.nextUrl.origin));
}

function channelHandle(channel: { customUrl: string; title: string; id: string }) {
  return channel.customUrl || channel.title || channel.id;
}

async function linkYouTubeOAuthAccount(
  userId: string,
  channelId: string,
  handle: string,
  tokenData: any,
  existingLink: { userId: string } | null
) {
  if (existingLink && existingLink.userId !== userId) {
    const previousOwnerId = existingLink.userId;
    logger.warn("YouTube channel ownership conflict - re-linking to new owner", {
      channelId,
      previousOwnerId,
      newOwnerId: userId,
    });

    await prisma.$transaction([
      prisma.oAuthAccount.delete({
        where: {
          provider_providerAccountId: {
            provider: "youtube",
            providerAccountId: channelId,
          },
        },
      }),
      prisma.influencerProfile.updateMany({
        where: { userId: previousOwnerId, youtubeHandle: handle },
        data: { youtubeHandle: null },
      }),
      prisma.oAuthAccount.create({
        data: {
          userId,
          provider: "youtube",
          providerAccountId: channelId,
          ...tokenData,
        },
      }),
    ]);
  } else {
    await prisma.oAuthAccount.upsert({
      where: {
        provider_providerAccountId: {
          provider: "youtube",
          providerAccountId: channelId,
        },
      },
      update: tokenData,
      create: {
        userId,
        provider: "youtube",
        providerAccountId: channelId,
        ...tokenData,
      },
    });
  }
}

async function syncYouTubeInfluencerProfile(
  userId: string,
  channel: { id: string; subscriberCount: number },
  handle: string
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { userType: true, email: true },
  });

  if (user?.userType === "INFLUENCER") {
    // Map -1 (YouTube hidden subscriber sentinel) to null
    const subscribers = channel.subscriberCount === -1 ? null : channel.subscriberCount;
    const insights = await calculateYouTubeEngagement(channel.id);
    await prisma.influencerProfile.upsert({
      where: { userId },
      create: {
        userId,
        displayName: user.email?.split("@")[0] || "",
        categories: "General",
        languages: "English",
        youtubeHandle: handle,
        youtubeSubscribers: subscribers,
        youtubeEngagementRate: insights?.engagementRate || 0,
      },
      update: {
        youtubeHandle: handle,
        youtubeSubscribers: subscribers,
        youtubeEngagementRate: insights?.engagementRate || 0,
      },
    });
  }
}

async function _handler_GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  try {
    if (error) {
      logger.warn("YouTube OAuth error", { error });
      return redirect(req, "/dashboard/settings?tab=social&error=youtube_connect_cancelled");
    }

    if (!code || !state) {
      return redirect(req, "/dashboard/settings?tab=social&error=missing_parameters");
    }

    const storedState = await prisma.oAuthState.findUnique({ where: { state } });
    if (storedState?.provider !== "youtube") {
      return redirect(req, "/dashboard/settings?tab=social&error=invalid_state");
    }

    const session = await auth();
    if (!session?.user?.id || session.user.id !== storedState.userId) {
      await prisma.oAuthState.delete({ where: { state } }).catch(() => {});
      logger.warn("YouTube OAuth state owner mismatch", {
        stateUserId: storedState.userId,
        sessionUserId: session?.user?.id,
      });
      return redirect(req, "/dashboard/settings?tab=social&error=invalid_session");
    }

    if (new Date() > storedState.expiresAt) {
      await prisma.oAuthState.delete({ where: { state } });
      return redirect(req, "/dashboard/settings?tab=social&error=state_expired");
    }

    await prisma.oAuthState.delete({ where: { state } });

    const redirectUri = appUrl("/api/auth/youtube/callback", req.nextUrl.origin);
    const tokens = await exchangeYouTubeCode(code, redirectUri);
    if (!tokens) {
      return redirect(req, "/dashboard/settings?tab=social&error=youtube_token_exchange_failed");
    }

    const channel = await getYouTubeChannelByToken(tokens.accessToken);
    if (!channel) {
      return redirect(req, "/dashboard/settings?tab=social&error=youtube_channel_fetch_failed");
    }

    const existingLink = await prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "youtube",
          providerAccountId: channel.id,
        },
      },
      select: { userId: true },
    });

    const handle = channelHandle(channel);
    const tokenData = {
      accessToken: encrypt(tokens.accessToken),
      ...(tokens.refreshToken ? { refreshToken: encrypt(tokens.refreshToken) } : {}),
      ...(tokens.expiresAt ? { expiresAt: tokens.expiresAt } : {}),
      ...(tokens.scope ? { scope: tokens.scope } : {}),
    };

    await linkYouTubeOAuthAccount(storedState.userId, channel.id, handle, tokenData, existingLink);
    await syncYouTubeInfluencerProfile(storedState.userId, channel, handle);

    return redirect(req, "/dashboard/settings?tab=social&success=youtube_connected");
  } catch (err: unknown) {
    logger.error("YouTube callback error", err);
    return redirect(req, "/dashboard/settings?tab=social&error=youtube_connect_failed");
  }
}

// Wrapped handlers via apiWrapper
export const GET = apiWrapper(_handler_GET);
