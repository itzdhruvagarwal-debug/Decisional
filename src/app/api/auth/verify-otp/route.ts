import { NextRequest } from "next/server";
import { z } from "zod";
import { AuthService } from "@/services/auth.service";
import { logger } from "@/lib/logger";
import prisma from "@/lib/db";
import redis from "@/lib/redis";
import { sendOTP, verifyOTP } from "@/lib/sms";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiWrapper, ApiResponse } from "@/lib/api-wrapper";

const sendRegistrationOtpSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Must be a valid 10-digit Indian phone number"),
  type: z.enum(["registration", "phone_verification"]).default("registration"),
});

const verifyRegistrationOtpSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Must be a valid 10-digit Indian phone number"),
  otp: z.string().regex(/^\d{6}$/, "OTP must be exactly 6 digits"),
  type: z.enum(["registration", "phone_verification"]),
});

const verifyLegacyOtpSchema = z.object({
  userId: z.string().cuid(),
  code: z.string().length(6, "OTP must be exactly 6 characters"),
  type: z.enum(["EMAIL_VERIFICATION", "PHONE_VERIFICATION", "LOGIN_OTP"]),
});

export const PUT = apiWrapper(async function PUT(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return ApiResponse.error("Invalid request body");
    }

    const parsed = sendRegistrationOtpSchema.safeParse(body);
    if (!parsed.success) {
      return ApiResponse.error("Invalid request payload");
    }

    const phone = parsed.data.phone;
    const type = parsed.data.type;

    const ip =
      (request as NextRequest & { ip?: string }).ip ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const ipRateLimit = await checkRateLimit(ip, "AUTH");
    if (!ipRateLimit.success) {
      return ApiResponse.tooManyRequests("Too many OTP requests. Please try again later.");
    }

    if (type === "registration") {
      const existing = await prisma.user.findUnique({
        where: { phone },
        select: { id: true },
      });
      if (existing) {
        return ApiResponse.success(
          null,
          "If this phone number can be registered, an OTP has been sent.",
        );
      }
    }

    const sendResult = await sendOTP(phone, { purpose: type });
    if (!sendResult.success) {
      return sendResult.retryAfterSeconds
        ? ApiResponse.tooManyRequests(sendResult.error || "Failed to send OTP", sendResult.retryAfterSeconds)
        : ApiResponse.error(sendResult.error || "Failed to send OTP", 500);
    }

    return ApiResponse.success(
      {
        channel: sendResult.channel,
        fallbackUsed: sendResult.fallbackUsed,
        ...(process.env.NODE_ENV !== "production" && sendResult.otp
          ? { otp: sendResult.otp }
          : {}),
      },
      sendResult.channel === "whatsapp"
        ? "OTP sent on WhatsApp"
        : "OTP sent by SMS",
    );
  } catch (error: unknown) {
    logger.error("Phone OTP send failed", { error: (error instanceof Error ? error.message : String(error)) });
    return ApiResponse.error("Failed to send OTP", 500);
  }
});

export const POST = apiWrapper(async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return ApiResponse.error("Invalid request body");
    }

    if (
      typeof body === "object" &&
      body !== null &&
      Object.hasOwn(body, "userId")
    ) {
      const parsedLegacy = verifyLegacyOtpSchema.safeParse(body);
      if (!parsedLegacy.success) {
        return ApiResponse.error("Invalid request payload");
      }

      await AuthService.verifyOtp(
        parsedLegacy.data.userId,
        parsedLegacy.data.code,
        parsedLegacy.data.type,
      );

      return ApiResponse.success(null, "OTP verified successfully.");
    }

    const parsedRegistration = verifyRegistrationOtpSchema.safeParse(body);
    if (!parsedRegistration.success) {
      return ApiResponse.error("Invalid request payload");
    }

    const { phone, otp, type } = parsedRegistration.data;
    const key = `phone-otp:${type}:${phone}`;
    const exists = await redis.get(key);

    if (!exists) {
      return ApiResponse.error("OTP not found or expired. Please request a new OTP.");
    }

    const verifyResult = await verifyOTP(phone, otp, { purpose: type });
    if (!verifyResult.success) {
      return ApiResponse.error(verifyResult.error || "Invalid OTP. Please try again.");
    }

    await redis.del(key);
    await redis.setex(`phone-otp-verified:${phone}`, 15 * 60, "1");

    return ApiResponse.success({ verified: true }, "Phone verified successfully!");
  } catch (error: unknown) {
    logger.warn("OTP verification failed", { error: (error instanceof Error ? error.message : String(error)) });

    const errMsg = error instanceof Error ? error.message : String(error);

    // Only expose safe, pre-defined OTP validation errors to the user
    const safeErrorMessages = [
      "Invalid or expired OTP",
      "OTP has expired",
      "Maximum attempts exceeded",
      "Invalid OTP",
    ];

    if (safeErrorMessages.includes(errMsg)) {
      return ApiResponse.error(errMsg);
    }

    // Never leak internal error details to the client
    return ApiResponse.error("Verification failed. Please try again.", 500);
  }
});
