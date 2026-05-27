import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { systemErrorsTotal } from "@/lib/metrics";

export async function GET() {
  const healthCheck = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    status: "OK",
    services: {
      database: "OK",
      redis: "OK",
    },
  };

  try {
    // Check Database Health
    await prisma.user.findFirst({ select: { id: true } });
  } catch (error) {
    healthCheck.services.database = "DOWN";
    healthCheck.status = "DEGRADED";
    logger.error("[Health] Database health check failed", error);
    systemErrorsTotal
      .labels({ error_type: "database_health_check", route: "/api/health" })
      .inc();
  }

  try {
    // Check Redis Health (Strict Enterprise)
    await redis.ping();
  } catch (error) {
    healthCheck.services.redis = "DOWN";
    healthCheck.status = "DEGRADED";
    logger.error("[Health] Redis health check failed", error);
    systemErrorsTotal
      .labels({ error_type: "redis_health_check", route: "/api/health" })
      .inc();
  }

  const statusCode = healthCheck.status === "OK" ? 200 : 503;

  return NextResponse.json(healthCheck, { status: statusCode });
}
