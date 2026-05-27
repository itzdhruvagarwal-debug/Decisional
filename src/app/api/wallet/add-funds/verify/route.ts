import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { apiWrapper } from "@/lib/api-wrapper";
import { getOrder, getPayment, verifyPaymentSignature } from "@/lib/razorpay";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";

export const POST = apiWrapper(async (req) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = body;

  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
    return NextResponse.json(
      { error: "Invalid payment details" },
      { status: 400 },
    );
  }

  const start = Date.now();

  // 1. Verify Signature
  const isValid = verifyPaymentSignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });

  if (!isValid) {
    logger.error("Invalid payment signature", {
      userId: session.user.id,
      orderId: razorpay_order_id,
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // 2. Find pending transaction
  const transaction = await prisma.transaction.findFirst({
    where: {
      wallet: { userId: session.user.id },
      razorpayOrderId: razorpay_order_id,
      status: "PENDING",
    },
  });

  if (!transaction) {
    // Idempotent success for retrying the same verify request.
    const existingCompleted = await prisma.transaction.findFirst({
      where: {
        wallet: { userId: session.user.id },
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        status: "COMPLETED",
      },
      select: { id: true },
    });

    if (existingCompleted) {
      return NextResponse.json({ success: true, alreadyProcessed: true });
    }

    logger.error("Pending transaction not found during verification", {
      orderId: razorpay_order_id,
    });
    return NextResponse.json(
      { error: "Transaction record not found" },
      { status: 404 },
    );
  }

  // 3. Verify payment against Razorpay API to prevent client-side tampering.
  let order: any;
  let payment: any;
  try {
    [order, payment] = await Promise.all([
      getOrder(razorpay_order_id),
      getPayment(razorpay_payment_id),
    ]);
  } catch (error: any) {
    logger.error("Razorpay verification lookup failed", {
      error: error.message,
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
    });
    return NextResponse.json(
      { error: "Unable to verify payment with gateway" },
      { status: 400 },
    );
  }

  if (payment?.order_id !== razorpay_order_id) {
    logger.warn("Payment order mismatch during wallet top-up verify", {
      userId: session.user.id,
      expectedOrderId: razorpay_order_id,
      actualOrderId: payment?.order_id,
      paymentId: razorpay_payment_id,
    });
    return NextResponse.json({ error: "Payment/order mismatch" }, { status: 400 });
  }

  if (!["authorized", "captured"].includes(payment?.status)) {
    return NextResponse.json(
      { error: "Payment is not completed yet" },
      { status: 400 },
    );
  }

  if (order?.amount !== transaction.amount || payment?.amount !== transaction.amount) {
    logger.error("Top-up amount mismatch detected", {
      userId: session.user.id,
      transactionAmount: transaction.amount,
      orderAmount: order?.amount,
      paymentAmount: payment?.amount,
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
    });
    return NextResponse.json({ error: "Amount mismatch detected" }, { status: 400 });
  }

  // 4. Update wallet and transaction atomically.
  await prisma.$transaction(async (tx: any) => {
    // Mark transaction as COMPLETED atomically
    const updateResult = await tx.transaction.updateMany({
      where: { id: transaction.id, status: "PENDING" },
      data: {
        status: "COMPLETED",
        razorpayPaymentId: razorpay_payment_id,
      },
    });

    if (updateResult.count === 0) {
      return; // Already processed
    }

    // Credit Wallet Balance
    await tx.wallet.update({
      where: { id: transaction.walletId },
      data: {
        balance: { increment: transaction.amount },
        totalDeposited: { increment: transaction.amount },
      },
    });
  });

  const duration = Date.now() - start;
  logger.info("Payment verified and wallet credited", {
    userId: session.user.id,
    amount: transaction.amount,
    duration,
  });

  return NextResponse.json({ success: true });
});
