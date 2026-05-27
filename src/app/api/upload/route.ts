import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { uploadFormFile } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

function bytesToAscii(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

function detectMimeFromMagicBytes(bytes: Uint8Array): string | null {
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

  // GIF
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif";
  }

  // WEBP: RIFF....WEBP
  if (
    bytesToAscii(bytes.slice(0, 4)) === "RIFF" &&
    bytesToAscii(bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }

  // WEBM (EBML)
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "video/webm";
  }

  // MP4 / MOV / HEIC (ftyp box at offset 4)
  if (bytesToAscii(bytes.slice(4, 8)) === "ftyp") {
    const brand = bytesToAscii(bytes.slice(8, 12)).toLowerCase();

    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) {
      return "image/heic";
    }
    if (brand === "qt  ") {
      return "video/quicktime";
    }
    if (
      ["isom", "iso2", "avc1", "mp41", "mp42", "3gp4", "3gp5"].includes(brand)
    ) {
      return "video/mp4";
    }
  }

  return null;
}

function isExtensionCompatible(mimeType: string, extension: string): boolean {
  const map: Record<string, string[]> = {
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/webp": ["webp"],
    "image/gif": ["gif"],
    "image/heic": ["heic", "heif"],
    "video/mp4": ["mp4"],
    "video/webm": ["webm"],
    "video/quicktime": ["mov", "qt"],
    "application/pdf": ["pdf"],
  };

  return (map[mimeType] || []).includes(extension);
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Upload rate limit: max 10 uploads per hour per user
    const rateLimit = await checkRateLimit(session.user.id, "UPLOAD");
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Upload rate limit exceeded. Maximum 10 uploads per hour." },
        {
          status: 429,
          headers: {
            "Retry-After": Math.ceil(
              rateLimit.reset - Date.now() / 1000,
            ).toString(),
          },
        },
      );
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (_e) {
      return NextResponse.json(
        { error: "Invalid multipart payload" },
        { status: 400 } // Or 415/422
      );
    }

    // Check if body is empty or fields missing (edge cases)
    if (!formData.has("file") && !formData.has("randomData")) {
      return NextResponse.json({ error: "Empty multipart body" }, { status: 400 });
    }

    const file = formData.get("file") as File | null;
    let folder = (formData.get("folder") as string) || "misc";

    // Validate folder to prevent arbitrary directory writes
    const allowedFolders = [
      "avatars",
      "logos",
      "verification",
      "content",
      "posts",
    ];
    if (!allowedFolders.includes(folder)) {
      folder = "avatars";
    }

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "Empty file provided" }, { status: 400 });
    }

    // MIME type whitelist — prevent executable/script uploads
    const ALLOWED_MIME_TYPES = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/heic",
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "application/pdf", // For verification documents only
    ];

    // Check extensions regardless of MIME spoof
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const badExts = ["exe", "php", "sh", "bat", "js", "html"];
    if (fileExt && badExts.includes(fileExt)) {
      return NextResponse.json({ error: "Executable files are strictly prohibited" }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      logger.warn("Blocked disallowed file type upload", {
        userId: session.user.id,
        mimeType: file.type,
      });
      return NextResponse.json(
        {
          error: `File type '${file.type}' is not allowed. Only images, videos and PDFs are permitted.`,
        },
        { status: 415 },
      );
    }

    // Magic Bytes Verification (strict)
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer.slice(0, 16));
    const detectedMime = detectMimeFromMagicBytes(bytes);
    if (!detectedMime) {
      return NextResponse.json(
        { error: "Unrecognized or unsafe file signature" },
        { status: 400 },
      );
    }

    if (detectedMime !== file.type) {
      logger.warn("Blocked MIME mismatch upload", {
        userId: session.user.id,
        declaredMime: file.type,
        detectedMime,
        fileName: file.name,
      });
      return NextResponse.json(
        { error: "File type mismatch detected. Upload rejected." },
        { status: 400 },
      );
    }

    if (fileExt && !isExtensionCompatible(detectedMime, fileExt)) {
      return NextResponse.json(
        { error: "File extension does not match file content." },
        { status: 400 },
      );
    }

    // PDF uploads only allowed in verification folder
    if (file.type === "application/pdf" && folder !== "verification") {
      return NextResponse.json(
        { error: "PDF uploads are only allowed for verification documents." },
        { status: 400 },
      );
    }

    // 5MB limit for images, 50MB for videos
    const MAX_SIZE = file.type.startsWith("video/")
      ? 50 * 1024 * 1024
      : 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        {
          error: `File too large. Max size: ${file.type.startsWith("video/") ? "50MB" : "5MB"}`,
        },
        { status: 400 },
      );
    }

    const result = await uploadFormFile(file, folder as any);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Upload failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      url: result.url,
      key: result.key,
    });
  } catch (error) {
    logger.error("Upload API error", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
