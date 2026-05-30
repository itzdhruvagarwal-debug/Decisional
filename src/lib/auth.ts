/**
 * Authentication Configuration - NextAuth.js
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
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

import { checkRateLimit } from "./rate-limit";
import { logActivity, ActivityAction } from "./audit";
import { isVPNOrProxy, getDistanceBetweenIPs } from "./ipinfo";

const ACCESS_TOKEN_EXPIRY = 15 * 60 * 1000; // 15 minutes
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

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
          try {
            const headers = request instanceof Request ? request.headers : null;
            if (headers) {
              ip = headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
            }
          } catch {
            // Ignore header parsing errors
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

          // Find user (select cast as any to handle new schema fields not yet in Prisma Client)
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
              failedLoginAttempts: true,
              lockedUntil: true,
              influencerProfile: { select: { displayName: true } },
              brandProfile: { select: { companyName: true } },
            },
          });

          if (!user) {
            logger.warn("Failed login — user not found", { email, ip });
            throw new Error("USER_NOT_REGISTERED_ERROR_CODE");
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
              } as any,
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
            throw new Error("INVALID_PASSWORD");
          }

          // 1. Tor & Proxy / VPN blocking in production
          try {
            const isSuspiciousIP = await isVPNOrProxy(ip);
            if (isSuspiciousIP && process.env.NODE_ENV === "production") {
              logger.warn("Login attempt blocked — Suspicious IP detected (VPN/Proxy/Tor)", { email, ip });
              await logActivity({
                userId: user.id,
                action: ActivityAction.SECURITY_ALERT,
                entityType: "USER",
                entityId: user.id,
                metadata: { type: "SUSPICIOUS_IP", ip },
                ipAddress: ip,
              });
              throw new Error("SUSPICIOUS_IP_BLOCK: Login blocked due to suspicious IP detection (VPN/Proxy/Tor). Please disable your VPN.");
            }
          } catch (ipErr: any) {
            if (ipErr.message?.startsWith("SUSPICIOUS_IP_BLOCK")) throw ipErr;
            logger.warn("IP info lookup failed — non-fatal", { error: ipErr, ip });
          }

          // 2. Impossible Travel (Geo-suspicious Logins / Account Sharing detection)
          try {
            const lastDevice = await prisma.deviceFingerprint.findFirst({
              where: { userId: user.id },
              orderBy: { lastSeenAt: "desc" },
            });

            if (lastDevice && lastDevice.lastIp !== ip) {
              const distance = await getDistanceBetweenIPs(lastDevice.lastIp, ip);
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

                await logActivity({
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
                });

                // Require 2FA or block the session
                if (!user.isTwoFactorEnabled) {
                  throw new Error("SUSPICIOUS_LOGIN_BLOCK: Geo-suspicious login detected (Impossible Travel). Account security review required.");
                } else {
                  const code = (credentials as any).twoFactorCode;
                  if (!code) {
                    throw new Error("2FA_REQUIRED");
                  }
                }
              }
            }
          } catch (geoErr: any) {
            if (geoErr.message?.startsWith("SUSPICIOUS_LOGIN_BLOCK") || geoErr.message === "2FA_REQUIRED") throw geoErr;
            logger.warn("Impossible travel detection lookup failed — non-fatal", { error: geoErr, ip });
          }

          // Check if user is banned/suspended
          if (user.status === "BANNED") {
            logger.warn("Login blocked — account banned", { email, ip });
            return null;
          }

          if (user.status === "SUSPENDED") {
            logger.warn("Login blocked — account suspended", { email, ip });
            return null;
          }

          if (user.isTwoFactorEnabled && user.twoFactorSecret) {
            const code = (credentials as any).twoFactorCode;
            if (!code) {
              throw new Error("2FA_REQUIRED");
            }

            const isValidToken = await verify({
              token: code,
              secret: user.twoFactorSecret,
            });

            if (!isValidToken) {
              throw new Error("INVALID_2FA");
            }
          }

          // Update last login and reset the failed attempt counter
          await prisma.user.update({
            where: { id: user.id },

            data: {
              lastLoginAt: new Date(),
              failedLoginAttempts: 0, // Reset counter on successful login
              lockedUntil: null, // Clear any DB lock
            } as any,
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
              const existingDevice = await prisma.deviceFingerprint.findFirst({
                where: {
                  userId: user.id,
                  fingerprint,
                },
              });

              if (existingDevice) {
                await prisma.deviceFingerprint.update({
                  where: { id: existingDevice.id },
                  data: { lastSeenAt: new Date(), lastIp: ip, userAgent },
                });
              } else {
                await prisma.deviceFingerprint.create({
                  data: {
                    userId: user.id,
                    fingerprint,
                    lastIp: ip,
                    userAgent,
                  },
                });

                // Alert if new device? (Future enhancement)
              }
            } catch (e: any) {
              logger.warn("Failed to track device fingerprint", {
                error: e.message || e,
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
            name: name,
            email: user.email,
            userType: user.userType,
            status: user.status,
            verificationLevel: user.verificationLevel,
            trustScore: user.trustScore,
            xp: user.xp,
            level: user.level,
            refreshToken: refreshTokenNode.token,
          };
        } catch (entireAuthorizeError: any) {
          // Re-throw structured errors for 2FA, suspicious IPs, and geo-suspicious login errors
          const msg = entireAuthorizeError?.message;
          if (
            msg === "2FA_REQUIRED" ||
            msg === "INVALID_2FA" ||
            msg && msg.includes("USER_NOT_REGISTERED_ERROR_CODE") ||
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

          // SECURITY: Prevent pre-sign up account takeover / credentials hijack.
          // If the database user exists but does not have a linked Google OAuthAccount,
          // reject auto-linking to prevent an attacker with password access from hijacking.
          const linkedOAuth = await prisma.oAuthAccount.findFirst({
            where: { userId: dbUser.id, provider: "google" }
          });
          if (!linkedOAuth) {
            logger.warn("Google OAuth login rejected: credentials account exists but Google not linked", { email });
            return "/login?error=OAuthLinkConflict";
          }
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
            update: { accessToken: account.access_token },
            create: {
              userId: dbUser.id,
              provider: "google",
              providerAccountId: account.providerAccountId,
              accessToken: account.access_token,
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
        (user as any).userType = dbUser.userType;
        (user as any).status = dbUser.status;
        (user as any).verificationLevel = dbUser.verificationLevel;
        (user as any).trustScore = dbUser.trustScore;
        (user as any).xp = dbUser.xp;
        (user as any).level = dbUser.level;

        const refreshTokenNode = await generateRefreshToken(user.id);
        (user as any).refreshToken = refreshTokenNode.token;
        await storeActiveSessionToken(user.id, refreshTokenNode.token);

        return true;
      }
      return true;
    },
    async jwt({ token, user, account: _account, trigger: _trigger }) {
      // Initial sign in or manual update trigger
      if (user || _trigger === "update") {
        if (_trigger === "update" && token.id) {
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
              token.name = dbData.influencerProfile?.displayName || dbData.brandProfile?.companyName || dbData.email.split('@')[0];
            }
          } catch (_e) { }
        } else if (user) {
          token.id = user.id;
          token.userType = user.userType;
          token.status = user.status;
          token.verificationLevel = user.verificationLevel;
          token.trustScore = user.trustScore;
          token.xp = user.xp;
          token.level = user.level;
          token.name = user.name ?? token.name ?? null;
        }
        token.lastRefreshed = Date.now();

        // Store IP and UA for session pinning (Enterprise Security)
        try {
          const { headers } = await import("next/headers");
          const headerList = await headers();
          token.ip =
            headerList.get("x-forwarded-for")?.split(",")[0] || "unknown";
          token.ua = headerList.get("user-agent") || "unknown";
        } catch (_e) {
          // Fallback for cases where headers might not be available
        }

        // Set tokens
        token.refreshToken = (user as any).refreshToken;
        token.accessTokenExpires = Date.now() + ACCESS_TOKEN_EXPIRY;

        return token;
      }

      // Single Session Check & JWT Revocation (Kill Switch)
      try {
        if (token.id) {
          const activeToken = await redis.get(`active_session:${token.id}`);
          if (activeToken && activeToken !== token.refreshToken) {
            return { ...token, error: "SessionRevoked" };
          }

          // Periodically check user status (every 60 seconds) to revoke banned/suspended accounts
          const now = Date.now();
          const lastChecked = (token.lastCheckedStatus as number) || 0;
          if (now - lastChecked > 60 * 1000) {
            const dbUser = await prisma.user.findUnique({
              where: { id: token.id as string },
              select: { status: true },
            });
            if (dbUser) {
              if (dbUser.status === "BANNED" || dbUser.status === "SUSPENDED") {
                return { ...token, status: dbUser.status, error: "AccountBlocked" };
              }
              token.status = dbUser.status;
            } else {
              return { ...token, error: "SessionRevoked" };
            }
            token.lastCheckedStatus = now;
          }
        }

        // Explicit JTI Revocation
        if (token.jti) {
          const { isTokenRevoked } = await import("./blacklist");
          if (await isTokenRevoked(token.jti as string)) {
            return { ...token, error: "SessionRevoked" };
          }
        }
      } catch (_error) {
        // Ignore redis/db errors to prevent locking out valid users if services are temporarily down
      }

      // Return previous token if the access token has not expired yet
      if (Date.now() < ((token.accessTokenExpires as number) || 0)) {
        return token;
      }

      // Access token has expired, try to rotate
      try {
        if (!token.refreshToken) throw new Error("No refresh token");

        const newRefreshToken = await rotateRefreshToken(
          token.refreshToken as string,
        );

        if (!newRefreshToken) {
          // Token rotation failed (invalid or reused)
          return { ...token, error: "RefreshAccessTokenError" };
        }

        // Update single session to match new rotated token
        try {
          if (token.id) {
            await redis.set(
              `active_session:${token.id}`,
              newRefreshToken.token,
            );
          }
        } catch {
          // Ignore redis errors
        }

        return {
          ...token,
          refreshToken: newRefreshToken.token,
          accessTokenExpires: Date.now() + ACCESS_TOKEN_EXPIRY,
          lastRefreshed: Date.now(),
          error: undefined, // Clear error
        };
      } catch (error) {
        logger.error("Token rotation failed", error);
        return { ...token, error: "RefreshAccessTokenError" };
      }
    },
    async session({ session, token }) {
      if (token) {
        // Block banned/suspended users from getting valid sessions
        if (
          token.status === "BANNED" ||
          token.status === "SUSPENDED" ||
          token.error === "AccountBlocked"
        ) {
          throw new Error("Account is banned or suspended");
        }

        // Check for rotation errors
        if (token.error === "RefreshAccessTokenError") {
          throw new Error("RefreshAccessTokenError"); // This often triggers signout on client
        }

        if (token.error === "SessionRevoked") {
          throw new Error("SessionRevoked"); // Single session enforcement
        }

        session.user.id = token.id as string;
        session.user.name = token.name as string;
        session.user.userType = token.userType as string;
        session.user.status = token.status as string;
        session.user.verificationLevel = token.verificationLevel as string;
        session.user.trustScore = token.trustScore as number;
        session.user.xp = token.xp as number;
        session.user.level = token.level as number;
        (session as any).lastRefreshed = token.lastRefreshed as number | undefined;
        (session as any).error = token.error;
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
      await logActivity({
        userId: user.id as string,
        action: ActivityAction.LOGIN,
        entityType: "USER",
        entityId: user.id as string,
        metadata: { email: user.email },
      });
    },
    async signOut(message: any): Promise<void> {
      // Note: Token may be null on signOut depending on flow
      if (message?.token) {
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
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
});
