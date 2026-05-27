import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import QRCode from "qrcode";
import { generateSecret, generateURI } from "otplib";
import { logger } from "@/lib/logger";

export async function POST(_req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, isTwoFactorEnabled: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.isTwoFactorEnabled) {
      return NextResponse.json(
        { error: "2FA is already enabled" },
        { status: 400 },
      );
    }

    // Generate a new 2FA secret
    const secret = generateSecret();

    // Temporarily store the secret in the database (or we could return it purely in memory,
    // but let's store it locally as twoFactorSecret so we can verify it in the next step!)
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: secret },
    });

    // Generate QR Code URI
    const uri = generateURI({
      issuer: "Decisional",
      label: session.user.email,
      secret,
    });

    // Convert URI to Data URL for frontend scanning
    const qrCodeUrl = await QRCode.toDataURL(uri);

    return NextResponse.json({
      secret, // The base32 secret for manual entry
      qrCodeUrl,
    });
  } catch (error) {
    logger.error("2FA setup error", error);
    return NextResponse.json(
      { error: "Failed to initiate 2FA setup" },
      { status: 500 },
    );
  }
}
