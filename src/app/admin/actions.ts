"use server";

import { AppError } from "@/lib/errors";

import prisma from "@/lib/db";
import { NotificationService } from "@/services/notification.service";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { checkAndAwardBadges, awardBadgeIfNotExists } from "@/lib/gamification-engine";
import { BADGES } from "@/lib/badges";
import { auth } from "@/lib/auth";
import { AdminService } from "@/services/admin.service";
import { requireActiveAdmin } from "@/lib/admin-auth";

async function requireAdmin() {
  const session = await auth();
  await requireActiveAdmin(session?.user);
  return session!;
}

function getMissingVerificationDocs(
  userType: string,
  verifiedDocs: string[],
): string[] {
  if (userType !== "BRAND") {
    return ["PAN_CARD", "AADHAAR", "BANK_STATEMENT"].filter(
      (doc) => !verifiedDocs.includes(doc),
    );
  }

  const missing = ["PAN_CARD", "BANK_STATEMENT"].filter(
    (doc) => !verifiedDocs.includes(doc),
  );
  const hasBusinessProof = [
    "GST_CERTIFICATE",
    "CIN_CERTIFICATE",
    "MSME_CERTIFICATE",
    "STARTUP_CERTIFICATE",
  ].some((doc) => verifiedDocs.includes(doc));

  return hasBusinessProof ? missing : [...missing, "BUSINESS_PROOF"];
}

export async function approveUser(userId: string) {
  const _session = await requireAdmin();

  // Custom logic not yet in Service, keeping here but using transaction
  await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      // Accept pending docs
      await tx.verificationDocument.updateMany({
        where: {
          userId: userId,
          status: "PENDING",
        },
        data: {
          status: "VERIFIED",
          verifiedAt: new Date(),
        },
      });

      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { verificationDocs: true },
      });

      if (!user) throw AppError.notFound("User not found");

      const docs = user.verificationDocs;
      const verifiedDocs = docs
        .filter((d) => d.status === "VERIFIED" || d.status === "PENDING")
        .map((d) => d.type);

      const missingDocs = getMissingVerificationDocs(user.userType, verifiedDocs);

      if (missingDocs.length > 0) {
        // Missing docs -> PARTIAL
        await tx.user.update({
          where: { id: userId },
          data: {
            status: "PENDING_VERIFICATION", // Needs more actions
            verificationLevel: "BASIC", // Downgraded to BASIC instead of invalid PARTIAL
            trustScore: Math.max(user.trustScore, 50),
          },
        });

        await NotificationService.createNotification({
          userId,
          type: "system",
          title: "Document Verified (Action Required)",
          message: `Your document was approved, but we still need: ${missingDocs.map((m) => m.replace("_", " ")).join(", ")} to fully verify your account.`,
        }, tx);
      } else {
        // Fully verified
        await tx.user.update({
          where: { id: userId },
          data: {
            status: "ACTIVE",
            verificationLevel: "FULL",
            trustScore: Math.max(user.trustScore, 50),
          },
        });

        // Gamification hook
        await checkAndAwardBadges(userId, "VERIFICATION", tx);

        await NotificationService.createNotification({
          userId,
          type: "system",
          title: "Verification Approved",
          message:
            "Your profile is now fully verified. You can now create campaigns and hire influencers!",
        }, tx);
      }
    },
    {
      maxWait: 10000,
      timeout: 15000,
    },
  );

  revalidatePath("/admin/verifications");
  revalidatePath(`/admin/verifications/${userId}`);
}

export async function rejectUser(userId: string, reason: string) {
  const _session = await requireAdmin();

  // Use Service for status update?
  // AdminService.updateUserStatus supports 'set_verification' but logic here is specific to rejection
  // Let's stick to direct DB for now as it's specific to verification flow not generic status management

  await prisma.user.update({
    where: { id: userId },
    data: {
      status: "PENDING_VERIFICATION",
      verificationLevel: "NONE",
      trustScore: 0,
    },
  });

  await prisma.verificationDocument.updateMany({
    where: {
      userId: userId,
      status: "PENDING",
    },
    data: {
      status: "REJECTED",
      rejectionReason: reason,
    },
  });

  await NotificationService.createNotification({
    userId,
    type: "system",
    title: "Verification Rejected",
    message: `Your verification was rejected. Reason: ${reason}. Please re-upload documents.`,
  });

  revalidatePath("/admin/verifications");
  revalidatePath(`/admin/verifications/${userId}`);
}

