import Redis, { type RedisOptions } from "ioredis";
import { logger } from "./logger";

const isBuildTime =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.npm_lifecycle_event === "build" ||
  process.argv.join(" ").includes("next build");

if (!process.env.REDIS_URL && process.env.NODE_ENV === "production" && !isBuildTime) {
  logger.error(
    "CRITICAL ERROR: REDIS_URL is not defined. Redis is required for enterprise rate limiting, caching, and sessions.",
  );
  throw new Error("REDIS_URL is strictly required for this application.");
}

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const isTlsRedisUrl = redisUrl.startsWith("rediss://");
const isUpstashRedisUrl = (() => {
  try {
    return new URL(redisUrl).hostname.endsWith(".upstash.io");
  } catch {
    return false;
  }
})();
const shouldDisableReadyCheck = isTlsRedisUrl || isUpstashRedisUrl;
const isProductionRuntime = process.env.NODE_ENV === "production" && !isBuildTime;

if (!process.env.REDIS_URL) {
  logger.warn("REDIS_URL missing. Falling back to local Redis URL.", {
    redisUrl,
  });
}

const globalForRedis = global as unknown as { redis: Redis };
const redisOptions: RedisOptions = {
  lazyConnect: isBuildTime,
  connectTimeout: isProductionRuntime ? 10000 : 500,
  enableOfflineQueue: isProductionRuntime,
  maxRetriesPerRequest: isProductionRuntime ? 3 : 1,
  enableReadyCheck: !shouldDisableReadyCheck,
  retryStrategy(times) {
    if (!isProductionRuntime) return null;
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
};

export const redis =
  globalForRedis.redis ||
  new Redis(redisUrl, redisOptions);

// Log Redis Connection Issues to prevent silent failure
if (!isBuildTime) {
  redis.on("error", (err) => {
    logger.error("Redis Connection Error:", err);
  });

  redis.on("ready", () => {
    logger.info("Enterprise Redis connected successfully");
  });
}

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

export default redis;
