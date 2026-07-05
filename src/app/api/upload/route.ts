import { apiWrapper, ApiResponse } from "@/lib/api-wrapper";
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
type UploadSession = {
  user: {
    id: string;
    userType: string;
    status: string;
    email?: string | null;
    name?: string | null;
    image?: string | null;
  };
};
import { uploadFormFile, uploadBase64 } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

function bytesToAscii(bytes: Uint8Array): string {
  return String.fromCodePoint(...bytes);
}

function matchesHeader(bytes: Uint8Array, pattern: number[]): boolean {
  if (bytes.length < pattern.length) return false;
  return pattern.every((val, i) => bytes[i] === val);
}

function detectMimeFromMagicBytes(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;

  if (matchesHeader(bytes, [0x25, 0x50, 0x44, 0x46])) return "application/pdf";
  if (matchesHeader(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (matchesHeader(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (matchesHeader(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";

  // WEBP: RIFF....WEBP
  if (
    bytesToAscii(bytes.slice(0, 4)) === "RIFF" &&
    bytesToAscii(bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }

  // WEBM (EBML)
  if (matchesHeader(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";

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

function isImageMime(mimeType: string) {
  return mimeType.startsWith("image/");
}

function isContentMime(mimeType: string) {
  return mimeType.startsWith("image/") || mimeType.startsWith("video/");
}

function canUploadToFolder(
  userType: string | null | undefined,
  folder: string,
  mimeType: string,
) {
  if (folder === "avatars") return isImageMime(mimeType);
  if (folder === "logos") return userType === "BRAND" && isImageMime(mimeType);
  if (folder === "content" || folder === "posts") {
    return userType === "INFLUENCER" && isContentMime(mimeType);
  }
  return false;
}

async function _handler_POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return ApiResponse.unauthorized();
    }

    // Upload rate limit: max 10 uploads per hour per user
    const rateLimit = await checkRateLimit(session.user.id, "UPLOAD");
    if (!rateLimit.success) {
      const retryAfter = Math.ceil(
        rateLimit.reset - Date.now() / 1000,
      );
      return ApiResponse.tooManyRequests(
        "Upload rate limit exceeded. Maximum 10 uploads per hour.",
        retryAfter,
      );
    }

    const contentType = req.headers.get("content-type");

    // Handle base64 JSON upload
    if (contentType?.includes("application/json")) {
      return await handleBase64Upload(req, session);
    }

    // Handle multipart/form-data upload
    return await handleFormDataUpload(req, session);
  } catch (error) {
    logger.error("Upload API error", error);
    return ApiResponse.error("Internal Server Error", 500);
  }
}

async function handleBase64Upload(req: NextRequest, session: UploadSession) {
  try {
    const body = await req.json();
    const { base64, fileName, folder } = body;

    if (!base64 || typeof base64 !== "string") {
      return ApiResponse.error("Base64 data is required");
    }

    if (!fileName || typeof fileName !== "string") {
      return ApiResponse.error("File name is required");
    }

    const uploadFolder = folder || "misc";
    const allowedFolders = ["avatars", "logos", "content", "posts"];
    if (!allowedFolders.includes(uploadFolder)) {
      return ApiResponse.error("Invalid upload folder");
    }

    // Calculate base64 size (base64 is ~33% larger than binary)
    const base64Size = Buffer.byteLength(base64, "utf8");
    const estimatedBinarySize = Math.floor(base64Size * 0.75);

    // 5MB limit for images, 50MB for videos
    const fileExt = fileName.split('.').pop()?.toLowerCase();
    const badExts = ["exe", "php", "sh", "bat", "js", "html"];
    if (fileExt && badExts.includes(fileExt)) {
      return ApiResponse.error("Executable/script files are strictly prohibited");
    }

    const isVideo = ["mp4", "webm", "mov", "qt"].includes(fileExt || "");
    const MAX_SIZE = isVideo ? 50 * 1024 * 1024 : 5 * 1024 * 1024;

    if (estimatedBinarySize > MAX_SIZE) {
      return ApiResponse.error(
        `File too large. Max size: ${isVideo ? "50MB" : "5MB"}`,
      );
    }

    // Detect MIME type from base64 data URL prefix
    let mimeType = "image/png";
    const dataUrlMatch = /^data:([^;]+);base64,/.exec(base64);
    if (dataUrlMatch?.[1]) {
      mimeType = dataUrlMatch[1];
    }

    // Decode and verify magic bytes
    const rawBase64 = base64.replace(/^data:[^;]+;base64,/, "");
    let decodedBuffer: Buffer;
    try {
      decodedBuffer = Buffer.from(rawBase64, "base64");
    } catch {
      return ApiResponse.error("Invalid base64 encoding");
    }

    const bytes = new Uint8Array(decodedBuffer.slice(0, 16));
    const detectedMime = detectMimeFromMagicBytes(bytes);

    if (!detectedMime) {
      return ApiResponse.error("Unrecognized or unsafe file signature");
    }

    if (detectedMime !== mimeType) {
      logger.warn("Blocked base64 MIME mismatch upload", {
        userId: session.user.id,
        declaredMime: mimeType,
        detectedMime,
        fileName,
      });
      return ApiResponse.error("File type mismatch detected. Upload rejected.");
    }

    if (fileExt && !isExtensionCompatible(detectedMime, fileExt)) {
      return ApiResponse.error("File extension does not match file content.");
    }

    // Validate MIME type
    const ALLOWED_MIME_TYPES = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/heic",
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ];

    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return ApiResponse.error(
        `File type '${mimeType}' is not allowed. Only images and videos are permitted.`,
      );
    }

    if (!canUploadToFolder(session.user.userType, uploadFolder, mimeType)) {
      logger.warn("Blocked unauthorized base64 upload folder or MIME combination", {
        userId: session.user.id,
        userType: session.user.userType,
        folder: uploadFolder,
        mimeType,
      });
      return ApiResponse.forbidden(
        "This account cannot upload that file type to the selected folder.",
      );
    }

    const result = await uploadBase64(base64, fileName, uploadFolder as "avatars" | "logos" | "content" | "posts", mimeType);

    if (!result.success) {
      return ApiResponse.error(result.error || "Upload failed", 500);
    }

    return ApiResponse.success(
      { url: result.url, key: result.key },
      "Upload successful",
    );
  } catch (error) {
    logger.error("Base64 upload error", error);
    return ApiResponse.error("Invalid JSON payload");
  }
}

function validateUploadFile(file: File, session: UploadSession): string | null {
  if (file.size === 0) {
    return "Empty file provided";
  }

  const fileExt = file.name.split('.').pop()?.toLowerCase();
  const badExts = ["exe", "php", "sh", "bat", "js", "html"];
  if (fileExt && badExts.includes(fileExt)) {
    return "Executable files are strictly prohibited";
  }

  const ALLOWED_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "application/pdf",
  ];

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    logger.warn("Blocked disallowed file type upload", {
      userId: session.user.id,
      mimeType: file.type,
    });
    return `File type '${file.type}' is not allowed. Only images, videos and PDFs are permitted.`;
  }

  if (file.type === "application/pdf") {
    return "PDF uploads must use the verification document flow.";
  }

  const MAX_SIZE = file.type.startsWith("video/")
    ? 50 * 1024 * 1024
    : 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return `File too large. Max size: ${file.type.startsWith("video/") ? "50MB" : "5MB"}`;
  }

  return null;
}

async function validateFileContentAsync(file: File, session: UploadSession): Promise<string | null> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer.slice(0, 16));
  const detectedMime = detectMimeFromMagicBytes(bytes);
  if (!detectedMime) {
    return "Unrecognized or unsafe file signature";
  }

  if (detectedMime !== file.type) {
    logger.warn("Blocked MIME mismatch upload", {
      userId: session.user.id,
      declaredMime: file.type,
      detectedMime,
      fileName: file.name,
    });
    return "File type mismatch detected. Upload rejected.";
  }

  const fileExt = file.name.split('.').pop()?.toLowerCase();
  if (fileExt && !isExtensionCompatible(detectedMime, fileExt)) {
    return "File extension does not match file content.";
  }

  return null;
}

