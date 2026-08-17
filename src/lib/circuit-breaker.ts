import { AppError } from "@/lib/errors";
import { redis } from "./redis";
import { logger } from "./logger";

export interface CircuitBreakerOptions {
failureThreshold?: number; // Number of failed attempts before opening the circuit
resetTimeout?: number; // Seconds to keep the circuit OPEN before allowing retry
}

/**
* Enterprise Circuit Breaker Pattern using Redis.
* Protects downstream services (like Razorpay, AWS, etc) from being overwhelmed during an outage,
* and maintains the health of this application by failing fast when external services are down.
*/
export async function withCircuitBreaker<T>(
actionName: string,
actionFn: () => Promise<T>,
options?: CircuitBreakerOptions
): Promise<T> {
const threshold = options?.failureThreshold || 5;
const timeoutSeconds = options?.resetTimeout || 60; // Default 1 minute

const failureKey = `cb:fail:${actionName}`;
const openKey = `cb:open:${actionName}`;

try {
// 1. Check if the circuit is OPEN (meaning we should fail fast)
const isCircuitOpen = await redis.get(openKey);
if (isCircuitOpen) {
logger.warn(`[CircuitBreaker] FAST FAIL: Action '${actionName}' is blocked. Circuit is currently OPEN.`);
throw AppError.badRequest(`Service unavailable for '${actionName}'. Circuit is OPEN.`);
}

// 2. Execute the downstream action
const result = await actionFn();

// 3. Action succeeded: Clear the failure count asynchronously to save time
redis.del(failureKey).catch((e) => logger.error(`[CircuitBreaker] Failed to delete failure key: ${e.message}`));

return result;

  } catch (error: unknown) {
    // Exclude AppError (client/validation errors 4xx) from tripping the circuit breaker
    if (error instanceof AppError && error.statusCode < 500) {
      throw error;
    }

    interface GatewayError { code?: string; statusCode?: number; }
    const typedErr = error as GatewayError;
    
    // If it's a 4xx error from downstream gateway, don't trip circuit breaker
    if (typedErr.statusCode !== undefined && typedErr.statusCode >= 400 && typedErr.statusCode < 500) {
      throw error;
    }

    const isNetworkOrServerError =
      typedErr.code === 'ETIMEDOUT' ||
      typedErr.code === 'ECONNREFUSED' ||
      typedErr.code === 'ENOTFOUND' ||
      (typedErr.statusCode !== undefined && typedErr.statusCode >= 500) ||
      (error instanceof Error && (error.message.includes('fetch') || error.message.includes('timeout') || error.message.includes('network')));

    if (!isNetworkOrServerError && error instanceof AppError) {
      throw error;
    }

try {
// 4. Action failed (Server/Network issue): Increment failure count
const failures = await redis.incr(failureKey);

// Set expiry on the failure key so a single failure a day doesn't eventually trip it
if (failures === 1) {
await redis.expire(failureKey, timeoutSeconds);
}

// 5. Check if failure count breached the threshold
if (failures >= threshold) {
logger.error(`[CircuitBreaker] TRIPPED! Action '${actionName}' crossed failure threshold (${threshold}). Circuit is now OPEN for ${timeoutSeconds}s.`);

// Open the circuit
await redis.set(openKey, "OPEN", "EX", timeoutSeconds);
// Clear the failure count
await redis.del(failureKey);
}
} catch (redisError) {
// If redis fails, just proceed throwing the original error (fail-open)
logger.error(`[CircuitBreaker] Redis tracking failed: ${redisError}`);
}

throw error;
}
}
