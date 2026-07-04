import { apiWrapper } from "@/lib/api-wrapper";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { encrypt } from "@/lib/encryption";
import { auth } from "@/lib/auth";
import { appUrl } from "@/lib/app-url";
import { env } from "@/env";
import { AppError } from "@/lib/errors";

function redirect(req: NextRequest, path: string) {
  return NextResponse.redirect(appUrl(path, req.nextUrl.origin));
}

async function exchangeGoogleCodeForTokens(code: string, redirectUri: string) {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw AppError.internal("Google config missing");
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    logger.error("Google token exchange failed", { status: tokenRes.status, response: errBody });
    throw AppError.badRequest("Google token exchange failed");
  }

  return await tokenRes.json();
}

async function fetchGoogleUserProfile(accessToken: string) {
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!profileRes.ok) {
    logger.error("Google user profile fetch failed", { status: profileRes.status });
    throw AppError.badRequest("Google profile fetch failed");
  }

  const profile = await profileRes.json();
  if (!profile?.email) {
    throw AppError.badRequest("Google profile missing email");
  }

  return profile;
}

async function verifyAndLinkGoogleAccount(userId: string, profile: any, tokens: any) {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!dbUser || profile.email.toLowerCase() !== dbUser.email.toLowerCase()) {
    logger.warn("Google OAuth link rejected: email mismatch", {
      storedEmail: dbUser?.email,
      googleEmail: profile.email,
    });
    throw AppError.badRequest("Google email mismatch");
  }

  const existingLink = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "google",
        providerAccountId: profile.id,
      },
    },
  });

  if (existingLink && existingLink.userId !== userId) {
    logger.warn("Google account already linked to another user", {
      googleId: profile.id,
      googleEmail: profile.email,
      previousOwnerId: existingLink.userId,
      newOwnerId: userId,
    });
    throw AppError.conflict("Google account already linked");
  }

  const tokenData = {
    accessToken: encrypt(tokens.access_token),
    ...(tokens.refresh_token ? { refreshToken: encrypt(tokens.refresh_token) } : {}),
    ...(tokens.expires_in ? { expiresAt: new Date(Date.now() + tokens.expires_in * 1000) } : {}),
    ...(tokens.scope ? { scope: tokens.scope } : {}),
  };

  await prisma.oAuthAccount.upsert({
    where: {
      provider_providerAccountId: {
        provider: "google",
        providerAccountId: profile.id,
      },
    },
    update: tokenData,
    create: {
      userId,
      provider: "google",
      providerAccountId: profile.id,
      ...tokenData,
    },
  });
}

async function _handler_GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  try {
    if (error) {
      logger.warn("Google OAuth error", { error });
      return redirect(req, "/dashboard/settings?tab=social&error=google_connect_cancelled");
    }

    if (!code || !state) {
      return redirect(req, "/dashboard/settings?tab=social&error=missing_parameters");
    }

    const storedState = await prisma.oAuthState.findUnique({ where: { state } });
    if (storedState?.provider !== "google") {
      return redirect(req, "/dashboard/settings?tab=social&error=invalid_state");
    }

    const session = await auth();
    if (!session?.user?.id || session.user.id !== storedState.userId) {
      await prisma.oAuthState.delete({ where: { state } }).catch(() => {});
      logger.warn("Google OAuth state owner mismatch", {
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

    const redirectUri = appUrl("/api/auth/google/callback", req.nextUrl.origin);
    
    const tokens = await exchangeGoogleCodeForTokens(code, redirectUri);
    const profile = await fetchGoogleUserProfile(tokens.access_token);
    await verifyAndLinkGoogleAccount(storedState.userId, profile, tokens);

    logger.info("Google OAuth linked successfully", { userId: storedState.userId, email: profile.email });
    return redirect(req, "/dashboard/settings?tab=social&success=google_connected");
  } catch (err: unknown) {
    logger.error("Google callback error", err);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("config missing")) {
      return redirect(req, "/dashboard/settings?tab=social&error=google_config_missing");
    }
    if (msg.includes("email mismatch")) {
      return redirect(req, "/dashboard/settings?tab=social&error=google_email_mismatch");
    }
    if (msg.includes("already linked")) {
      return redirect(req, "/dashboard/settings?tab=social&error=google_account_already_linked");
    }
    return redirect(req, "/dashboard/settings?tab=social&error=google_connect_failed");
  }
}

// Wrapped handlers via apiWrapper
export const GET = apiWrapper(_handler_GET);
