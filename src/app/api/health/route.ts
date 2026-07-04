import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { systemErrorsTotal } from "@/lib/metrics";
import getRazorpay from "@/lib/razorpay";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

// Lazy-resolve S3 Client to avoid import crashes in local mode
function getHealthS3Client(): { client: S3Client | null; bucket: string; provider: string } {
  try {
    const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || "local";
    const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || "";
    const S3_SECRET_KEY = process.env.S3_SECRET_KEY || "";
    const S3_BUCKET = process.env.S3_BUCKET || "";
    const S3_REGION = process.env.S3_REGION || "ap-south-1";
    const S3_ENDPOINT = process.env.S3_ENDPOINT || "";

    if (!S3_ACCESS_KEY || !S3_SECRET_KEY || !S3_BUCKET) {
      return { client: null, bucket: "", provider: STORAGE_PROVIDER };
    }

    const config: {
      region: string;
      forcePathStyle: boolean;
      credentials: { accessKeyId: string; secretAccessKey: string };
      endpoint?: string;
    } = {
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

    return { client: new S3Client(config), bucket: S3_BUCKET, provider: STORAGE_PROVIDER };
  } catch {
    return { client: null, bucket: "", provider: "local" };
  }
}

function isAuthorizedDeepHealth(request: NextRequest): boolean {
  const secret = process.env.HEALTHCHECK_SECRET || process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") || "";

  if (!secret || !authHeader) return false;

  const expectedHash = createHash("sha256")
    .update(`Bearer ${secret}`)
    .digest();
  const actualHash = createHash("sha256").update(authHeader).digest();

  return timingSafeEqual(actualHash, expectedHash);
}

async function checkDatabaseHealth(healthCheck: any) {
  try {
    await prisma.user.findFirst({ select: { id: true } });
    healthCheck.services.database = "OK";
  } catch (error) {
    healthCheck.services.database = "DOWN";
    healthCheck.status = "DEGRADED";
    logger.error("[Health] Database health check failed", error);
    systemErrorsTotal
      .labels({ error_type: "database_health_check", route: "/api/health" })
      .inc();
  }
}

async function checkRedisHealth(healthCheck: any) {
  try {
    await redis.ping();
    healthCheck.services.redis = "OK";
  } catch (error) {
    healthCheck.services.redis = "DOWN";
    healthCheck.status = "DEGRADED";
    logger.error("[Health] Redis health check failed", error);
    systemErrorsTotal
      .labels({ error_type: "redis_health_check", route: "/api/health" })
      .inc();
  }
}

async function checkRazorpayHealth(healthCheck: any) {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      healthCheck.services.razorpay = "UNCONFIGURED";
    } else {
      const razorpay = getRazorpay();
      await razorpay.payments.all({ count: 1 });
      healthCheck.services.razorpay = "OK";
    }
  } catch (error) {
    healthCheck.services.razorpay = "DOWN";
    healthCheck.status = "DEGRADED";
    logger.error("[Health] Razorpay health check failed", error);
    systemErrorsTotal
      .labels({ error_type: "razorpay_health_check", route: "/api/health" })
      .inc();
  }
}

async function checkStorageHealth(healthCheck: any) {
  try {
    const { client, bucket, provider } = getHealthS3Client();
    if (provider === "local" || !client) {
      healthCheck.services.storage = "OK (LOCAL)";
    } else {
      await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
      healthCheck.services.storage = "OK";
    }
  } catch (error) {
    healthCheck.services.storage = "DOWN";
    healthCheck.status = "DEGRADED";
    logger.error("[Health] Storage health check failed", error);
    systemErrorsTotal
      .labels({ error_type: "storage_health_check", route: "/api/health" })
      .inc();
  }
}

async function checkEmailHealth(healthCheck: any) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      const res = await fetch("https://api.resend.com/emails", {
        headers: { Authorization: "Bearer invalid_ping_token" },
        signal: AbortSignal.timeout(5000),
      });
      if (res.status === 401 || res.ok) {
        healthCheck.services.email = "OK";
      } else {
        healthCheck.services.email = `DOWN (HTTP ${res.status})`;
        healthCheck.status = "DEGRADED";
      }
    } else {
      healthCheck.services.email = "UNCONFIGURED";
    }
  } catch (error) {
    healthCheck.services.email = "DOWN";
    healthCheck.status = "DEGRADED";
    logger.error("[Health] Email provider health check failed", error);
    systemErrorsTotal
      .labels({ error_type: "email_health_check", route: "/api/health" })
      .inc();
  }
}

export async function GET(request: NextRequest) {
  const deep = request.nextUrl.searchParams.get("deep") === "1";

  if (!deep) {
    return NextResponse.json({
      status: "OK",
      timestamp: Date.now(),
    });
  }

  if (!isAuthorizedDeepHealth(request)) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  const healthCheck: {
    uptime: number;
    timestamp: number;
    status: string;
    services: {
      database: string;
      redis: string;
      razorpay: string;
      storage: string;
      email: string;
    };
  } = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    status: "OK",
    services: {
      database: "UNKNOWN",
      redis: "UNKNOWN",
      razorpay: "UNKNOWN",
      storage: "UNKNOWN",
      email: "UNKNOWN",
    },
  };

  await checkDatabaseHealth(healthCheck);
  await checkRedisHealth(healthCheck);
  await checkRazorpayHealth(healthCheck);
  await checkStorageHealth(healthCheck);
  await checkEmailHealth(healthCheck);

  const statusCode = healthCheck.status === "OK" ? 200 : 503;

  return NextResponse.json(healthCheck, { status: statusCode });
}
