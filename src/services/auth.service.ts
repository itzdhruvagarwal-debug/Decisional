import prisma from "@/lib/db";
import { hash, compare } from "bcryptjs";
import { createHash, randomBytes } from "crypto";

import { checkRateLimit } from "@/lib/rate-limit";
import { hasPermission, Permission } from "@/lib/rbac";
import { UserType, OtpTokenType } from "@prisma/client";
import { logger } from "@/lib/logger";
import { sendPasswordResetEmail } from "@/lib/email";

import { generateReferralCode } from "@/lib/utils";
import type { RegisterInput } from "@/lib/validations";

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Centralized Authentication Service
 * Wraps NextAuth, DB, and RBAC logic into a cohesive service.
 */
export class AuthService {
  /**
   * Register a new user with advanced validation and initial setup
   */
  static async registerUser(data: RegisterInput, ip: string) {
    const limit = await checkRateLimit(ip, "REGISTER");
    if (!limit.success) {
      throw new Error(
        `Rate limit exceeded. Try again in ${Math.ceil((limit.reset - Date.now() / 1000) / 60)} minutes.`,
      );
    }

    const email = data.email.toLowerCase().trim();
    const phone = data.phone.trim();
    const password = data.password;
    const name = data.name.trim();
    const userType = data.userType;
    const referralCodeInput = data.referralCode?.trim();

    const [existingByEmail, existingByPhone] = await Promise.all([
      prisma.user.findUnique({
        where: { email },
        select: { id: true },
      }),
      prisma.user.findUnique({
        where: { phone },
        select: { id: true },
      }),
    ]);

    if (existingByEmail) {
      throw new Error("Email already registered");
    }

    if (existingByPhone) {
      throw new Error("Phone number already registered");
    }

    let referrerId: string | undefined = undefined;
    if (referralCodeInput) {
      const referrer = await prisma.user.findUnique({
        where: { referralCode: referralCodeInput },
        select: { id: true },
      });
      if (!referrer) {
        throw new Error("Invalid referral code");
      }
      referrerId = referrer.id;
    }

    const passwordHash = await hash(password, 12);
    const referralSeed = name || email.split("@")[0] || "user";
    let user: { id: string };

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        user = await prisma.$transaction(async (tx: any) => {
          const newUser = await tx.user.create({
            data: {
              email,
              phone,
              passwordHash,
              userType,
              verificationLevel: "BASIC",
              trustScore: 50,
              status: "ACTIVE",
              emailVerified: true,
              phoneVerified: true,
              referralCode: generateReferralCode(referralSeed.slice(0, 6)),
              referredBy: referrerId,
            },
            select: { id: true },
          });

          if (userType === "INFLUENCER") {
            await tx.influencerProfile.create({
              data: {
                userId: newUser.id,
                displayName: name,
                categories: "General",
                languages: "English",
              },
            });
          } else if (userType === "BRAND") {
            await tx.brandProfile.create({
              data: {
                userId: newUser.id,
                companyName: name,
              },
            });
          }

          await tx.indiaTaxCompliance.create({
            data: {
              userId: newUser.id,
              gstRegistrationType: "UNREGISTERED",
              status: "ACTION_REQUIRED",
            },
          });

          await tx.wallet.create({
            data: { userId: newUser.id, balance: 0, pendingBalance: 0 },
          });

          return newUser;
        });

        logger.info("User registered", { userId: user.id, type: userType, ip });
        return user;
      } catch (error: any) {
        const target = Array.isArray(error?.meta?.target)
          ? error.meta.target.join(",")
          : String(error?.meta?.target || "");
        const lowerTarget = target.toLowerCase();
        if (error?.code === "P2002" && lowerTarget.includes("email")) {
          throw new Error("Email already registered");
        }
        if (error?.code === "P2002" && lowerTarget.includes("phone")) {
          throw new Error("Phone number already registered");
        }
        const isReferralCodeConflict =
          error?.code === "P2002" && lowerTarget.includes("referralcode");
        if (!isReferralCodeConflict || attempt === 4) {
          throw error;
        }
      }
    }

    throw new Error("Unable to generate a unique referral code");
  }

  /**
   * Check if a user has specific permission
   */
  static can(user: { userType: string }, permission: Permission): boolean {
    return hasPermission(user.userType as UserType, permission);
  }

  /**
   * Validate Login Eligibility
   */
  static async validateLoginEligibility(email: string, ip: string) {
    const ipLimit = await checkRateLimit(ip, "LOGIN_IP");
    if (!ipLimit.success) {
      logger.warn("Login blocked by IP rate limit", { ip, email });
      return { allowed: false, reason: "Too many attempts from this IP" };
    }

    const emailLimit = await checkRateLimit(email, "LOGIN_EMAIL");
    if (!emailLimit.success) {
      logger.warn("Login blocked by Email rate limit", { ip, email });
      return {
        allowed: false,
        reason: "Too many failed attempts for this account",
      };
    }

    return { allowed: true };
  }

  /**
   * Verify an OTP Token robustly.
   */
  static async verifyOtp(userId: string, code: string, type: OtpTokenType) {
    const tokenRecord = await prisma.otpToken.findFirst({
      where: { userId, type, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });

    if (!tokenRecord) throw new Error("Invalid or expired OTP");
    if (tokenRecord.expiresAt < new Date()) throw new Error("OTP has expired");

    if (tokenRecord.attempts >= tokenRecord.maxAttempts) {
      await prisma.otpToken.update({
        where: { id: tokenRecord.id },
        data: { consumedAt: new Date() }, // Burn token
      });
      throw new Error("Maximum attempts exceeded");
    }

    const isValid = await compare(code, tokenRecord.hashedToken);

    if (!isValid) {
      const updatedAttempts = tokenRecord.attempts + 1;
      await prisma.otpToken.update({
        where: { id: tokenRecord.id },
        data: {
          attempts: updatedAttempts,
          consumedAt: updatedAttempts >= tokenRecord.maxAttempts ? new Date() : null,
        },
      });
      throw new Error("Invalid OTP");
    }

    // OTP is valid! Mark as consumed atomically.
    await prisma.otpToken.update({
      where: { id: tokenRecord.id },
      data: { consumedAt: new Date() },
    });

    return true;
  }

  /**
   * Verify Email
   */
  static async verifyEmail(userId: string, code: string) {
    await this.verifyOtp(userId, code, "EMAIL_VERIFICATION");

    // Activate the user
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true, status: "ACTIVE" },
    });

    return true;
  }

  /**
   * Change Password
   */
  static async changePassword(userId: string, oldPass: string, newPass: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const isValid = await compare(oldPass, user.passwordHash);
    if (!isValid) throw new Error("Incorrect old password");

    const newHash = await hash(newPass, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash, lastPasswordChange: new Date() },
    });

    logger.info("User changed password", { userId });
    return true;
  }

  /**
   * Reset Password Completion
   */
  static async requestPasswordReset(email: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, status: true },
    });

    if (!user || user.status === "BANNED") {
      return { sent: false };
    }

    const token = randomBytes(32).toString("hex");
    const resetToken = hashResetToken(token);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const sent = await sendPasswordResetEmail(user.email, token);
    if (!sent) {
      logger.error("Password reset email failed to send", { userId: user.id });
    }

    // SECURITY: Never return the raw token to the client.
    // It is delivered exclusively via the email channel.
    return { sent };
  }

  static async resetPassword(token: string, newPass: string) {
    const hashedToken = hashResetToken(token);
    const newHash = await hash(newPass, 12);

    // ATOMIC: Check token validity and clear it in a single query.
    // This prevents TOCTOU race conditions where two concurrent requests
    // with the same token could both succeed (double reset attack).
    const result = await prisma.user.updateMany({
      where: {
        resetToken: hashedToken,
        resetTokenExpiry: { gt: new Date() },
      },
      data: {
        passwordHash: newHash,
        resetToken: null,
        resetTokenExpiry: null,
        lastPasswordChange: new Date(),
      },
    });

    if (result.count === 0) throw new Error("Invalid or expired token");

    logger.info("User reset password (atomic)", { matchedCount: result.count });
    return true;
  }
}
