import { apiWrapper } from "@/lib/api-wrapper";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { exchangeInstagramCode, getInstagramProfile } from "@/lib/instagram";
import { logger } from "@/lib/logger";
import { encrypt } from "@/lib/encryption";
import { auth } from "@/lib/auth";
import { appUrl } from "@/lib/app-url";

function redirect(req: NextRequest, path: string) {
  return NextResponse.redirect(appUrl(path, req.nextUrl.origin));
}

async function _handler_GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  try {
    // Handle user cancellation or errors from Instagram
    if (error) {
      logger.warn("Instagram OAuth error", { error });
      return redirect(req, "/dashboard/settings?error=instagram_connect_cancelled");
    }

    if (!code || !state) {
      return redirect(req, "/dashboard/settings?error=missing_parameters");
    }

    // Verify the state param — CSRF guard
    const storedState = await prisma.oAuthState.findUnique({ where: { state } });

    if (!storedState || storedState.provider !== "instagram") {
      return redirect(req, "/dashboard/settings?error=invalid_state");
    }

    const session = await auth();
    if (!session?.user?.id || session.user.id !== storedState.userId) {
      await prisma.oAuthState.delete({ where: { state } }).catch(() => {});
      logger.warn("Instagram OAuth state owner mismatch", {
        stateUserId: storedState.userId,
        sessionUserId: session?.user?.id,
      });
      return redirect(req, "/dashboard/settings?error=invalid_session");
    }

    if (new Date() > storedState.expiresAt) {
      await prisma.oAuthState.delete({ where: { state } });
      return redirect(req, "/dashboard/settings?error=state_expired");
    }

    // Consume the one-time state immediately
    await prisma.oAuthState.delete({ where: { state } });

    const redirectUri = appUrl("/api/auth/instagram/callback", req.nextUrl.origin);
    const tokens = await exchangeInstagramCode(code, redirectUri);

    if (!tokens) {
      return redirect(req, "/dashboard/settings?error=token_exchange_failed");
    }

    const profile = await getInstagramProfile(tokens.accessToken);
    if (!profile) {
      return redirect(req, "/dashboard/settings?error=profile_fetch_failed");
    }

    // ── Ownership-safe link ───────────────────────────────────────────────────
    // Check whether this Instagram account is already linked to *any* Decisional
    // user before touching anything.
    const existingLink = await prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "instagram",
          providerAccountId: tokens.userId,
        },
      },
      select: { userId: true },
    });

    if (existingLink && existingLink.userId !== storedState.userId) {
      // ── Ownership conflict ─────────────────────────────────────────────────
      // The Instagram account is currently linked to a *different* Decisional
      // user (previousOwner). Silently overwriting the access token would leave
      // the DB row owned by previousOwner while holding the new user's token —
      // causing cross-account data leakage in social-verify and post-monitoring.
      //
      // Safe resolution: atomically remove the previous link and clear the
      // previous owner's instagramHandle (they no longer control this account),
      // then create a fresh link for the current user.
      const previousOwnerId = existingLink.userId;

      logger.warn("Instagram account ownership conflict — re-linking to new owner", {
        instagramUserId: tokens.userId,
        instagramHandle: profile.username,
        previousOwnerId,
        newOwnerId: storedState.userId,
      });

      await prisma.$transaction([
        // 1. Remove old link
        prisma.oAuthAccount.delete({
          where: {
            provider_providerAccountId: {
              provider: "instagram",
              providerAccountId: tokens.userId,
            },
          },
        }),
        // 2. Clear the previous owner's handle so they are not left showing a
        //    handle they no longer have authorised access to.
        prisma.influencerProfile.updateMany({
          where: {
            userId: previousOwnerId,
            instagramHandle: profile.username,
          },
          data: { instagramHandle: null },
        }),
        // 3. Create a fresh link for the new owner
        prisma.oAuthAccount.create({
          data: {
            userId: storedState.userId,
            provider: "instagram",
            providerAccountId: tokens.userId,
            accessToken: encrypt(tokens.accessToken),
          },
        }),
      ]);
    } else if (existingLink) {
      // ── Same user re-linking (token refresh) ──────────────────────────────
      await prisma.oAuthAccount.update({
        where: {
          provider_providerAccountId: {
            provider: "instagram",
            providerAccountId: tokens.userId,
          },
        },
        data: { accessToken: encrypt(tokens.accessToken) },
      });
    } else {
      // ── Fresh link — no prior row ──────────────────────────────────────────
      await prisma.oAuthAccount.create({
        data: {
          userId: storedState.userId,
          provider: "instagram",
          providerAccountId: tokens.userId,
          accessToken: encrypt(tokens.accessToken),
        },
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    // If the connecting user is an influencer, sync their handle + follower count.
    const user = await prisma.user.findUnique({
      where: { id: storedState.userId },
      select: { userType: true, email: true },
    });

    if (user?.userType === "INFLUENCER") {
      await prisma.influencerProfile.upsert({
        where: { userId: storedState.userId },
        create: {
          userId: storedState.userId,
          displayName: user.email?.split("@")[0] || "",
          categories: "General",
          languages: "English",
          instagramHandle: profile.username,
          instagramFollowers: profile.followersCount,
          instagramEngagementRate: 0,
        },
        update: {
          instagramHandle: profile.username,
          instagramFollowers: profile.followersCount,
        },
      });
    }

    return redirect(req, "/dashboard/settings?success=instagram_connected");
  } catch (error: unknown) {
    logger.error("Instagram callback error", error);
    return redirect(req, "/dashboard/settings?error=instagram_connect_failed");
  }
}


// Wrapped handlers via apiWrapper
export const GET = apiWrapper(_handler_GET);
