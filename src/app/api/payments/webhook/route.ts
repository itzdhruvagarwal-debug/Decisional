import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { apiWrapper } from "@/lib/api-wrapper";
import { processSecureWebhook } from "@/lib/razorpay";
import { markWebhookProcessed } from "@/lib/idempotency";
import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

// Next.js config to allow raw body for Razorpay crypto verification
export const dynamic = "force-dynamic";

async function handleWalletTopupWebhook(payload: { event?: string; payload?: { payment?: { entity?: { order_id?: string; id: string; amount: number } } } }) {
  if (payload?.event !== "payment.captured") return;

  const payment = payload?.payload?.payment?.entity;
  if (!payment) return;

  const orderId = payment.order_id;
  const paymentId = payment.id;
  const amount = payment.amount;

  if (!orderId || !paymentId || !Number.isInteger(amount) || amount <= 0) {
    logger.warn("Skipping malformed wallet top-up webhook payload", {
      orderId,
      paymentId,
      amount,
    });
    return;
  }

  const transaction = await prisma.transaction.findFirst({
    where: {
      razorpayOrderId: orderId,
    },
    select: {
      id: true,
      walletId: true,
      amount: true,
      status: true,
    },
  });

  if (!transaction) {
    throw new Error(`Transaction not found for orderId: ${orderId}`);
  }

  if (transaction.status !== "PENDING") {
    logger.info("Transaction already processed, ignoring webhook", {
      orderId,
      status: transaction.status,
    });
    return;
  }

  if (transaction.amount !== amount) {
    const errorMsg = `Webhook amount mismatch: expected ${transaction.amount}, received ${amount}`;
    logger.error(errorMsg, {
      transactionId: transaction.id,
      expectedAmount: transaction.amount,
      receivedAmount: amount,
      orderId,
      paymentId,
    });
    throw new Error(errorMsg);
  }

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.transaction.updateMany({
        where: { id: transaction.id, status: "PENDING" },
        data: {
          status: "COMPLETED",
          razorpayPaymentId: paymentId,
        },
      });

      if (updated.count === 0) return;

      await tx.wallet.update({
        where: { id: transaction.walletId },
        data: {
          balance: { increment: transaction.amount },
          totalDeposited: { increment: transaction.amount },
        },
      });
    });
  } catch (error: unknown) {
    if ((error as { code?: string })?.code === "P2002") {
      logger.warn("Duplicate payment ID already recorded", {
        paymentId,
        transactionId: transaction.id,
      });
      return;
    }
    throw error;
  }
}
async function handlePayoutWebhook(payload: { event?: string; payload?: { payout?: { entity?: { reference_id?: string; id: string; failure_reason?: string } } } }) {
  const event = payload?.event ?? "";
  if (!["payout.processed", "payout.failed", "payout.rejected", "payout.reversed"].includes(event)) {
    return;
  }

  const payout = payload?.payload?.payout?.entity;
  if (!payout) return;

  const withdrawalId = payout.reference_id;
  const payoutId = payout.id;

  if (!withdrawalId) {
    logger.warn("Skipping payout webhook: missing reference_id", { payoutId });
    return;
  }

  const withdrawal = await prisma.withdrawal.findUnique({
    where: { id: withdrawalId },
    include: { wallet: true },
  });

  if (!withdrawal) {
    const errorMsg = `Withdrawal not found for webhook: reference_id=${withdrawalId}`;
    logger.error(errorMsg, { withdrawalId, payoutId });
    throw new Error(errorMsg);
  }

  const transaction = await prisma.transaction.findFirst({
    where: { withdrawalId: withdrawal.id },
  });

  if (!transaction) {
    const errorMsg = `Transaction not found for withdrawal: id=${withdrawal.id}`;
    logger.error(errorMsg, { withdrawalId });
    throw new Error(errorMsg);
  }

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const freshWithdrawal = await tx.withdrawal.findUnique({
        where: { id: withdrawal.id },
        select: { status: true },
      });

      if (!freshWithdrawal || freshWithdrawal.status === "FAILED" || freshWithdrawal.status === "REVERSED") {
        logger.info("Withdrawal already processed, ignoring webhook", { withdrawalId, status: freshWithdrawal?.status });
        return;
      }

      if (freshWithdrawal.status === "COMPLETED" && event !== "payout.reversed") {
        logger.info("Withdrawal already processed, ignoring webhook", { withdrawalId, status: freshWithdrawal?.status });
        return;
      }

      if (event === "payout.processed") {
        const updateResult = await tx.withdrawal.updateMany({
          where: { id: withdrawal.id, status: { not: "COMPLETED" } },
          data: { status: "COMPLETED", processedAt: new Date(), razorpayPayoutId: payoutId }
        });

        if (updateResult.count === 0) {
          logger.info("Withdrawal already completed, skipping totalWithdrawn increment", { withdrawalId });
          return;
        }

        await tx.transaction.update({
          where: { id: transaction.id },
          data: { status: "COMPLETED" }
        });
        await tx.wallet.update({
          where: { id: withdrawal.walletId },
          data: { totalWithdrawn: { increment: withdrawal.amount } }
        });
      } else {
        // Check for existing refund transaction or terminal linked transaction status
        const refundTx = await tx.transaction.findFirst({
          where: {
            withdrawalId: withdrawal.id,
            OR: [
              { type: "REFUND" },
              { status: { in: ["FAILED", "REVERSED"] } }
            ]
          },
        });
        if (refundTx) {
          logger.info("Withdrawal already refunded/failed, skipping balance restore", { withdrawalId });
          return;
        }

        const targetStatus = event === "payout.reversed" ? "REVERSED" : "FAILED";

        const updateResult = await tx.withdrawal.updateMany({
          where: {
            id: withdrawal.id,
            status: { notIn: ["FAILED", "REVERSED"] }
          },
          data: {
            status: targetStatus,
            failureReason: `Payout failed with event ${event}. Reason: ${payout.failure_reason || "unknown"}`,
            razorpayPayoutId: payoutId,
            processedAt: new Date(),
          }
        });

        if (updateResult.count === 0) {
          logger.info("Withdrawal already failed/reversed, skipping refund", { withdrawalId });
          return;
        }

        // Failed / Rejected / Reversed -> Refund Wallet
        await tx.wallet.update({
          where: { id: withdrawal.walletId },
          data: {
            balance: { increment: withdrawal.amount },
            ...(freshWithdrawal.status === "COMPLETED"
              ? { totalWithdrawn: { decrement: withdrawal.amount } }
              : {})
          }
        });

        await tx.transaction.update({
          where: { id: transaction.id },
          data: { status: targetStatus }
        });
      }
    });
  } catch (error: unknown) {
    logger.error("Error processing payout webhook in transaction", error, { withdrawalId });
    throw error;
  }
}

