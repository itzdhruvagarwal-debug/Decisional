import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { AuthService } from "@/services/auth.service";
import { logger } from "@/lib/logger";
import { passwordSchema } from "@/lib/validations";

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordSchema,
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Valid session required." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = changePasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Invalid request payload", data: parsed.error.format() },
        { status: 400 }
      );
    }

    if (parsed.data.oldPassword === parsed.data.newPassword) {
      return NextResponse.json(
        { success: false, message: "New password must be different from the old password" },
        { status: 400 }
      );
    }

    const { oldPassword, newPassword } = parsed.data;

    await AuthService.changePassword(session.user.id, oldPassword, newPassword);

    return NextResponse.json(
      { success: true, message: "Password changed successfully" },
      { status: 200 }
    );
  } catch (error: any) {
    logger.warn("Password change failed", { error: error.message });

    if (error.message === "Incorrect old password" || error.message === "User not found") {
      return NextResponse.json(
        { success: false, message: "Incorrect current password" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
