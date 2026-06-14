import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { apiWrapper } from "@/lib/api-wrapper";
import { logger } from "@/lib/logger";
import { z } from "zod";
import bcrypt from "bcryptjs";

const deleteSchema = z.object({
  password: z.string().min(1, "Password required for account deletion"),
  reason: z.string().optional(),
});

export const POST = apiWrapper(async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Validation failed" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, passwordHash: true, email: true },
  });

  if (!user?.passwordHash) {
    return NextResponse.json({ error: "Cannot verify identity" }, { status: 400 });
  }

  const passwordValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!passwordValid) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 403 });
  }

  // Check for active deals
  const activeDeals = await prisma.deal.count({
    where: {
      OR: [
        { influencer: { userId: session.user.id } },
        { brand: { userId: session.user.id } },
      ],
      status: { notIn: ["COMPLETED", "CANCELLED", "DISPUTED"] },
    },
  });

  if (activeDeals > 0) {
    return NextResponse.json(
      { error: "Cannot delete account with active deals. Please complete or cancel them first." },
      { status: 409 },
    );
  }

  // Anonymize user data (retain financial records for 7-year tax compliance)
  const anonymizedEmail = `deleted_${session.user.id}@anonymized.local`;
  await prisma.$transaction(async (tx: any) => {
    await tx.user.update({
      where: { id: session.user.id },
      data: {
        email: anonymizedEmail,
        name: "Deleted User",
        phone: null,
        passwordHash: null,
        status: "SUSPENDED",
        isTwoFactorEnabled: false,
        twoFactorSecret: null,
        emailVerified: null,
      },
    });

    // Anonymize influencer profile if exists
    await tx.influencerProfile.updateMany({
      where: { userId: session.user.id },
      data: {
        displayName: "Deleted User",
        bio: null,
        avatar: null,
        instagramHandle: null,
        youtubeHandle: null,
        phone: null,
        city: null,
        state: null,
      },
    });

    // Anonymize brand profile if exists
    await tx.brandProfile.updateMany({
      where: { userId: session.user.id },
      data: {
        companyName: "Deleted Brand",
        contactPerson: null,
        logo: null,
        description: null,
        website: null,
        phone: null,
      },
    });

    // Log the deletion for audit
    await tx.activityLog.create({
      data: {
        userId: session.user.id,
        action: "ACCOUNT_DELETION",
        entityType: "User",
        entityId: session.user.id,
        metadata: {
          reason: parsed.data.reason || "User requested",
          originalEmail: user.email,
          deletedAt: new Date().toISOString(),
        },
      },
    });
  });

  logger.info("Account deleted (anonymized)", { userId: session.user.id });

  return NextResponse.json({
    success: true,
    message: "Account deleted. All personal data has been anonymized.",
  });
});
