
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
 * - isDuplicate: false -> successfully claimed, caller should proceed with execution.
 * - isDuplicate: true -> another request has already claimed this key.
 *   - if response is { status: "PROCESSING" }, it's currently processing.
 *   - otherwise, response contains the saved response.
 */
async function handleExistingIdempotencyKey(
    existing: { expiresAt: Date; userId: string | null; response: Prisma.JsonValue },
    key: string,
    normalizedUserId: string | null
): Promise<IdempotencyCheckResult | null> {
    if (new Date() > existing.expiresAt) {
        // Key expired, delete it safely
        await prisma.idempotencyKey.delete({ where: { key } }).catch(() => { });
        return null;
    }

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

async function handleClaimRaceCondition(
    key: string,
    normalizedUserId: string | null
): Promise<IdempotencyCheckResult> {
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

export async function claimIdempotencyKey(
    key: string,
    userId: string | null = null,
): Promise<IdempotencyCheckResult> {
    const normalizedUserId = userId;

    // 1. Check if the key already exists
    const existing = await prisma.idempotencyKey.findUnique({
        where: { key },
    });

    if (existing) {
        const checkRes = await handleExistingIdempotencyKey(existing, key, normalizedUserId);
        if (checkRes) {
            return checkRes;
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
            return handleClaimRaceCondition(key, normalizedUserId);
        }
        logger.error("[Idempotency] Failed to claim key", error, { key });
        throw error;
    }
}


/**
 * Release an idempotency key (delete it) if the operation failed,
 * allowing subsequent retries.
 */
export async function releaseIdempotencyKey(
    key: string,
    userId: string | null = null,
): Promise<void> {
    const normalizedUserId = userId;
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

export async function saveIdempotencyResponse(
    key: string,
    response: Prisma.InputJsonValue,
    userId: string | null = null,
): Promise<void> {
    const normalizedUserId = userId;
    try {
        await prisma.idempotencyKey.update({
            where: { key },
            data: {
                userId: normalizedUserId,
                response,
            },
        });
    } catch (error) {
        logger.error("[Idempotency] Failed to save response", error, { key });
    }
}
