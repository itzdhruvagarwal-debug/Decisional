import { AppError } from "@/lib/errors";
/**
 * Authentication Configuration - NextAuth.js
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { randomUUID } from "node:crypto";
import prisma from "./db";
import { loginSchema } from "./validations";
import { logger } from "./logger";
import { redis } from "./redis";
import {
  generateRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from "./tokens";
import GoogleProvider from "next-auth/providers/google";
import { verify } from "otplib";
import { encrypt, decrypt } from "./encryption";
import { env } from "@/env";

import { checkRateLimit } from "./rate-limit";
import { createActivityLog, ActivityAction } from "./audit";

const ACCESS_TOKEN_EXPIRY = 15 * 60 * 1000; // 15 minutes

import { isVPNOrProxy, getIpDetails } from "./ipinfo";

const googleClientId = env.GOOGLE_CLIENT_ID;
const googleClientSecret = env.GOOGLE_CLIENT_SECRET;

async function storeActiveSessionToken(userId: string, refreshToken: string) {
  try {
    await redis.set(`active_session:${userId}`, refreshToken);
  } catch (error) {
    logger.error("Failed to persist active session token", error, { userId });
    if (process.env.NODE_ENV === "production") {
      throw error;
    }
  }
}

function resolveClientIpAndAgent(request: unknown) {
  let ip = "unknown";
  const req = request as Request & { ip?: string };
  const headers = request instanceof Request ? request.headers : null;
  if (req && typeof req.ip === "string" && req.ip) {
    ip = req.ip;
  } else if (headers) {
    ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  }

  const userAgent =
    request instanceof Request
      ? request.headers.get("user-agent") || "unknown"
      : "unknown";

  return { ip, userAgent };
}

async function checkLoginLimitsAndBlacklist(ip: string, email: string) {
  const { isIpBanned } = await import("./blacklist");
  if (await isIpBanned(ip)) {
    logger.warn(`Login blocked — blacklisted IP`, { ip });
    throw AppError.badRequest("SUSPICIOUS_IP_BLOCK: Login blocked due to suspicious IP detection.");
  }

  const ipLimit = await checkRateLimit(ip, "LOGIN_IP");
  if (!ipLimit.success) {
    logger.warn(`Login blocked by IP rate limit`, { ip });
    return false;
  }

  const emailLimit = await checkRateLimit(email, "LOGIN_EMAIL");
  if (!emailLimit.success) {
    logger.warn(`Login blocked by Email rate limit`, { email });
    return false;
  }

  return true;
}

async function handleFailedLoginAttempt(user: { id: string; failedLoginAttempts?: number | null }, email: string, ip: string, userAgent: string) {
  const newFailCount = (user.failedLoginAttempts || 0) + 1;
  const lockThreshold = 10;
  const lockDurationMs = 30 * 60 * 1000; // 30 minutes

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: newFailCount,
      ...(newFailCount >= lockThreshold
        ? { lockedUntil: new Date(Date.now() + lockDurationMs) }
        : {}),
    },
  });

  try {
    await prisma.loginAttempt.create({
      data: {
        userId: user.id,
        email,
        ipAddress: ip,
        userAgent,
        success: false,
        failureReason: "INVALID_PASSWORD",
      },
    });
  } catch (logErr) {
    logger.warn("Failed to log failed login attempt", {
      error: logErr instanceof Error ? logErr.message : String(logErr),
      email,
    });
  }

  logger.warn("Failed login — invalid password", { email, ip });
  throw AppError.badRequest("INVALID_PASSWORD");
}

async function checkImpossibleTravelInternal(user: { id: string; isTwoFactorEnabled?: boolean }, ip: string, lastDevice: { lastIp?: string; lastLocation?: string | null; lastSeenAt: Date } | null, credentials: Record<string, unknown>) {
  if (!lastDevice || lastDevice.lastIp === ip || !lastDevice.lastLocation) return;

  const currentGeo = await getIpDetails(ip);
  if (!currentGeo) return;

  const [lastLatStr, lastLonStr] = lastDevice.lastLocation.split(",");
  const lastLat = Number(lastLatStr);
  const lastLon = Number(lastLonStr);
  
  if (Number.isNaN(lastLat) || Number.isNaN(lastLon)) return;

  const R = 6371; // Radius of the earth in km
  const dLat = (currentGeo.latitude - lastLat) * Math.PI / 180;
  const dLon = (currentGeo.longitude - lastLon) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lastLat * Math.PI / 180) * Math.cos(currentGeo.latitude * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  const timeDiffHours = (Date.now() - new Date(lastDevice.lastSeenAt).getTime()) / (3600 * 1000);

  if (distance > 1000 && timeDiffHours < 4) {
    logger.warn("Geo-suspicious login detected (Impossible Travel)", {
      userId: user.id,
      ip,
      lastIp: lastDevice.lastIp,
      distance,
      timeDiffHours,
    });

    await createActivityLog({
      userId: user.id,
      action: ActivityAction.SECURITY_ALERT,
      entityType: "USER",
      entityId: user.id,
      metadata: {
        type: "IMPOSSIBLE_TRAVEL",
        ip,
        lastIp: lastDevice.lastIp,
        distance,
        timeDiffHours,
      },
      ipAddress: ip,
    }).catch(() => {});

    if (user.isTwoFactorEnabled) {
      const code = (credentials as Record<string, string>).twoFactorCode;
      if (!code) {
        throw AppError.badRequest("2FA_REQUIRED");
      }
    } else {
      throw AppError.badRequest("SUSPICIOUS_LOGIN_BLOCK: Geo-suspicious login detected (Impossible Travel). Account security review required.");
    }
  }
}

async function verifyImpossibleTravelAndVpn(user: { id: string; isTwoFactorEnabled?: boolean }, ip: string, email: string, credentials: Record<string, unknown>) {
  try {
    const isSuspiciousIP = await isVPNOrProxy(ip);
    if (isSuspiciousIP && process.env.NODE_ENV === "production") {
      logger.warn("Login attempt blocked — Suspicious IP detected (VPN/Proxy/Tor)", { email, ip });
      await createActivityLog({
        userId: user.id,
        action: ActivityAction.SECURITY_ALERT,
        entityType: "USER",
        entityId: user.id,
        metadata: { type: "SUSPICIOUS_IP", ip },
        ipAddress: ip,
      });
      throw AppError.badRequest("SUSPICIOUS_IP_BLOCK: Login blocked due to suspicious IP detection (VPN/Proxy/Tor). Please disable your VPN.");
    }
  } catch (ipErr: unknown) {
    const ipErrMsg = ipErr instanceof Error ? ipErr.message : String(ipErr);
    if (ipErrMsg.startsWith("SUSPICIOUS_IP_BLOCK")) throw ipErr;
    logger.warn("IP info lookup failed — non-fatal", { error: ipErr, ip });
  }

  try {
    const lastDevice = await prisma.deviceFingerprint.findFirst({
      where: { userId: user.id },
      orderBy: { lastSeenAt: "desc" },
    });

    await checkImpossibleTravelInternal(user, ip, lastDevice, credentials);
  } catch (err) {
    if ((err instanceof Error ? err.message : String(err))?.startsWith("SUSPICIOUS_LOGIN_BLOCK")) throw err;
    logger.warn("Impossible travel detection failed — non-fatal", { error: err, email });
  }
}

async function checkRecoveryCodeFallback(user: { id: string; twoFactorRecoveryCodes?: string | null }, code: string): Promise<boolean> {
  if (!user.twoFactorRecoveryCodes) return false;
  try {
    const recoveryHashes = JSON.parse(user.twoFactorRecoveryCodes) as string[];
    const matchingIndex = await (async () => {
      for (let i = 0; i < recoveryHashes.length; i++) {
        const hash = recoveryHashes[i];
        if (hash) {
          const match = await compare(code.toUpperCase(), hash);
          if (match) return i;
        }
      }
      return -1;
    })();

    if (matchingIndex !== -1) {
      const updatedHashes = recoveryHashes.filter((_, idx) => idx !== matchingIndex);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          twoFactorRecoveryCodes: JSON.stringify(updatedHashes),
        },
      });
      return true;
    }
  } catch (recErr) {
    logger.error("Failed to verify/consume 2FA recovery code", recErr);
  }
  return false;
}

async function verifyTwoFactorCode(user: { isTwoFactorEnabled?: boolean; twoFactorSecret?: string | null; twoFactorRecoveryCodes?: string | null; id: string }, credentials: Record<string, unknown>) {
  if (user.isTwoFactorEnabled && user.twoFactorSecret) {
    const code = (credentials as Record<string, string>).twoFactorCode;
    if (!code) {
      throw AppError.badRequest("2FA_REQUIRED");
    }

    const verifyResult = await verify({
      token: code,
      secret: (() => {
        try {
          return decrypt(user.twoFactorSecret!);
        } catch {
          return user.twoFactorSecret!;
        }
      })(),
    });

    const isValidToken =
      typeof verifyResult === "object" && verifyResult !== null
        ? (verifyResult as { valid: boolean }).valid
        : verifyResult;

    if (!isValidToken) {
      const isRecoveryCodeValid = await checkRecoveryCodeFallback(user, code);
      if (!isRecoveryCodeValid) {
        throw AppError.badRequest("INVALID_2FA");
      }
    }
  }
}

function trackUserDeviceFingerprint(userId: string, ip: string, userAgent: string) {
  const fingerprint = `${ip}|${userAgent}`;
  (async () => {
    try {
      const geoDetails = await getIpDetails(ip);
      const lastLocation = geoDetails ? `${geoDetails.latitude},${geoDetails.longitude}` : null;

      const existingDevice = await prisma.deviceFingerprint.findFirst({
        where: {
          userId,
          fingerprint,
        },
      });

      if (existingDevice) {
        await prisma.deviceFingerprint.update({
          where: { id: existingDevice.id },
          data: {
            lastSeenAt: new Date(),
            lastIp: ip,
            userAgent,
            ...(lastLocation ? { lastLocation } : {}),
          },
        });
      } else {
        await prisma.deviceFingerprint.create({
          data: {
            userId,
            fingerprint,
            lastIp: ip,
            userAgent,
            lastLocation,
          },
        });
      }
    } catch (e: unknown) {
      logger.warn("Failed to track device fingerprint", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  })().catch((err) => {
    logger.warn("Device fingerprint tracking failed", { error: err, userId });
  });
}

async function handleGoogleOAuthSignIn(user: { email?: string | null; id?: string; userType?: string; status?: string; verificationLevel?: string; trustScore?: number; xp?: number; level?: number }, account: { provider?: string; providerAccountId: string; access_token?: string | null }): Promise<boolean | string> {
  const email = user.email;
  if (!email) {
    logger.warn("Google OAuth login rejected: no email provided");
    return false;
  }

  const dbUser = await prisma.user.findUnique({ where: { email } });

  if (dbUser) {
    if (dbUser.status === "BANNED") {
      logger.warn("Google OAuth login rejected for banned account", { email });
      return false;
    }
    if (dbUser.status === "SUSPENDED") {
      logger.warn("Google OAuth login rejected for suspended account", { email });
      return false;
    }
    if (dbUser.status === "DELETED") {
      logger.warn("Google OAuth login rejected for deleted account", { email });
      return false;
    }
  }

  if (!dbUser) {
    logger.warn("Google OAuth login rejected: user not registered", { email });
    return "/register?error=OAuthAccountNotRegistered";
  }

  try {
    await prisma.oAuthAccount.upsert({
      where: {
        provider_providerAccountId: {
          provider: "google",
          providerAccountId: account.providerAccountId,
        },
      },
      update: { accessToken: account.access_token ? encrypt(account.access_token) : null },
      create: {
        userId: dbUser.id,
        provider: "google",
        providerAccountId: account.providerAccountId,
        accessToken: account.access_token ? encrypt(account.access_token) : null,
      },
    });
  } catch (oauthLinkError) {
    logger.warn("Failed to upsert OAuthAccount during Google sign-in", {
      error: oauthLinkError,
      email,
    });
  }

  user.id = dbUser.id;
  user.userType = dbUser.userType;
  user.status = dbUser.status;
  user.verificationLevel = dbUser.verificationLevel;
  user.trustScore = dbUser.trustScore;
  user.xp = dbUser.xp;
  user.level = dbUser.level;

  await generateRefreshToken(user.id);
  return true;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  basePath: "/api/auth",
  trustHost: true,
  providers: [
    ...(googleClientId && googleClientSecret
      ? [
        GoogleProvider({
          clientId: googleClientId,
          clientSecret: googleClientSecret,
          allowDangerousEmailAccountLinking: false,
        }),
      ]
      : []),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        twoFactorCode: { label: "2FA Code", type: "text" },
      },
      async authorize(credentials, request) {
        try {
          const { ip, userAgent } = resolveClientIpAndAgent(request);

          const parsed = loginSchema.safeParse(credentials);
          if (!parsed.success) {
            logger.warn("Login attempt with invalid credentials schema", { ip });
            return null;
          }

          const { email: rawEmail, password } = parsed.data;
          const email = rawEmail.toLowerCase().trim();

          const limitsPassed = await checkLoginLimitsAndBlacklist(ip, email);
          if (!limitsPassed) return null;

          const user = await prisma.user.findUnique({
            where: { email },
            select: {
              id: true,
              email: true,
              passwordHash: true,
              userType: true,
              status: true,
              verificationLevel: true,
              trustScore: true,
              xp: true,
              level: true,
              isTwoFactorEnabled: true,
              twoFactorSecret: true,
              twoFactorRecoveryCodes: true,
              failedLoginAttempts: true,
              lockedUntil: true,
              influencerProfile: { select: { displayName: true } },
              brandProfile: { select: { companyName: true } },
            },
          });

          if (!user) {
            logger.warn("Failed login — user not found", { email, ip });
            return null;
          }

          if (user.lockedUntil && user.lockedUntil > new Date()) {
            logger.warn("Login blocked — account locked", {
              email,
              ip,
              lockedUntil: user.lockedUntil,
            });
            return null;
          }

          if (user.status === "BANNED" || user.status === "SUSPENDED" || user.status === "DELETED") {
            logger.warn(`Login blocked — account ${user.status.toLowerCase()}`, { email, ip });
            return null;
          }

          const isValidPassword = await compare(password, user.passwordHash);
          if (!isValidPassword) {
            await handleFailedLoginAttempt(user, email, ip, userAgent);
          }

          await verifyImpossibleTravelAndVpn(user, ip, email, credentials);

          await verifyTwoFactorCode(user, credentials);

          await prisma.user.update({
            where: { id: user.id },
            data: {
              lastLoginAt: new Date(),
              failedLoginAttempts: 0,
              lockedUntil: null,
            },
          });

          await prisma.loginAttempt.create({
            data: {
              userId: user.id,
              email,
              ipAddress: ip,
              userAgent,
              success: true,
            },
          });

          const name =
            user.influencerProfile?.displayName ||
            user.brandProfile?.companyName ||
            user.email.split("@")[0];

          trackUserDeviceFingerprint(user.id, ip, userAgent);

          const refreshTokenNode = await generateRefreshToken(user.id);
          await storeActiveSessionToken(user.id, refreshTokenNode.token);

          return {
            id: user.id,
            name: name ?? null,
            email: user.email,
            userType: user.userType,
            status: user.status,
            verificationLevel: user.verificationLevel,
            trustScore: user.trustScore,
            xp: user.xp,
            level: user.level,
            refreshToken: refreshTokenNode.token,
          };
        } catch (entireAuthorizeError: unknown) {
          const msg = entireAuthorizeError instanceof Error ? entireAuthorizeError.message : String(entireAuthorizeError);
          if (
            msg === "2FA_REQUIRED" ||
            msg === "INVALID_2FA" ||
            msg?.includes("INVALID_PASSWORD") ||
            msg?.includes("SUSPICIOUS_IP_BLOCK") ||
            msg?.includes("SUSPICIOUS_LOGIN_BLOCK")
          ) {
            throw entireAuthorizeError;
          }
          logger.error("CRITICAL: authorize crashed", entireAuthorizeError);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        return handleGoogleOAuthSignIn(user, account);
      }
      return true;
    },
    async jwt({ token, user, account: _account, trigger: _trigger }): Promise<Record<string, unknown>> {
      let t = token;
      if (user || _trigger === "update") {
        t = await handleInitialJwtSession(token, user, _trigger);
      } else {
        t = await handleExistingJwtSession(token);
      }

      // Track active JTI for session invalidation on password change or admin action
      if (t.id && t.jti && !t.error) {
        await trackActiveJtiInRedis(t.id as string, t.jti as string);
      }

      return t;
    },
    async session({ session, token }) {
      if (token) {
        // Block banned/suspended/deleted users from getting valid sessions
        if (
          token.status === "BANNED" ||
          token.status === "SUSPENDED" ||
          token.status === "DELETED" ||
          token.error === "AccountBlocked"
        ) {
          session.error = "AccountBlocked";
        }

        // Check for rotation errors
        if (token.error === "RefreshAccessTokenError") {
          session.error = "RefreshAccessTokenError";
        }

        if (token.error === "SessionRevoked") {
          session.error = "SessionRevoked";
        }

        session.user.id = token.id as string;
        session.user.name = (token.name as string | null | undefined) ?? null;
        session.user.userType = (token.userType as string | undefined) ?? "INFLUENCER";
        session.user.status = (token.status as string | undefined) ?? "PENDING_VERIFICATION";
        session.user.verificationLevel = (token.verificationLevel as string | undefined) ?? "NONE";
        session.user.trustScore = (token.trustScore as number | undefined) ?? 600;
        session.user.xp = (token.xp as number | undefined) ?? 0;
        session.user.level = (token.level as number | undefined) ?? 1;
        if (token.lastRefreshed !== undefined) {
          session.lastRefreshed = token.lastRefreshed as number;
        }
        if (token.error !== undefined) {
          session.error = token.error;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days (not 30 — this is a financial platform)
  },
  events: {
    async signIn({ user }) {
      logger.info("User signed in", { userId: user.id, email: user.email });
      await createActivityLog({
        userId: user.id as string,
        action: ActivityAction.LOGIN,
        entityType: "USER",
        entityId: user.id as string,
        metadata: { email: user.email },
      }).catch(() => {});
    },
    async signOut(
      message:
        | { token?: import("next-auth/jwt").JWT | null }
        | { session?: void | import("@auth/core/adapters").AdapterSession | null },
    ): Promise<void> {
      // Note: Token may be null on signOut depending on flow
      if (message && "token" in message && message.token) {
        const userId = message.token.id || message.token.sub;
        logger.info("User signed out", { userId });
        if (message.token.refreshToken) {
          await revokeRefreshToken(message.token.refreshToken as string);
        }
        if (userId) {
          try {
            await redis.del(`active_session:${userId}`);
          } catch {
            // ignore
          }
        }
      }
    },
    async session() {
      // Intentionally empty — auditing is handled per-action
    },
  },
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
});

export interface AuthUser {
  id: string;
  email?: string | null;
  name?: string | null;
  userType?: string | null;
  status?: string | null;
  verificationLevel?: string | null;
  trustScore?: number | null;
  xp?: number | null;
  level?: number | null;
  refreshToken?: string | null;
}

async function handleExistingJwtSession(token: Record<string, unknown>): Promise<Record<string, unknown>> {
  const securityCheck = await checkSessionSecurityAndStatus(token);
  if (!securityCheck.valid) {
    return {
      ...token,
      ...(securityCheck.status ? { status: securityCheck.status } : {}),
      error: securityCheck.status ? "AccountBlocked" : "SessionRevoked",
    };
  }

  if (Date.now() < ((token.accessTokenExpires as number) || 0)) {
    return token;
  }
  return rotateSessionToken(token);
}

async function trackActiveJtiInRedis(userId: string, jti: string): Promise<void> {
  try {
    await redis.sadd(`user:jtis:${userId}`, jti);
    await redis.expire(`user:jtis:${userId}`, 7 * 24 * 60 * 60); // 7 days TTL matching NextAuth session maxAge
  } catch (err) {
    logger.warn("Failed to track JTI in Redis", { error: String(err), userId });
  }
}

async function handleInitialJwtSession(
  token: Record<string, unknown>,
  user: AuthUser | null | undefined,
  trigger: string | undefined
): Promise<Record<string, unknown>> {
  if (trigger === "update" && token.id) {
    try {
      const dbData = await prisma.user.findUnique({
        where: { id: token.id as string },
        select: {
          userType: true,
          status: true,
          verificationLevel: true,
          trustScore: true,
          xp: true,
          level: true,
          email: true,
          influencerProfile: { select: { displayName: true } },
          brandProfile: { select: { companyName: true } },
        }
      });
      if (dbData) {
        token.userType = dbData.userType;
        token.status = dbData.status;
        token.verificationLevel = dbData.verificationLevel;
        token.trustScore = dbData.trustScore;
        token.xp = dbData.xp;
        token.level = dbData.level;
        token.name = dbData.influencerProfile?.displayName || dbData.brandProfile?.companyName || dbData.email.split('@')[0] || null;
      }
    } catch (_e) {
      logger.warn("Failed to fetch fresh user data for token update", {
        error: _e instanceof Error ? _e.message : String(_e),
        userId: token.id,
      });
    }
  } else if (user) {
    token.id = user.id;
    token.userType = user.userType ?? "INFLUENCER";
    token.status = user.status ?? "PENDING_VERIFICATION";
    token.verificationLevel = user.verificationLevel ?? "NONE";
    token.trustScore = user.trustScore ?? 600;
    token.xp = user.xp ?? 0;
    token.level = user.level ?? 1;
    token.name = user.name ?? token.name ?? null;

    (async () => {
      try {
        const { checkAndAwardBadges } = await import("./gamification-engine");
        await checkAndAwardBadges(user.id, "LOGIN");
      } catch (err) {
        logger.error("Failed to check login badges", err);
      }
    })().catch(() => {});
  }
  token.lastRefreshed = Date.now();
  token.jti = token.jti || randomUUID();

  try {
    const { headers } = await import("next/headers");
    const headerList = await headers();
    token.ip =
      headerList.get("x-real-ip") ||
      headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    token.ua = headerList.get("user-agent") || "unknown";
  } catch (_e) {
    logger.debug("Failed to get request headers for JWT enrichment", { error: _e });
  }

  if (user?.refreshToken) {
    token.refreshToken = user.refreshToken;
  }
  token.accessTokenExpires = Date.now() + ACCESS_TOKEN_EXPIRY;

  return token;
}

async function verifyUserAccountStatus(userId: string, token: Record<string, unknown>, now: number): Promise<{ valid: boolean; status?: string }> {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });
  if (dbUser) {
    if (dbUser.status === "BANNED" || dbUser.status === "SUSPENDED" || dbUser.status === "DELETED") {
      return { valid: false, status: dbUser.status };
    }
    token.status = dbUser.status;
  } else {
    return { valid: false };
  }
  token.lastCheckedStatus = now;
  return { valid: true };
}

async function isSessionRevokedByJti(jti: unknown): Promise<boolean> {
  if (typeof jti === "string") {
    const { isTokenRevoked } = await import("./blacklist");
    return await isTokenRevoked(jti);
  }
  return false;
}

async function verifyActiveSessionToken(userId: string, currentRefreshToken: unknown): Promise<boolean> {
  const activeToken = await redis.get(`active_session:${userId}`);
  return !activeToken || activeToken === currentRefreshToken;
}

async function checkSessionSecurityAndStatus(token: Record<string, unknown>): Promise<{ valid: boolean; status?: string }> {
  try {
    if (typeof token.id === "string") {
      const isSessionValid = await verifyActiveSessionToken(token.id, token.refreshToken);
      if (!isSessionValid) return { valid: false };

      const now = Date.now();
      const lastChecked = (token.lastCheckedStatus as number) || 0;
      if (now - lastChecked > 60 * 1000) {
        const check = await verifyUserAccountStatus(token.id, token, now);
        if (!check.valid) return check;
      }
    }

    if (await isSessionRevokedByJti(token.jti)) {
      return { valid: false };
    }
  } catch (error) {
    logger.error(
      "Session security check failed; revoking request",
      error,
      typeof token.id === "string" ? { userId: token.id } : {},
    );
    if (process.env.NODE_ENV !== "production") {
      return { valid: true };
    }
    return { valid: false };
  }
  return { valid: true };
}

async function rotateSessionToken(token: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    if (!token.refreshToken) throw AppError.badRequest("No refresh token");

    const newRefreshToken = await rotateRefreshToken(
      token.refreshToken as string,
    );

    if (!newRefreshToken) {
      return { ...token, error: "RefreshAccessTokenError" };
    }

    try {
      if (typeof token.id === "string") {
        await redis.set(
          `active_session:${token.id}`,
          newRefreshToken.token,
        );
      }
    } catch (redisErr) {
      logger.warn("Failed to set active session in Redis during token rotation", {
        error: redisErr instanceof Error ? redisErr.message : String(redisErr),
        userId: token.id,
      });
    }

    return {
      ...token,
      refreshToken: newRefreshToken.token,
      accessTokenExpires: Date.now() + ACCESS_TOKEN_EXPIRY,
      lastRefreshed: Date.now(),
      error: undefined,
    };
  } catch (error) {
    logger.error("Token rotation failed", error);
    return { ...token, error: "RefreshAccessTokenError" };
  }
}
