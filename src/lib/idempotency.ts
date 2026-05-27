import prisma from "./db";
import { logger } from "./logger";

/**
 * Idempotency Service
 * Protects against duplicate requests and replay attacks.
 */

export interface IdempotencyCheckResult {
    isDuplicate: boolean;
    savedResponse?: any;
    ownerMismatch?: boolean;
}

/**
 * Check if a request with given key was already processed.
 * If key is found, returns the saved response.
 */
export async function checkIdempotency(
    key: string,
    userId?: string | null,
): Promise<IdempotencyCheckResult> {
    const normalizedUserId = userId ?? null;
    const existing = await prisma.idempotencyKey.findUnique({
        where: { key },
    });

    if (!existing) {
        return { isDuplicate: false };
    }

    // Check TTL
    if (new Date() > existing.expiresAt) {
        // Key expired, delete it (background or inline?)
        // Inline delete is safer for immediate retry
        await prisma.idempotencyKey.delete({ where: { key } }).catch(() => { });
        return { isDuplicate: false };
    }

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

/**
 * Mark a request as processed and save the response for future replays.
 */
export async function saveIdempotencyResponse(
    key: string,
    response: any,
    ttlSeconds: number = 86400, // Default 24h
    userId?: string | null,
): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const normalizedUserId = userId ?? null;

    try {
        const existing = await prisma.idempotencyKey.findUnique({
            where: { key },
        });

        if (existing && new Date() > existing.expiresAt) {
            await prisma.idempotencyKey.delete({ where: { key } }).catch(() => { });
        } else if (existing) {
            if ((existing.userId ?? null) !== normalizedUserId) {
                logger.warn("[Idempotency] Refusing to overwrite key for another owner", {
                    key,
                    requestUserId: normalizedUserId,
                    keyUserId: existing.userId ?? null,
                });
                throw new Error("IDEMPOTENCY_KEY_OWNER_MISMATCH");
            }

            await prisma.idempotencyKey.update({
                where: { key },
                data: {
                    response,
                    expiresAt,
                    userId: normalizedUserId,
                },
            });
            return;
        }

        await prisma.idempotencyKey.create({
            data: {
                key,
                response,
                expiresAt,
                userId: normalizedUserId,
            },
        });
    } catch (error) {
        if (
            error instanceof Error &&
            error.message === "IDEMPOTENCY_KEY_OWNER_MISMATCH"
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

export async function markWebhookProcessed(eventId: string, eventType: string, payload?: any): Promise<void> {
    try {
        await prisma.processedWebhookEvent.create({
            data: {
                eventId,
                eventType,
                payload
            }
        });
    } catch (_error) {
        // If it's a unique constraint error, it means another thread processed it concurrently
        logger.warn("[Webhook] Duplicate event caught during mark", { eventId });
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