async function handleFormDataUpload(req: NextRequest, session: UploadSession) {
  try {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (error) {
      logger.warn("Failed to parse form data in upload API", { error });
      return ApiResponse.error("Invalid multipart payload");
    }

    if (!formData.has("file") && !formData.has("randomData")) {
      return ApiResponse.error("Empty multipart body");
    }

    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) || "misc";

    const allowedFolders = ["avatars", "logos", "content", "posts"];
    if (!allowedFolders.includes(folder)) {
      return ApiResponse.error("Invalid upload folder");
    }

    if (!file) {
      return ApiResponse.error("No file provided");
    }

    if (!canUploadToFolder(session.user.userType, folder, file.type)) {
      logger.warn("Blocked unauthorized upload folder or MIME combination", {
        userId: session.user.id,
        userType: session.user.userType,
        folder,
        mimeType: file.type,
      });
      return ApiResponse.forbidden(
        "This account cannot upload that file type to the selected folder.",
      );
    }

    const fileValidationError = validateUploadFile(file, session);
    if (fileValidationError) {
      return ApiResponse.error(fileValidationError);
    }

    const contentValidationError = await validateFileContentAsync(file, session);
    if (contentValidationError) {
      return ApiResponse.error(contentValidationError);
    }

    const result = await uploadFormFile(file, folder as "avatars" | "logos" | "content" | "posts");

    if (!result.success) {
      return ApiResponse.error(result.error || "Upload failed", 500);
    }

    return ApiResponse.success(
      { url: result.url, key: result.key },
      "Upload successful",
    );
  } catch (error) {
    logger.error("Form data upload error", error);
    return ApiResponse.error("Internal Server Error", 500);
  }
}


// Wrapped handlers via apiWrapper
export const POST = apiWrapper(_handler_POST);
