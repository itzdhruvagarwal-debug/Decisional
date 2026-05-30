import { NextResponse } from "next/server";
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

    const config: any = {
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

export async function GET() {
  const healthCheck: any = {
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

  // 1. Check Database Health
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

  // 2. Check Redis Health
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

  // 3. Check Razorpay Health
  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      healthCheck.services.razorpay = "UNCONFIGURED";
    } else {
      const razorpay = getRazorpay();
      // Try to fetch last 1 payment as a live connectivity test
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

  // 4. Check Cloud Storage Health (S3/R2)
  try {
    const { client, bucket, provider } = getHealthS3Client();
    if (provider === "local" || !client) {
      healthCheck.services.storage = "OK (LOCAL)";
    } else {
      // Actively verify R2/S3 access by listing with limit of 1
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

  // 5. Check Resend Email Health
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      healthCheck.services.email = "UNCONFIGURED";
    } else {
      // Ping Resend endpoint briefly (should respond with 401/403 or ok, verifying DNS/HTTPS connection)
      const res = await fetch("https://api.resend.com/emails", {
        headers: { Authorization: "Bearer invalid_ping_token" },
        signal: AbortSignal.timeout(5000),
      });
      // A 401 responds confirming Resend servers are alive and DNS is fully active
      if (res.status === 401 || res.ok) {
        healthCheck.services.email = "OK";
      } else {
        healthCheck.services.email = `DOWN (HTTP ${res.status})`;
        healthCheck.status = "DEGRADED";
      }
    }
  } catch (error) {
    healthCheck.services.email = "DOWN";
    healthCheck.status = "DEGRADED";
    logger.error("[Health] Email provider health check failed", error);
    systemErrorsTotal
      .labels({ error_type: "email_health_check", route: "/api/health" })
      .inc();
  }

  const statusCode = healthCheck.status === "OK" ? 200 : 503;

  return NextResponse.json(healthCheck, { status: statusCode });
}
