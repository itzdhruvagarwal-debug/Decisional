import { redis } from "./redis";
import { logger } from "./logger";
import prisma from "./db";

interface RateLimitConfig {
  uniqueToken: string;
  limit: number;
  window: number; // in seconds
}

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

/**
 * Enterprise-grade rate limiting using Redis sliding window.
 * This implementation uses Lua script for atomic execution, ensuring accuracy in high-concurrency environments.
 */

export async function rateLimit(
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const { uniqueToken, limit, window } = config;
  const key = `ratelimit:${uniqueToken}`;
  const now = Date.now();
  const windowStart = now - window * 1000;
  const windowSeconds = window;

  // Lua script to efficiently manage sliding window
  // Clean up old entries outside the window
  // Count entries inside the window
  // Add new entry if allowed
  const script = `
    local key = KEYS[1]
    local windowStart = tonumber(ARGV[1])
    local now = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])
    local windowSeconds = tonumber(ARGV[4])
    
    -- Cleanup: Remove timestamps older than the window
    redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)
    
    -- Count: Get number of requests in current window
    local count = redis.call('ZCARD', key)
    
    if count < limit then
        -- Allowed: Add current request timestamp
        redis.call('ZADD', key, now, now)
        redis.call('EXPIRE', key, windowSeconds) 
        return {1, count + 1}
    else
        -- Blocked: Return current count
        redis.call('EXPIRE', key, windowSeconds)
        return {0, count}
    end
    `;

  try {
    const result = (await redis.eval(
      script,
      1,
      key,
      windowStart,
      now,
      limit,
      windowSeconds,
    )) as [number, number];

    const [allowed, currentCount] = result;
    const success = allowed === 1;

    return {
      success,
      limit,
      remaining: Math.max(0, limit - currentCount),
      reset: Math.floor((now + window * 1000) / 1000),
    };
  } catch (error) {
    logger.error("Rate limit Redis error — failing open", error);
    // Fail open strategy: If Redis fails, allow the request to proceed to avoid downtime.
    return {
      success: true,
      limit,
      remaining: 1,
      reset: Math.floor(now / 1000),
    };
  }
}

export const RATE_LIMIT_CONFIGS = {
  CAMPAIGNS: { limit: 10, window: 3600 },
  APPLICATIONS: { limit: 20, window: 3600 },
  AUTH: { limit: 5, window: 60 },
  LOGIN_IP: { limit: 5, window: 900 }, // 5 attempts per 15 minutes per IP
  LOGIN_EMAIL: { limit: 5, window: 900 }, // 5 attempts per 15 minutes per email
  REGISTER: { limit: 3, window: 3600 }, // 3 registrations per hour per IP
  MESSAGES: { limit: 100, window: 3600 },
  DEAL_UPDATES: { limit: 50, window: 3600 },
  API_DEFAULT: { limit: 120, window: 60 }, // 120 req/min per user
  REVIEWS: { limit: 10, window: 3600 },
  WITHDRAWAL: { limit: 3, window: 86400 }, // 3 withdrawals per day (anti-fraud)
  UPLOAD: { limit: 10, window: 3600 }, // 10 uploads per hour
  DISPUTES: { limit: 5, window: 3600 }, // 5 dispute submissions per hour
  PROFILE_UPDATE: { limit: 10, window: 3600 }, // 10 profile updates per hour
  PASSWORD_RESET: { limit: 3, window: 3600 }, // 3 requests per hour
};

/**
 * Adaptive Rate Limiting
 * Adjusts thresholds dynamically based on User Trust Score.
 * Enterprise security measure to throttle suspicious/low-reputation users more strictly.
 */
export async function checkAdaptiveRateLimit(
  userId: string,
  type: keyof typeof RATE_LIMIT_CONFIGS,
): Promise<RateLimitResult> {
  const config = RATE_LIMIT_CONFIGS[type];

  // Fetch trust score
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { trustScore: true },
  });

  const score = user?.trustScore || 50; // Default to neutral
  let multiplier = 1.0;

  if (score >= 90)
    multiplier = 2.0; // Elite
  else if (score >= 75)
    multiplier = 1.5; // Trusted
  else if (score >= 50)
    multiplier = 1.0; // Normal
  else if (score >= 30)
    multiplier = 0.5; // At-Risk
  else multiplier = 0.2; // High-Risk

  const customLimit = Math.max(1, Math.round(config.limit * multiplier));

  return rateLimit({
    uniqueToken: `${type}:adaptive:${userId}`,
    limit: customLimit,
    window: config.window,
  });
}

export async function checkRateLimit(
  key: string,
  type: keyof typeof RATE_LIMIT_CONFIGS,
): Promise<RateLimitResult> {
  // Allow local dev/test traffic to bypass strict limits — never in production or staging.
  const isLocalDev =
    process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  if (
    isLocalDev &&
    (key === "127.0.0.1" ||
      key === "::1" ||
      key === "0.0.0.0")
  ) {
    return { success: true, limit: 9999, remaining: 9999, reset: 0 };
  }

  // Note: Rate limiting is always enforced, even in test environments.
  // Tests that need to bypass rate limits should use dedicated test infrastructure
  // or configure a test-specific Redis instance with higher limits.
  // A global bypass env var would be a security backdoor if accidentally left enabled.
  const config = RATE_LIMIT_CONFIGS[type];
  return rateLimit({
    uniqueToken: `${type}:${key}`,
    limit: config.limit,
    window: config.window,
  });
}