export async function approveDocument(docId: string, userId: string) {
  const _session = await requireAdmin();

  await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      await tx.verificationDocument.update({
        where: { id: docId },
        data: {
          status: "VERIFIED",
          verifiedAt: new Date(),
          rejectionReason: null,
        },
      });

      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { verificationDocs: true },
      });

      if (!user) throw AppError.notFound("User not found");

      const docs = user.verificationDocs;
      // Count just approved doc + any existing verified
      const verifiedDocs = docs
        .filter((d) => d.id === docId || d.status === "VERIFIED")
        .map((d) => d.type);

      const missingDocs = getMissingVerificationDocs(user.userType, verifiedDocs);

      if (missingDocs.length === 0 && user.verificationLevel !== "FULL") {
        await tx.user.update({
          where: { id: userId },
          data: {
            status: "ACTIVE",
            verificationLevel: "FULL",
            trustScore: Math.max(user.trustScore, 50),
          },
        });

        await checkAndAwardBadges(userId, "VERIFICATION", tx);

        await NotificationService.createNotification({
          userId,
          type: "system",
          title: "Verification Approved",
          message:
            "Your profile is now fully verified. You can now create campaigns and hire influencers!",
        }, tx);
      }
    },
    { maxWait: 10000, timeout: 15000 },
  );

  revalidatePath("/admin/verifications");
  revalidatePath(`/admin/verifications/${userId}`);
}

export async function rejectDocument(
  docId: string,
  userId: string,
  reason: string,
) {
  const _session = await requireAdmin();

  const doc = await prisma.verificationDocument.update({
    where: { id: docId },
    data: { status: "REJECTED", rejectionReason: reason },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (user?.verificationLevel === "FULL") {
    await prisma.user.update({
      where: { id: userId },
      data: { verificationLevel: "BASIC", status: "PENDING_VERIFICATION" }, // Downgrade
    });
  }

  await NotificationService.createNotification({
    userId,
    type: "system",
    title: "Document Rejected",
    message: `Your ${doc.type.replace("_", " ")} was rejected. Reason: ${reason}. Please re-upload.`,
  });

  revalidatePath("/admin/verifications");
  revalidatePath(`/admin/verifications/${userId}`);
}

export async function banUser(userId: string) {
  const session = await requireAdmin();

  if (session.user.id === userId) {
    throw AppError.badRequest("Cannot ban yourself");
  }

  await AdminService.updateUserStatus(session.user, userId, {
    action: "ban",
    reason: "Admin banned via action",
  });

  revalidatePath("/admin/users");
}

export async function unbanUser(userId: string) {
  const session = await requireAdmin();

  await AdminService.updateUserStatus(session.user, userId, {
    action: "activate",
    reason: "Admin unbanned via action",
  });

  revalidatePath("/admin/users");
}

export async function approveFlaggedApplication(applicationId: string) {
  const _session = await requireAdmin();

  const app = await prisma.application.update({
    where: { id: applicationId },
    data: { status: "PENDING" },
    select: { influencer: { select: { userId: true } } },
  });

  if (app?.influencer?.userId) {
    await NotificationService.createNotification({
      userId: app.influencer.userId,
      type: "system",
      title: "Application Approved by Admin",
      message: "Your flagged application was reviewed and approved. It is now pending brand selection.",
    });
  }

  revalidatePath("/admin");
}

export async function rejectFlaggedApplication(applicationId: string, reason: string) {
  const _session = await requireAdmin();

  const app = await prisma.application.update({
    where: { id: applicationId },
    data: { status: "REJECTED" },
    select: { influencer: { select: { userId: true } } },
  });

  if (app?.influencer?.userId) {
    await NotificationService.createNotification({
      userId: app.influencer.userId,
      type: "system",
      title: "Application Rejected",
      message: `Your application was rejected by security review. Reason: ${reason}`,
    });
  }

  revalidatePath("/admin");
}

export async function awardBadgeManually(targetUserId: string, badgeId: string) {
  const _session = await requireAdmin();

  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
  });
  if (!user) {
    throw AppError.notFound("User not found");
  }

  // Award the badge using the existing gamification engine function
  await awardBadgeIfNotExists(targetUserId, badgeId);

  // Notify the user about the badge award
  const badgeDef = BADGES.find((b) => b.id === badgeId);
  await NotificationService.createNotification({
    userId: targetUserId,
    type: "badge",
    title: `🏆 Badge Awarded: ${badgeDef?.name || badgeId}`,
    message: `An admin has manually awarded you the "${badgeDef?.name || badgeId}" badge!`,
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${targetUserId}`);
}

export async function awardBadgeAction(formData: FormData) {
  const userId = formData.get("userId") as string;
  const badgeId = formData.get("badgeId") as string;
  if (!userId || !badgeId) return;
  await awardBadgeManually(userId, badgeId);
}
