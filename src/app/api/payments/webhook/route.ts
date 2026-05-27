import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { processSecureWebhook } from "@/lib/razorpay";
import { markWebhookProcessed } from "@/lib/idempotency";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";

// Next.js config to allow raw body for Razorpay crypto verification
export const dynamic = "force-dynamic";

async function handleWalletTopupWebhook(payload: any) {
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
      status: "PENDING",
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
    return;
  }

  if (transaction.amount !== amount) {
    logger.error("Webhook amount mismatch for wallet top-up", {
      transactionId: transaction.id,
      expectedAmount: transaction.amount,
      receivedAmount: amount,
      orderId,
      paymentId,
    });
    return;
  }

  try {
    await prisma.$transaction(async (tx: any) => {
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
  } catch (error: any) {
    if (error?.code === "P2002") {
      logger.warn("Duplicate payment ID already recorded", {
        paymentId,
        transactionId: transaction.id,
      });
      return;
    }
    throw error;
  }
}
async function handlePayoutWebhook(payload: any) {
  const event = payload?.event;
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
    logger.warn("Withdrawal not found for webhook", { withdrawalId, payoutId });
    return;
  }

  const transaction = await prisma.transaction.findFirst({
    where: { withdrawalId: withdrawal.id },
  });

  if (!transaction) {
    logger.warn("Transaction not found for withdrawal", { withdrawalId });
    return;
  }

  try {
    await prisma.$transaction(async (tx: any) => {
      const freshWithdrawal = await tx.withdrawal.findUnique({
        where: { id: withdrawal.id },
        select: { status: true },
      });

      if (!freshWithdrawal || freshWithdrawal.status === "COMPLETED" || freshWithdrawal.status === "FAILED") {
        logger.info("Withdrawal already processed, ignoring webhook", { withdrawalId, status: freshWithdrawal?.status });
        return;
      }

      if (event === "payout.processed") {
        await tx.withdrawal.update({
          where: { id: withdrawal.id },
          data: { status: "COMPLETED", processedAt: new Date(), razorpayPayoutId: payoutId }
        });
        await tx.transaction.update({
          where: { id: transaction.id },
          data: { status: "COMPLETED" }
        });
        await tx.wallet.update({
          where: { id: withdrawal.walletId },
          data: { totalWithdrawn: { increment: withdrawal.amount } }
        });
      } else {
        // Failed / Rejected / Reversed -> Refund Wallet
        await tx.wallet.update({
          where: { id: withdrawal.walletId },
          data: { balance: { increment: withdrawal.amount } }
        });
        await tx.withdrawal.update({
          where: { id: withdrawal.id },
          data: {
            status: "FAILED",
            failureReason: `Payout failed with event ${event}. Reason: ${payout.failure_reason || "unknown"}`,
            razorpayPayoutId: payoutId
          }
        });
        await tx.transaction.update({
          where: { id: transaction.id },
          data: { status: "FAILED" }
        });
      }
    });
  } catch (error: any) {
    logger.error("Error processing payout webhook in transaction", error, { withdrawalId });
    throw error;
  }
}

export async function POST(request: Request) {
  try {
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
      "";
    const eventType = payload?.event || "unknown";
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

    await handleWalletTopupWebhook(payload);
    await handlePayoutWebhook(payload);
    await markWebhookProcessed(result.eventKey, eventType, payload);

    logger.info("Webhook processed successfully", {
      eventType: payload?.event,
      eventKey: result.eventKey,
    });

    return NextResponse.json({ success: true, message: "Webhook processed" }, { status: 200 });
  } catch (error: any) {
    logger.error("POST /api/payments/webhook error", { error: error.message });

    if (error.message === "Webhook already processed") {
      return NextResponse.json({ success: true, message: "Idempotency caught" }, { status: 200 });
    }

    return NextResponse.json({ success: false, message: "Processing error" }, { status: 500 });
  }
}
