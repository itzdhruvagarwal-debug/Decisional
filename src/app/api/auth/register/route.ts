import { NextRequest } from "next/server";
import { AuthService } from "@/services/auth.service";
import { logger } from "@/lib/logger";
import { registerSchema } from "@/lib/validations";
import redis from "@/lib/redis";
import { apiWrapper, ApiResponse } from "@/lib/api-wrapper";
import { checkRateLimit } from "@/lib/rate-limit";

export const POST = apiWrapper(async function POST(request: NextRequest) {
  // IP-based rate limit: max 5 registrations per IP per 10 minutes
  const ip =
    (request as NextRequest & { ip?: string }).ip ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";

  const ipLimit = await checkRateLimit(ip, "REGISTER");
  if (!ipLimit.success) {
    return ApiResponse.tooManyRequests("Too many registration attempts. Please try again later.");
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return ApiResponse.error("Invalid request body");
    }

    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return ApiResponse.error("Invalid request data");
    }

    // OTP verification is enforced server-side via Redis — client flags are ignored


    const emailKey = `email-otp-verified:${parsed.data.email}`;
    const phoneKey = `phone-otp-verified:${parsed.data.phone}`;
    const [isEmailOtpVerified, isPhoneOtpVerified] = await Promise.all([
      redis.get(emailKey),
      redis.get(phoneKey),
    ]);

    if (!isEmailOtpVerified || !isPhoneOtpVerified) {
      return ApiResponse.error("OTP verification expired. Please verify email and phone again.");
    }

    const ip =
      (request as NextRequest & { ip?: string }).ip ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";
    const bodyRecord =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const rawDeviceFingerprint =
      request.headers.get("x-device-fingerprint") ||
      (typeof bodyRecord.deviceFingerprint === "string"
        ? bodyRecord.deviceFingerprint
        : "");

    const user = await AuthService.registerUser(parsed.data, ip, {
      emailVerified: true,
      phoneVerified: true,
      userAgent,
      ...(rawDeviceFingerprint ? { deviceFingerprint: rawDeviceFingerprint } : {}),
    });
    await Promise.all([redis.del(emailKey), redis.del(phoneKey)]);

    return ApiResponse.success(
      { userId: user.id },
      "Registration successful. You can now sign in.",
      201,
    );
  } catch (error: unknown) {
    logger.error("Registration route error", { error: (error instanceof Error ? error.message : String(error)) });

    const errMsg = error instanceof Error ? error.message : String(error);

    // Only expose safe, pre-defined business rule messages to the user
    const safeErrors = [
      "Email already registered",
      "Phone number already registered",
      "Invalid referral code",
      "Registration blocked. Please contact support.",
    ];

    if (safeErrors.includes(errMsg) || errMsg.includes("Rate limit")) {
      return ApiResponse.error(errMsg);
    }

    // Never leak internal error details to the client
    return ApiResponse.error("Registration failed. Please try again.", 500);
  }
});
