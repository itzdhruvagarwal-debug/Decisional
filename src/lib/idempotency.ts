import { AppError } from "@/lib/errors";
import { Prisma } from "@prisma/client";
import prisma from "./db";
import { logger } from "./logger";

/**
 * Idempotency Service
 * Protects against duplicate requests and replay attacks.
 */

export interface IdempotencyCheckResult {
    isDuplicate: boolean;
    savedResponse?: Prisma.JsonValue;
    ownerMismatch?: boolean;
}

/**
 * Claim an idempotency key atomically to prevent concurrent processing.
 * Returns:
 * - isDuplicate: false -> successfully claimed, caller should proceed with execution and then call saveIdempotencyResponse.
 * - isDuplicate: true -> another request has already claimed this key.
 *   - if response is { status: "PROCESSING" }, it's currently processing.
 *   - otherwise, response contains the saved response.
 */
export async function claimIdempotencyKey(
    key: string,
    userId?: string | null,
): Promise<IdempotencyCheckResult> {
    const normalizedUserId = userId ?? null;

    // 1. Check if the key already exists
    const existing = await prisma.idempotencyKey.findUnique({
        where: { key },
    });

    if (existing) {
        // Check TTL
        if (new Date() > existing.expiresAt) {
            // Key expired, delete it safely
            await prisma.idempotencyKey.delete({ where: { key } }).catch(() => { });
        } else {
            // Not expired, check owner
            if ((existing.userId ?? null) !== normalizedUserId) {
                logger.warn("[Idempotency] Owner mismatch blocked", {
                    key,
                    requestUserId: normalizedUserId,
                    keyUserId: existing.userId ?? null,
                });
                return { isDuplicate: true, ownerMismatch: true };
            }
            return { isDuplicate: true, savedResponse: existing.response };
        }
    }

    // 2. Try to claim the key by creating it with status PROCESSING
    try {
        await prisma.idempotencyKey.create({
            data: {
                key,
                userId: normalizedUserId,
                expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes lock while processing
                response: { status: "PROCESSING" },
            },
        });
        return { isDuplicate: false };
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            // Race condition: another request created it concurrently!
            const existingAfterRace = await prisma.idempotencyKey.findUnique({
                where: { key },
            });
            if (existingAfterRace) {
                if ((existingAfterRace.userId ?? null) !== normalizedUserId) {
                    return { isDuplicate: true, ownerMismatch: true };
                }
                return { isDuplicate: true, savedResponse: existingAfterRace.response };
            }
            return { isDuplicate: true };
        }
        logger.error("[Idempotency] Failed to claim key", error, { key });
        throw error;
    }
}

/**
 * Check if a request with given key was already processed.
 * (Preserved for compatibility/inspection purposes, but wraps claimIdempotencyKey logic)
 */
export async function checkIdempotency(
    key: string,
    userId?: string | null,
): Promise<IdempotencyCheckResult> {
    return claimIdempotencyKey(key, userId);
}

/**
 * Release an idempotency key (delete it) if the operation failed,
 * allowing subsequent retries.
 */
export async function releaseIdempotencyKey(
    key: string,
    userId?: string | null,
): Promise<void> {
    const normalizedUserId = userId ?? null;
    try {
        const existing = await prisma.idempotencyKey.findUnique({
            where: { key },
        });
        if (existing) {
            if ((existing.userId ?? null) !== normalizedUserId) {
                return;
            }
            // Only delete if it's still in PROCESSING state
            if (
                existing.response &&
                typeof existing.response === "object" &&
                (existing.response as Record<string, unknown>).status === "PROCESSING"
            ) {
                await prisma.idempotencyKey.delete({ where: { key } }).catch(() => {});
            }
        }
    } catch (error) {
        logger.error("[Idempotency] Failed to release key", error, { key });
    }
}

/**
 * Mark a request as processed and save the response for future replays.
 */
export async function saveIdempotencyResponse(
    key: string,
    response: Prisma.JsonValue,
    ttlSeconds: number = 86400, // Default 24h
    userId?: string | null,
): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const normalizedUserId = userId ?? null;

    try {
        const existing = await prisma.idempotencyKey.findUnique({
            where: { key },
        });

        if (existing) {
            if ((existing.userId ?? null) !== normalizedUserId) {
                logger.warn("[Idempotency] Refusing to overwrite key for another owner", {
                    key,
                    requestUserId: normalizedUserId,
                    keyUserId: existing.userId ?? null,
                });
                throw AppError.badRequest("IDEMPOTENCY_KEY_OWNER_MISMATCH");
            }

            await prisma.idempotencyKey.update({
                where: { key },
                data: {
                    response: response ?? Prisma.DbNull,
                    expiresAt,
                },
            });
            return;
        }

        await prisma.idempotencyKey.create({
            data: {
                key,
                response: response ?? Prisma.DbNull,
                expiresAt,
                userId: normalizedUserId,
            },
        });
    } catch (error) {
        if (
            error instanceof Error &&
            (error instanceof Error ? error.message : String(error)) === "IDEMPOTENCY_KEY_OWNER_MISMATCH"
        ) {
            throw error;
        }

        logger.error("[Idempotency] Failed to save response", error, { key });
    }
}

/**
 * Webhook Specific Replay Prevention
 */
export async function isWebhookProcessed(eventId: string): Promise<boolean> {
    const existing = await prisma.processedWebhookEvent.findUnique({
        where: { eventId }
    });
    return !!existing;
}

export async function markWebhookProcessed(eventId: string, eventType: string, payload?: Prisma.InputJsonValue): Promise<void> {
    try {
        await prisma.processedWebhookEvent.create({
            data: {
                eventId,
                eventType,
                ...(payload === undefined ? {} : { payload })
            }
        });
    } catch (error) {
        // If it is a unique constraint error, another thread processed it concurrently.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            logger.warn("[Webhook] Duplicate event caught during mark", { eventId });
            return;
        }

        logger.error("[Webhook] Failed to mark event as processed", error, { eventId });
        throw error;
    }
}

/**
 * Batch cleanup for expired keys
 * Should be called by a cron job.
 */
export async function cleanupExpiredIdempotencyKeys(): Promise<number> {
    const result = await prisma.idempotencyKey.deleteMany({
        where: {
            expiresAt: { lt: new Date() }
        }
    });
    return result.count;
}
