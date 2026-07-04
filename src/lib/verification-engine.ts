import { AppError } from "@/lib/errors";
/**
 * Verification Engine
 * Handles user identity verification, document processing, and level upgrades.
 */

import prisma from "./db";
import { updateTrustAndLevel } from "./trust-engine";
import { NotificationService } from "@/services/notification.service";
import { VerificationLevel } from "@prisma/client";

export interface VerificationRequest {
  userId: string;
  type:
    | "PAN_CARD"
    | "AADHAAR"
    | "GST_CERTIFICATE"
    | "CIN_CERTIFICATE"
    | "BANK_STATEMENT"
    | "SELFIE";
  documentUrl: string;
}

export interface VerificationReview {
  documentId: string;
  reviewerId: string; // Admin user ID
  status: "VERIFIED" | "REJECTED";
  reason?: string;
}

/**
 * Submit a document for verification
 */
export async function requestVerification(data: VerificationRequest) {
  // check if already pending
  const existing = await prisma.verificationDocument.findFirst({
    where: {
      userId: data.userId,
      type: data.type,
      status: "PENDING",
    },
  });

  if (existing) {
    throw AppError.badRequest("Verification document of this type is already pending");
  }

  const doc = await prisma.verificationDocument.create({
    data: {
      userId: data.userId,
      type: data.type,
      documentUrl: data.documentUrl,
      status: "PENDING",
    },
  });

  // Notify admins? (In real app, yes)
  return doc;
}

/**
 * Review a verification document (Admin action)
 */
export async function reviewVerification(data: VerificationReview) {
  const doc = await prisma.verificationDocument.findUnique({
    where: { id: data.documentId },
  });

  if (!doc) throw AppError.notFound("Document not found");

  // Update document status
  await prisma.verificationDocument.update({
    where: { id: data.documentId },
    data: {
      status: data.status,
      rejectionReason: data.reason ?? null,
      verifiedAt: data.status === "VERIFIED" ? new Date() : null,
    },
  });

  // If verified, try to upgrade user level
  if (data.status === "VERIFIED") {
    await updateVerificationLevel(doc.userId);
  }

  // Notify user
  await NotificationService.createNotification({
    userId: doc.userId,
    type: "verification_update",
    title: `Document ${data.status === "VERIFIED" ? "Verified" : "Rejected"}`,
    message: `Your ${doc.type} has been ${data.status.toLowerCase()}. ${data.reason ? "Reason: " + data.reason : ""}`
  });

  return { success: true };
}

/**
 * Check and upgrade user verification level based on verified docs
 */
export async function updateVerificationLevel(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { verificationDocs: true },
  });

  if (!user) return;

  const verifiedDocs = user.verificationDocs
    .filter((d: { status: string }) => d.status === "VERIFIED")
    .map((d: { type: string }) => d.type);

  let newLevel = "NONE";

  // Helper to check if type exists
  const has = (t: string) => verifiedDocs.includes(t);

  // Level 1: Basic (Phone + Email) - Handled by auth system mainly, but let's assume if they exist
  if (user.emailVerified || user.phoneVerified) {
    newLevel = "BASIC";
  }

  // Level 2: Identity (PAN + Bank OR Aadhaar)
  // For Individuals/Influencers: PAN is critical.
  if (has("PAN_CARD") && (has("BANK_STATEMENT") || user.userType === "BRAND")) {
    // Brands might need GST/CIN instead
    newLevel = "IDENTITY";
  }

  // For Brands: GST/CIN + PAN
  if (
    user.userType === "BRAND" &&
    (has("GST_CERTIFICATE") || has("CIN_CERTIFICATE")) &&
    has("PAN_CARD")
  ) {
    newLevel = "IDENTITY";
  }

  // Level 3: Full (Everything)
  // Influencer: PAN + Bank + Aadhaar/Selfie
  if (
    user.userType === "INFLUENCER" &&
    has("PAN_CARD") &&
    has("BANK_STATEMENT") &&
    (has("AADHAAR") || has("SELFIE"))
  ) {
    newLevel = "FULL";
  }

  // Brand: GST + PAN + Bank + CIN (if applicable)
  if (
    user.userType === "BRAND" &&
    has("GST_CERTIFICATE") &&
    has("PAN_CARD") &&
    has("BANK_STATEMENT")
  ) {
    newLevel = "FULL";
  }

  // Update if level changed
  // Enum mapping: NONE, BASIC, IDENTITY, FULL
  const levels = ["NONE", "BASIC", "IDENTITY", "FULL"];
  const currentLevelIdx = levels.indexOf(user.verificationLevel);
  const newLevelIdx = levels.indexOf(newLevel);

  if (newLevelIdx > currentLevelIdx) {
    await prisma.user.update({
      where: { id: userId },
      data: { verificationLevel: newLevel as VerificationLevel },
    });

    // Award Trust Score Boost
    await updateTrustAndLevel(userId, "VERIFICATION_APPROVED");
  }
}
