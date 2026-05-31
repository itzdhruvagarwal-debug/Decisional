import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { verify } from "otplib";
import { logger } from "@/lib/logger";
import { decrypt } from "@/lib/encryption";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { code } = await req.json();
    if (!code || code.length !== 6) {
      return NextResponse.json(
        { error: "Valid 6-digit code is required" },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, twoFactorSecret: true, isTwoFactorEnabled: true },
    });

    if (!user || !user.twoFactorSecret) {
      return NextResponse.json(
        { error: "2FA setup not initiated" },
        { status: 400 },
      );
    }

    if (user.isTwoFactorEnabled) {
      return NextResponse.json(
        { error: "2FA is already enabled" },
        { status: 400 },
      );
    }

    let twoFactorSecret = user.twoFactorSecret;
    try {
      twoFactorSecret = decrypt(user.twoFactorSecret);
    } catch {
      // Backward compatibility for pre-encryption setup records.
    }

    // Verify the code
    const isValid = await verify({
      token: code,
      secret: twoFactorSecret,
    });

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid authentication code" },
        { status: 400 },
      );
    }

    // Enable 2FA permanently
    await prisma.user.update({
      where: { id: user.id },
      data: { isTwoFactorEnabled: true },
    });

    return NextResponse.json({
      success: true,
      message: "2FA enabled successfully",
    });
  } catch (error) {
    logger.error("2FA verification error", error);
    return NextResponse.json(
      { error: "Failed to verify 2FA code" },
      { status: 500 },
    );
  }
}
