/**
 * Cloud Storage Service
 * Handles file uploads for verification docs, content, and profile images.
 * Supports: AWS S3, Cloudflare R2, and local filesystem (dev).
 *
 * Add STORAGE_PROVIDER + credentials to .env to activate.
 */

import { logger } from "./logger";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl as createPresignedUrl } from "@aws-sdk/s3-request-presigner";

const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || "local"; // 's3' | 'r2' | 'local'

// AWS S3 / Cloudflare R2 config
const S3_BUCKET = process.env.S3_BUCKET || "";
const S3_REGION = process.env.S3_REGION || "ap-south-1";
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || "";
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || "";
const S3_ENDPOINT = process.env.S3_ENDPOINT || ""; // For R2: https://<account-id>.r2.cloudflarestorage.com
const STORAGE_PUBLIC_URL = (
  process.env.STORAGE_PUBLIC_URL ||
  process.env.R2_PUBLIC_URL ||
  ""
).replace(/\/+$/, "");
const isProduction = process.env.NODE_ENV === "production";
let s3Client: S3Client | null = null;


// ==================== TYPES ====================

export interface UploadResult {
  success: boolean;
  url?: string;
  key?: string;
  size?: number;
  error?: string;
}

export interface DeleteResult {
  success: boolean;
  error?: string;
}

type UploadFolder = "verification" | "content" | "avatars" | "logos" | "posts";

function getS3Client(): S3Client | null {
  if (!S3_ACCESS_KEY || !S3_SECRET_KEY || !S3_BUCKET) return null;

  if (!s3Client) {
    const config: S3ClientConfig = {
      region: STORAGE_PROVIDER === "r2" ? "auto" : S3_REGION,
      forcePathStyle: Boolean(S3_ENDPOINT),
      credentials: {
        accessKeyId: S3_ACCESS_KEY,
        secretAccessKey: S3_SECRET_KEY,
      },
    };

    if (S3_ENDPOINT) {
      config.endpoint = S3_ENDPOINT;
    }

    s3Client = new S3Client(config);
  }

  return s3Client;
}

function getObjectUrl(key: string): string {
  if (STORAGE_PUBLIC_URL) {
    return `${STORAGE_PUBLIC_URL}/${key}`;
  }

  if (S3_ENDPOINT) {
    return `${S3_ENDPOINT.replace(/\/+$/, "")}/${S3_BUCKET}/${key}`;
  }

  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
}

// ==================== UPLOAD ====================

/**
 * Upload a file to cloud storage.
 * Returns the public URL of the uploaded file.
 */
export async function uploadFile(
  file: Buffer | Uint8Array,
  fileName: string,
  folder: UploadFolder,
  contentType: string = "application/octet-stream",
): Promise<UploadResult> {
  const key = `${folder}/${Date.now()}-${sanitizeFileName(fileName)}`;

  try {
    switch (STORAGE_PROVIDER) {
      case "s3":
      case "r2":
        return await uploadToS3(file, key, contentType);

      case "local":
      default:
        return await uploadToLocal(file, key);
    }
  } catch (error) {
    logger.error("Storage upload failed", error, { key });
    return { success: false, error: "File upload failed" };
  }
}

/**
 * Upload from a File/Blob (e.g., from FormData).
 */
export async function uploadFormFile(
  formFile: File,
  folder: UploadFolder,
): Promise<UploadResult> {
  const buffer = Buffer.from(await formFile.arrayBuffer());
  return uploadFile(buffer, formFile.name, folder, formFile.type);
}

/**
 * Upload from a base64 string.
 */
export async function uploadBase64(
  base64: string,
  fileName: string,
  folder: UploadFolder,
  contentType: string = "image/png",
): Promise<UploadResult> {
  // Remove data URL prefix if present
  const data = base64.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(data, "base64");
  return uploadFile(buffer, fileName, folder, contentType);
}

// ==================== DELETE ====================

/**
 * Delete a file from cloud storage by key.
 */
export async function deleteFile(key: string): Promise<DeleteResult> {
  try {
    switch (STORAGE_PROVIDER) {
      case "s3":
      case "r2":
        return await deleteFromS3(key);
      case "local":
      default:
        logger.warn("Local delete not implemented", { key });
        return { success: true };
    }
  } catch (error) {
    logger.error("Storage delete failed", error, { key });
    return { success: false, error: "File deletion failed" };
  }
}

// ==================== GET SIGNED URL (for private files) ====================

/**
 * Generate a signed/presigned URL for temporary access to a private file.
 */
export async function getSignedUrl(
  key: string,
  expiresInSeconds: number = 3600,
): Promise<string | null> {
  if (STORAGE_PROVIDER === "local") {
    return `/uploads/${key}`;
  }

  const client = getS3Client();
  if (!client) {
    logger.error("Signed URL requested but S3/R2 credentials are not configured", {
      key,
      provider: STORAGE_PROVIDER,
    });
    return null;
  }

  return createPresignedUrl(
    client,
    new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}

// ==================== PROVIDER IMPLEMENTATIONS ====================

async function uploadToS3(
  file: Buffer | Uint8Array,
  key: string,
  contentType: string,
): Promise<UploadResult> {
  const client = getS3Client();
  if (!client) {
    const error = "S3/R2 credentials are not fully configured";
    if (isProduction) {
      logger.error(error, { key, provider: STORAGE_PROVIDER });
      return { success: false, error };
    }
    logger.warn(`${error} - falling back to local in non-production mode`);
    return uploadToLocal(file, key);
  }

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: file,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    return {
      success: true,
      url: getObjectUrl(key),
      key,
      size: file.length,
    };
  } catch (error) {
    logger.error("S3/R2 upload error", error, {
      key,
      provider: STORAGE_PROVIDER,
    });
    return { success: false, error: "Cloud storage upload failed" };
  }
}


async function uploadToLocal(
  file: Buffer | Uint8Array,
  key: string,
): Promise<UploadResult> {
  // In development, save to public/uploads directory
  const fs = await import("fs/promises");
  const path = await import("path");

  const uploadDir = path.join(
    process.cwd(),
    "public",
    "uploads",
    path.dirname(key),
  );
  await fs.mkdir(uploadDir, { recursive: true });

  const filePath = path.join(process.cwd(), "public", "uploads", key);
  await fs.writeFile(filePath, file);

  const url = `/uploads/${key}`;
  logger.debug("Local file saved", { url });
  return { success: true, url, key, size: file.length };
}

async function deleteFromS3(key: string): Promise<DeleteResult> {
  const client = getS3Client();
  if (!client) {
    return { success: false, error: "S3 not configured" };
  }

  await client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  return { success: true };
}


// ==================== HELPERS ====================

function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
}

/**
 * Validate file before upload.
 */
export function validateFile(
  file: { size: number; type: string; name: string },
  options: {
    maxSizeMB?: number;
    allowedTypes?: string[];
  } = {},
): { valid: boolean; error?: string } {
  const maxSize = (options.maxSizeMB || 10) * 1024 * 1024; // Default 10MB
  const allowedTypes = options.allowedTypes || [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
    "video/mp4",
    "video/webm",
  ];

  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File too large. Max ${options.maxSizeMB || 10}MB`,
    };
  }

  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: `File type not allowed: ${file.type}` };
  }

  return { valid: true };
}

