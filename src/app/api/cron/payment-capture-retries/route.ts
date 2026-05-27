import { NextResponse } from "next/server";
import { validateCronSecret } from "../guard";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { retryPaymentCapture } from "@/lib/contract-engine";

const MAX_DEALS_PER_RUN = 25;
const MIN_STUCK_MS = 2 * 60 * 1000;

type RetryMetadata = {
  attempt?: number;
  nextRetryAt?: string;
};

function getRetryMetadata(metadata: unknown): RetryMetadata {
  if (!metadata || typeof metadata !== "object") return {};
  const record = metadata as Record<string, unknown>;
  const result: RetryMetadata = {};

  if (typeof record.attempt === "number") result.attempt = record.attempt;
  if (typeof record.nextRetryAt === "string") {
    result.nextRetryAt = record.nextRetryAt;
  }

  return result;
}

async function runPaymentCaptureRetryCron() {
  try {
    await validateCronSecret();

    const stuckBefore = new Date(Date.now() - MIN_STUCK_MS);
    const deals = await prisma.deal.findMany({
      where: {
        OR: [
          {
            status: { in: ["PAYMENT_HELD", "VERIFIED"] },
            paymentHold: {
              is: {
                status: "HELD",
                razorpayPaymentId: { not: null },
                updatedAt: { lt: stuckBefore },
              },
            },
          },
          {
            status: "VERIFIED",
            paymentHold: null,
            updatedAt: { lt: stuckBefore },
          },
        ],
      },
      include: { paymentHold: true },
      orderBy: { updatedAt: "asc" },
      take: MAX_DEALS_PER_RUN,
    });

    const results: Array<Record<string, unknown>> = [];

    for (const deal of deals) {
      const hold = deal.paymentHold;
      if (!hold) {
        // Wallet-settled deal retry
        try {
          const { PaymentService } = await import("@/services/payment.service");
          await PaymentService.processDealCompletion(deal.id);
          results.push({
            dealId: deal.id,
            success: true,
            type: "wallet_settlement",
          });
        } catch (error: any) {
          logger.error("Wallet settlement retry failed", error, { dealId: deal.id });
          results.push({
            dealId: deal.id,
            success: false,
            type: "wallet_settlement",
            error: error.message || String(error),
          });
        }
        continue;
      }

      if (!hold.razorpayPaymentId) continue;

      const retryLogs = await prisma.activityLog.findMany({
        where: {
          action: "PAYMENT_RETRY",
          entityType: "PaymentHold",
          entityId: hold.id,
        },
        select: { metadata: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });

      const retryMetadata: RetryMetadata[] = retryLogs.map((log: { metadata: unknown }) =>
        getRetryMetadata(log.metadata),
      );
      const latestRetry = retryMetadata.at(-1);
      const nextRetryAt = latestRetry?.nextRetryAt
        ? new Date(latestRetry.nextRetryAt)
        : null;

      if (nextRetryAt && !Number.isNaN(nextRetryAt.getTime()) && nextRetryAt > new Date()) {
        results.push({
          dealId: deal.id,
          skipped: true,
          reason: "retry_not_due",
          nextRetryAt: nextRetryAt.toISOString(),
        });
        continue;
      }

      const highestAttempt = retryMetadata.reduce(
        (max: number, item: RetryMetadata) => Math.max(max, item.attempt ?? 0),
        0,
      );
      const currentAttempt = highestAttempt + 1;

      try {
        const result = await retryPaymentCapture(
          deal.id,
          hold.razorpayPaymentId,
          currentAttempt,
        );

        results.push({ dealId: deal.id, ...result });
      } catch (error) {
        logger.error("Payment capture retry cron item failed", error, {
          dealId: deal.id,
          paymentHoldId: hold.id,
        });
        results.push({
          dealId: deal.id,
          success: false,
          error: "retry_failed",
        });
      }
    }

    return NextResponse.json({
      success: true,
      scanned: deals.length,
      results,
    });
  } catch (error: any) {
    logger.error("Cron Error (Payment Capture Retries)", {
      error: error.message,
    });

    if (error.message === "Invalid Cron Secret") {
      return NextResponse.json(
        { success: false, message: "Forbidden" },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { success: false, message: "Cron internal failure" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return runPaymentCaptureRetryCron();
}

export async function POST() {
  return runPaymentCaptureRetryCron();
}
