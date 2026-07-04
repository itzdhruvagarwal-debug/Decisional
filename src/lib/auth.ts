import { AppError } from "@/lib/errors";
/**
 * Authentication Configuration - NextAuth.js
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { randomUUID } from "crypto";
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
import { encrypt } from "./encryption";
import { env } from "@/env";

import { checkRateLimit } from "./rate-limit";
import { createActivityLog, ActivityAction } from "./audit";
import { decrypt } from "./encryption";

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

export const { handlers, signIn, signOut, auth } = NextAuth({
  basePath: "/api/auth",
  trustHost: true,
  providers: [
    ...(googleClientId && googleClientSecret
      ? [
        GoogleProvider({
          clientId: googleClientId,
          clientSecret: googleClientSecret,
          // allowDangerousEmailAccountLinking is intentionally DISABLED.
          // Enabling it allows OAuth account takeover: an attacker who creates a Google
          // account with a victim's email can access the victim's existing platform account.
          // Instead we handle the linking explicitly in the signIn callback below.
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
          // Get IP address for security logging
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

          // Redis-based Brute Force Protection (Advanced)
          const parsed = loginSchema.safeParse(credentials);
          if (!parsed.success) {
            logger.warn("Login attempt with invalid credentials schema", {
              ip,
            });
            return null;
          }

          const { email: rawEmail, password } = parsed.data;
          const email = rawEmail.toLowerCase().trim();

          // Check if IP is blacklisted/banned
          const { isIpBanned } = await import("./blacklist");
          if (await isIpBanned(ip)) {
            logger.warn(`Login blocked — blacklisted IP`, { ip });
            throw AppError.badRequest("SUSPICIOUS_IP_BLOCK: Login blocked due to suspicious IP detection.");
          }

          // Check IP limit
          const ipLimit = await checkRateLimit(ip, "LOGIN_IP");
          if (!ipLimit.success) {
            logger.warn(`Login blocked by IP rate limit`, { ip });
            return null;
          }

          // Check Email limit
          const emailLimit = await checkRateLimit(email, "LOGIN_EMAIL");
          if (!emailLimit.success) {
            logger.warn(`Login blocked by Email rate limit`, { email });
            return null;
          }

          // Find user with fields needed for login, 2FA, and geo-suspicious detection
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
            // Return generic error to prevent user enumeration
            return null;
          }

          // Check if account is DB-locked (brute-force lockout)
          if (user.lockedUntil && user.lockedUntil > new Date()) {
            logger.warn("Login blocked — account locked", {
              email,
              ip,
              lockedUntil: user.lockedUntil,
            });
            return null;
          }

          // Check password
          const isValidPassword = await compare(password, user.passwordHash);
          if (!isValidPassword) {
            const newFailCount = (user.failedLoginAttempts || 0) + 1;
            const lockThreshold = 10;
            const lockDurationMs = 30 * 60 * 1000; // 30 minutes

            await prisma.user.update({
              where: { id: user.id },

              data: {
                failedLoginAttempts: newFailCount,
                // Lock account after 10 failures for 30 minutes
                ...(newFailCount >= lockThreshold
                  ? {
                    lockedUntil: new Date(Date.now() + lockDurationMs),
                  }
                  : {}),
              },
            });

            // Log failed attempt
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
              logger.warn("Failed to log failed login attempt", { error: logErr, email });
            }

            logger.warn("Failed login — invalid password", { email, ip });
            throw AppError.badRequest("INVALID_PASSWORD");
          }

          // 1. Tor & Proxy / VPN blocking in production
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

          // 2. Impossible Travel (Geo-suspicious Logins / Account Sharing detection)
          if (user) {
            try {
              const lastDevice = await prisma.deviceFingerprint.findFirst({
                where: { userId: user.id },
                orderBy: { lastSeenAt: "desc" },
              });

              if (lastDevice && lastDevice.lastIp !== ip && lastDevice.lastLocation) {
                const currentGeo = await getIpDetails(ip);
                if (currentGeo) {
                  const [lastLatStr, lastLonStr] = lastDevice.lastLocation.split(",");
                  const lastLat = Number(lastLatStr);
                  const lastLon = Number(lastLonStr);
                  
                  if (!Number.isNaN(lastLat) && !Number.isNaN(lastLon)) {
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

                    // If distance is > 1000 km and time difference is less than 4 hours, flag impossible travel
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

                      // Require 2FA or block the session
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
                }
              }
            } catch (err) {
              if ((err instanceof Error ? err.message : String(err))?.startsWith("SUSPICIOUS_LOGIN_BLOCK")) throw err;
              logger.warn("Impossible travel detection failed — non-fatal", { error: err, email });
            }
          }

          // Check if user is banned/suspended/deleted
          if (user.status === "BANNED") {
            logger.warn("Login blocked — account banned", { email, ip });
            return null;
          }

          if (user.status === "SUSPENDED") {
            logger.warn("Login blocked — account suspended", { email, ip });
            return null;
          }

          if (user.status === "DELETED") {
            logger.warn("Login blocked — account deleted", { email, ip });
            return null;
          }

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
              let isRecoveryCodeValid = false;
              if (user.twoFactorRecoveryCodes) {
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
                    isRecoveryCodeValid = true;
                    // Remove the used recovery code (one-time consumption)
                    const updatedHashes = recoveryHashes.filter((_, idx) => idx !== matchingIndex);
                    await prisma.user.update({
                      where: { id: user.id },
                      data: {
                        twoFactorRecoveryCodes: JSON.stringify(updatedHashes),
                      },
                    });
                  }
                } catch (recErr) {
                  logger.error("Failed to verify/consume 2FA recovery code", recErr);
                }
              }

              if (!isRecoveryCodeValid) {
                throw AppError.badRequest("INVALID_2FA");
              }
            }
          }

          // Update last login and reset the failed attempt counter
          await prisma.user.update({
            where: { id: user.id },

            data: {
              lastLoginAt: new Date(),
              failedLoginAttempts: 0, // Reset counter on successful login
              lockedUntil: null, // Clear any DB lock
            },
          });

          // Log successful attempt
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

          // Track Device Fingerprint (Simple version: IP + UserAgent)
          const fingerprint = `${ip}|${userAgent}`;
          // Non-blocking device tracking
          (async () => {
            try {
              const geoDetails = await getIpDetails(ip);
              const lastLocation = geoDetails ? `${geoDetails.latitude},${geoDetails.longitude}` : null;

              const existingDevice = await prisma.deviceFingerprint.findFirst({
                where: {
                  userId: user.id,
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
                    userId: user.id,
                    fingerprint,
                    lastIp: ip,
                    userAgent,
                    lastLocation,
                  },
                });

                // Alert if new device? (Future enhancement)
              }
            } catch (e: unknown) {
              logger.warn("Failed to track device fingerprint", {
                error: e instanceof Error ? e.message : String(e),
              });
            }
          })().catch((err) => {
            logger.warn("Device fingerprint tracking failed", { error: err, userId: user.id });
          });

          const refreshTokenNode = await generateRefreshToken(user.id);
          // Enforce single session: Store the active refresh token as the current session in Redis
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
          // Re-throw structured errors for 2FA, suspicious IPs, and geo-suspicious login errors
          const msg = entireAuthorizeError instanceof Error ? entireAuthorizeError.message : String(entireAuthorizeError);
          if (
            msg === "2FA_REQUIRED" ||
            msg === "INVALID_2FA" ||
            msg && msg.includes("INVALID_PASSWORD") ||
            msg && msg.includes("SUSPICIOUS_IP_BLOCK") ||
            msg && msg.includes("SUSPICIOUS_LOGIN_BLOCK")
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
        // Google may not always return an email (e.g., accounts with no verified email)
        const email = user.email;
        if (!email) {
          logger.warn("Google OAuth login rejected: no email provided");
          return false; // Reject sign-in without an email
        }

        const dbUser = await prisma.user.findUnique({ where: { email } });

        // SECURITY: Check if existing account is banned or suspended
        // Without this check, a banned user can bypass enforcement by using Google OAuth
        if (dbUser) {
          if (dbUser.status === "BANNED") {
            logger.warn("Google OAuth login rejected for banned account", {
              email,
            });
            return false;
          }
          if (dbUser.status === "SUSPENDED") {
            logger.warn("Google OAuth login rejected for suspended account", {
              email,
            });
            return false;
          }
          if (dbUser.status === "DELETED") {
            logger.warn("Google OAuth login rejected for deleted account", {
              email,
            });
            return false;
          }

          // SECURITY NOTE: If no linked Google OAuthAccount exists yet, we allow the
          // flow to continue — the upsert below will create the link on first sign-in.
          // This is safe: Google has already verified ownership of the email address.
          // Auto-linking on first Google sign-in is intentional and expected behaviour.
        }

        if (!dbUser) {
          logger.warn("Google OAuth login rejected: user not registered", { email });
          // Redirect to register page instead of silently creating an INFLUENCER account without phone verification
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
          // Don't block sign-in for OAuth linking failures — the user DB record exists
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
      return true;
    },
    async jwt({ token, user, account: _account, trigger: _trigger }): Promise<Record<string, unknown>> {
      if (user || _trigger === "update") {
        return handleInitialJwtSession(token, user, _trigger);
      }

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
          throw AppError.badRequest("Account is banned, suspended, or deleted");
        }

        // Check for rotation errors
        if (token.error === "RefreshAccessTokenError") {
          throw AppError.badRequest("RefreshAccessTokenError"); // This often triggers signout on client
        }

        if (token.error === "SessionRevoked") {
          throw AppError.badRequest("SessionRevoked"); // Single session enforcement
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

async function handleInitialJwtSession(
  token: Record<string, unknown>,
  user: any,
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
    } catch (_e) { }
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
    } catch { }

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