async function _handler_POST(request: NextRequest) {
  const rawBody = await request.text();
  const headerList = await headers();
  const signature = headerList.get("x-razorpay-signature");

  if (!signature) {
    return NextResponse.json({ success: false, message: "Missing signature" }, { status: 400 });
  }

  // Try Parse to grab event types for logger
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, message: "Malformed JSON" }, { status: 400 });
  }

  // Prefer explicit Razorpay event id header; fallback to payload ids.
  const eventId =
    headerList.get("x-razorpay-event-id") ||
    payload?.payload?.payment?.entity?.id ||
    payload?.payload?.order?.entity?.id ||
    payload?.payload?.payout?.entity?.id ||
    "";
  const eventType = typeof payload?.event === "string" ? payload.event : "unknown";
  const result = await processSecureWebhook(
    rawBody,
    signature,
    eventId,
    eventType,
  );

  if (!result.isValid) {
    logger.warn("Webhook rejected: invalid signature", {
      eventType,
      eventId,
    });
    return NextResponse.json(
      { success: false, message: "Invalid signature" },
      { status: 400 },
    );
  }

  if (result.isDuplicate) {
    return NextResponse.json(
      { success: true, message: "Duplicate webhook ignored" },
      { status: 200 },
    );
  }

  // Acquire Redis-based distributed lock to prevent concurrent webhook execution collisions.
  const lockKey = `webhook:lock:${result.eventKey}`;
  const acquired = await redis.set(lockKey, "LOCKED", "EX", 60, "NX");
  if (!acquired) {
    logger.warn("Webhook collision detected, concurrent processing locked", { eventKey: result.eventKey });
    return NextResponse.json(
      { success: true, message: "Webhook is currently processing elsewhere" },
      { status: 200 },
    );
  }

  try {
    try {
      await handleWalletTopupWebhook(payload);
      await handlePayoutWebhook(payload);
      await markWebhookProcessed(result.eventKey, eventType, payload);

      logger.info("Webhook processed successfully", {
        eventType: payload?.event,
        eventKey: result.eventKey,
      });
    } finally {
      // Safely release the lock after completion or failure.
      await redis.del(lockKey).catch(() => {});
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "Webhook already processed") {
      return NextResponse.json({ success: true, message: "Idempotency caught" }, { status: 200 });
    }
    throw error;
  }

  return NextResponse.json({ success: true, message: "Webhook processed" }, { status: 200 });
}

export const POST = apiWrapper(_handler_POST);
