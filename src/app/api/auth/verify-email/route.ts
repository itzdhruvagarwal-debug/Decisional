import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthService } from "@/services/auth.service";
import { logger } from "@/lib/logger";

const verifyEmailSchema = z.object({
  userId: z.string().cuid(),
  code: z.string().length(6, "Verification code must be exactly 6 characters"),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = verifyEmailSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Invalid request payload", data: parsed.error.format() },
        { status: 400 }
      );
    }

    // Hand off completely to Service
    await AuthService.verifyEmail(parsed.data.userId, parsed.data.code);

    return NextResponse.json(
      { success: true, message: "Email verified successfully. Account is now active." },
      { status: 200 }
    );
  } catch (error: any) {
    logger.warn("Email verification failed", { error: error.message });

    const safeErrorMessages = ["Invalid or expired OTP", "OTP has expired", "Maximum attempts exceeded", "Invalid OTP"];
    const isSafeError = safeErrorMessages.includes(error.message);

    if (isSafeError) {
      return NextResponse.json(
        { success: false, message: "The verification code is invalid or has expired." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
