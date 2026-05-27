import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthService } from "@/services/auth.service";
import { logger } from "@/lib/logger";
import prisma from "@/lib/db";
import redis from "@/lib/redis";
import { sendOTP, verifyOTP } from "@/lib/sms";
import { checkRateLimit } from "@/lib/rate-limit";

const OTP_TTL = 600;

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

export async function PUT(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 },
      );
    }

    const parsed = sendRegistrationOtpSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request payload",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const phone = parsed.data.phone;
    const type = parsed.data.type;

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const ipRateLimit = await checkRateLimit(ip, "AUTH");
    if (!ipRateLimit.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many OTP requests. Please try again later.",
        },
        { status: 429 },
      );
    }

    if (type === "registration") {
      const existing = await prisma.user.findUnique({
        where: { phone },
        select: { id: true },
      });
      if (existing) {
        return NextResponse.json(
          {
            success: false,
            error: "This phone number is already registered. Please sign in.",
          },
          { status: 409 },
        );
      }
    }

    const key = `phone-otp:${type}:${phone}`;
    const ttl = await redis.ttl(key);
    if (ttl > OTP_TTL - 60) {
      const waitTime = ttl - (OTP_TTL - 60);
      return NextResponse.json(
        {
          success: false,
          error: `Please wait ${waitTime} seconds before requesting a new OTP`,
        },
        { status: 429 },
      );
    }

    const sendResult = await sendOTP(phone);
    if (!sendResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: sendResult.error || "Failed to send OTP",
        },
        { status: 500 },
      );
    }

    await redis.setex(
      key,
      OTP_TTL,
      JSON.stringify({ createdAt: new Date().toISOString() }),
    );

    return NextResponse.json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (error: any) {
    logger.error("Phone OTP send failed", { error: error.message });
    return NextResponse.json(
      { success: false, error: "Failed to send OTP" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 },
      );
    }

    if (
      typeof body === "object" &&
      body !== null &&
      Object.prototype.hasOwnProperty.call(body, "userId")
    ) {
      const parsedLegacy = verifyLegacyOtpSchema.safeParse(body);
      if (!parsedLegacy.success) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid request payload",
            details: parsedLegacy.error.flatten(),
          },
          { status: 400 },
        );
      }

      await AuthService.verifyOtp(
        parsedLegacy.data.userId,
        parsedLegacy.data.code,
        parsedLegacy.data.type,
      );

      return NextResponse.json({
        success: true,
        message: "OTP verified successfully.",
      });
    }

    const parsedRegistration = verifyRegistrationOtpSchema.safeParse(body);
    if (!parsedRegistration.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request payload",
          details: parsedRegistration.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { phone, otp, type } = parsedRegistration.data;
    const key = `phone-otp:${type}:${phone}`;
    const exists = await redis.get(key);

    if (!exists) {
      return NextResponse.json(
        {
          success: false,
          error: "OTP not found or expired. Please request a new OTP.",
        },
        { status: 400 },
      );
    }

    const verifyResult = await verifyOTP(phone, otp);
    if (!verifyResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: verifyResult.error || "Invalid OTP. Please try again.",
        },
        { status: 400 },
      );
    }

    await redis.del(key);
    await redis.setex(`phone-otp-verified:${phone}`, 15 * 60, "1");

    return NextResponse.json({
      success: true,
      verified: true,
      message: "Phone verified successfully!",
    });
  } catch (error: any) {
    logger.warn("OTP verification failed", { error: error.message });

    const safeErrorMessages = [
      "Invalid or expired OTP",
      "OTP has expired",
      "Maximum attempts exceeded",
      "Invalid OTP",
    ];
    const isSafeError = safeErrorMessages.includes(error.message);

    if (isSafeError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
