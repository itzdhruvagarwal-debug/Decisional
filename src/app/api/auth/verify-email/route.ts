import { apiWrapper, ApiResponse } from "@/lib/api-wrapper";
import { NextRequest } from "next/server";
import { z } from "zod";
import { AuthService } from "@/services/auth.service";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

const verifyEmailSchema = z.object({
  userId: z.string().cuid(),
  code: z.string().length(6, "Verification code must be exactly 6 characters"),
});

async function _handler_POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = verifyEmailSchema.safeParse(body);

    if (!parsed.success) {
      return ApiResponse.error("Invalid request payload");
    }

    const ip =
      (request as NextRequest & { ip?: string }).ip ||
      request.headers.get("x-real-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const [ipLimit, userLimit] = await Promise.all([
      checkRateLimit(ip, "AUTH"),
      checkRateLimit(parsed.data.userId, "AUTH"),
    ]);
    if (!ipLimit.success || !userLimit.success) {
      return ApiResponse.tooManyRequests("Too many verification attempts");
    }

    // Hand off completely to Service
    await AuthService.verifyEmail(parsed.data.userId, parsed.data.code);

    return ApiResponse.success(null, "Email verified successfully. Account is now active.");
  } catch (error: unknown) {
    logger.warn("Email verification failed", { error: (error instanceof Error ? error.message : String(error)) });

    const safeErrorMessages = ["Invalid or expired OTP", "OTP has expired", "Maximum attempts exceeded", "Invalid OTP"];
    const isSafeError = safeErrorMessages.includes((error instanceof Error ? error.message : String(error)));

    if (isSafeError) {
      return ApiResponse.error("The verification code is invalid or has expired.");
    }

    return ApiResponse.error("Internal server error", 500);
  }
}


// Wrapped handlers via apiWrapper
export const POST = apiWrapper(_handler_POST);
