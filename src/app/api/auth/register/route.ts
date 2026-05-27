import { NextResponse } from "next/server";
import { AuthService } from "@/services/auth.service";
import { logger } from "@/lib/logger";
import { registerSchema } from "@/lib/validations";
import redis from "@/lib/redis";

export async function POST(request: Request) {
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

    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request data",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    if (!parsed.data.emailOtpVerified || !parsed.data.phoneOtpVerified) {
      return NextResponse.json(
        {
          success: false,
          error: "Please verify both email and phone before registration.",
        },
        { status: 400 },
      );
    }

    const emailKey = `email-otp-verified:${parsed.data.email}`;
    const phoneKey = `phone-otp-verified:${parsed.data.phone}`;
    const [isEmailOtpVerified, isPhoneOtpVerified] = await Promise.all([
      redis.get(emailKey),
      redis.get(phoneKey),
    ]);

    if (!isEmailOtpVerified || !isPhoneOtpVerified) {
      return NextResponse.json(
        {
          success: false,
          error: "OTP verification expired. Please verify email and phone again.",
        },
        { status: 400 },
      );
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";

    const user = await AuthService.registerUser(parsed.data, ip);
    await Promise.all([redis.del(emailKey), redis.del(phoneKey)]);

    return NextResponse.json(
      {
        success: true,
        message: "Registration successful. You can now sign in.",
        data: { userId: user.id },
      },
      { status: 201 },
    );
  } catch (error: any) {
    logger.error("Registration route error", { error: error.message });

    const safeErrors = [
      "Email already registered",
      "Phone number already registered",
      "Invalid referral code",
    ];

    if (
      safeErrors.includes(error.message) ||
      error.message?.includes("Rate limit")
    ) {
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
