import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { apiWrapper } from "@/lib/api-wrapper";
import { PaymentService } from "@/services/payment.service";
import { logger } from "@/lib/logger";

export const POST = apiWrapper(async (req) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { dealId } = await req.json();
  if (!dealId) {
    return NextResponse.json({ error: "Deal ID is required" }, { status: 400 });
  }

  const result = await PaymentService.createPaymentHold(
    session.user.id,
    dealId,
  );

  if (result.exists) {
    logger.info("Returning existing payment hold", {
      dealId,
      orderId: result.orderId,
    });
    return NextResponse.json(
      {
        success: true,
        exists: true,
        orderId: result.orderId,
        amount: result.amount,
        currency: "INR", // Default or fetch from result
        key: process.env.RAZORPAY_KEY_ID,
        // breakdown: result.breakdown, // Existing hold might not return breakdown if not stored/fetched
        // paymentHoldId: result.paymentHoldId,
        // expiresAt: result.expiresAt,
        message: "Resuming existing payment session",
      },
      { status: 200 },
    );
  }

  return NextResponse.json({
    success: true,
    orderId: result.orderId,
    amount: result.amount,
    currency: result.currency,
    key: process.env.RAZORPAY_KEY_ID,
    breakdown: result.breakdown,
    paymentHoldId: result.paymentHoldId,
    expiresAt: result.expiresAt,
  });
});

export const PUT = apiWrapper(async (req) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId, paymentId, signature } = await req.json();

  if (!orderId || !paymentId || !signature) {
    return NextResponse.json(
      { error: "Missing payment details" },
      { status: 400 },
    );
  }

  await PaymentService.confirmPaymentHold(
    session.user.id,
    orderId,
    paymentId,
    signature,
  );

  return NextResponse.json({
    success: true,
    message: "Payment authorized and held. Deal is now active!",
    status: "HELD",
  });
});
