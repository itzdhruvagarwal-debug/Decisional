import { AppError } from "@/lib/errors";
import { redis } from "./redis";
import { logger } from "./logger";

export interface CircuitBreakerOptions {
    failureThreshold?: number; // Number of failed attempts before opening the circuit
    resetTimeout?: number;     // Seconds to keep the circuit OPEN before allowing retry
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
        // Ignore normal business errors if they aren't network/timeout related.
        // For Razorpay, network or 5xx errors usually throw exceptions or give no response.
        // 4xx responses (Bad Request) shouldn't necessarily trip the circuit breaker,
        // but in node sdk they are thrown as errors.
        // We will count all thrown errors as failures for simplicity, or we could filter them:
        interface RazorpayError { code?: string; statusCode?: number; }
        const typedErr = error as RazorpayError;
        const isNetworkOrServerError =
            typedErr.code === 'ETIMEDOUT' ||
            typedErr.code === 'ECONNREFUSED' ||
            (typedErr.statusCode !== undefined && typedErr.statusCode >= 500) ||
            typedErr.statusCode === undefined;

        // If it's a structural error (like incorrect arguments 400), don't trip circuit breaker
        if (!isNetworkOrServerError && typedErr.statusCode !== undefined && typedErr.statusCode < 500) {
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
