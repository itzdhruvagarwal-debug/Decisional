/**
 * Verification API Route
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { DocumentType } from "@prisma/client";
import { logger } from "@/lib/logger";
import { uploadFile } from "@/lib/storage";
import {
  getUserVerificationTier,
  getTierDescription,
  TIER_LIMITS,
} from "@/lib/verification-tiers";

const VALID_DOC_TYPES = [
  "PAN_CARD",
  "AADHAAR",
  "GST_CERTIFICATE",
  "CIN_CERTIFICATE",
  "BANK_STATEMENT",
  "SELFIE",
  "MSME_CERTIFICATE",
  "STARTUP_CERTIFICATE",
] as const;

const ALLOWED_VERIFICATION_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;

const MAX_VERIFICATION_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function bytesToAscii(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

function detectVerificationMimeFromMagicBytes(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;

  // PDF: %PDF
  if (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  ) {
    return "application/pdf";
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }

  // WEBP: RIFF....WEBP
  if (
    bytesToAscii(bytes.slice(0, 4)) === "RIFF" &&
    bytesToAscii(bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }

  // HEIC/HEIF
  if (bytesToAscii(bytes.slice(4, 8)) === "ftyp") {
    const brand = bytesToAscii(bytes.slice(8, 12)).toLowerCase();
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) {
      return "image/heic";
    }
  }

  return null;
}

function isAllowedVerificationExtension(
  mimeType: string,
  extension: string,
): boolean {
  const map: Record<string, string[]> = {
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/webp": ["webp"],
    "image/heic": ["heic", "heif"],
    "application/pdf": ["pdf"],
  };

  return (map[mimeType] || []).includes(extension);
}

// GET - Get verification status and documents
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [user, documents] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          verificationLevel: true,
          emailVerified: true,
          phoneVerified: true,
          trustScore: true,
          userType: true,
        },
      }),
      prisma.verificationDocument.findMany({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const userType = (user?.userType || "INFLUENCER") as "BRAND" | "INFLUENCER";
    const tier = await getUserVerificationTier(session.user.id, userType);

    // Influencer: Tier 2 = unlimited. Brand: Tier 3 = unlimited, Tier 2 = ₹1L
    const tierLimit =
      userType === "INFLUENCER"
        ? tier >= 2
          ? null
          : tier === 1
            ? TIER_LIMITS.TIER_1_MAX_MONTHLY
            : 0
        : tier === 3
          ? null
          : tier === 2
            ? TIER_LIMITS.TIER_2_MAX_MONTHLY
            : tier === 1
              ? TIER_LIMITS.TIER_1_MAX_MONTHLY
              : 0;

    return NextResponse.json({
      verificationLevel: user?.verificationLevel,
      trustScore: Math.min(user?.trustScore || 0, 100),
      emailVerified: user?.emailVerified,
      phoneVerified: user?.phoneVerified,
      userType,
      documents,
      tier,
      tierLimit,
      tierDescription: getTierDescription(tier, userType),
    });
  } catch (error) {
    logger.error("Verification fetch error", error);
    return NextResponse.json(
      { error: "Failed to fetch verification status" },
      { status: 500 },
    );
  }
}

// POST - Upload a document (Real File Upload)
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null;

    if (!file || !type) {
      return NextResponse.json(
        { error: "File and type are required" },
        { status: 400 },
      );
    }

    if (file.size <= 0) {
      return NextResponse.json(
        { error: "Empty file is not allowed" },
        { status: 400 },
      );
    }

    if (file.size > MAX_VERIFICATION_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum allowed size is 10MB." },
        { status: 400 },
      );
    }

    const fileExt = file.name.split(".").pop()?.toLowerCase() || "";
    const blockedExts = ["exe", "dll", "php", "sh", "bat", "js", "html"];
    if (blockedExts.includes(fileExt)) {
      return NextResponse.json(
        { error: "Unsupported file extension." },
        { status: 400 },
      );
    }

    if (!ALLOWED_VERIFICATION_MIME_TYPES.includes(file.type as any)) {
      return NextResponse.json(
        { error: "Unsupported file type for verification." },
        { status: 415 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const fileBytes = new Uint8Array(arrayBuffer.slice(0, 16));
    const detectedMime = detectVerificationMimeFromMagicBytes(fileBytes);
    if (!detectedMime || detectedMime !== file.type) {
      return NextResponse.json(
        { error: "File signature mismatch. Upload rejected." },
        { status: 400 },
      );
    }

    if (!isAllowedVerificationExtension(file.type, fileExt)) {
      return NextResponse.json(
        { error: "File extension does not match file content." },
        { status: 400 },
      );
    }

    // Validate Document Type
    if (!VALID_DOC_TYPES.includes(type as any)) {
      return NextResponse.json(
        { error: "Invalid document type" },
        { status: 400 },
      );
    }

    // Check for existing pending/verified document
    const existing = await prisma.verificationDocument.findFirst({
      where: {
        userId: session.user.id,
        type: type as DocumentType,
        status: { in: ["PENDING", "VERIFIED"] },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Document of type ${type} is already ${existing.status}` },
        { status: 400 },
      );
    }

    // Upload to Storage
    const buffer = Buffer.from(arrayBuffer);

    const uploadRes = await uploadFile(
      buffer,
      file.name,
      "verification",
      file.type,
    );

    if (!uploadRes.success || !uploadRes.url) {
      logger.error("File upload failed", { error: uploadRes.error });
      return NextResponse.json(
        { error: "Failed to upload file to storage" },
        { status: 500 },
      );
    }

    // Create DB record
    const document = await prisma.verificationDocument.create({
      data: {
        userId: session.user.id,
        type: type as DocumentType,
        documentUrl: uploadRes.url,
        status: "PENDING",
        metadata: {
          originalName: file.name,
          size: file.size,
          mimeType: file.type,
        },
      },
    });

    return NextResponse.json({
      success: true,
      document,
      message: "Document uploaded successfully. Verification pending.",
    });
  } catch (error) {
    logger.error("Verification upload error", error);
    return NextResponse.json(
      { error: "Failed to process upload" },
      { status: 500 },
    );
  }
}
