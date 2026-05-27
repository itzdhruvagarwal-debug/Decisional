import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { PaymentService } from "@/services/payment.service";
import { logger } from "@/lib/logger";

const captureSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const parsed = captureSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Invalid payment payload", data: parsed.error.format() },
        { status: 400 }
      );
    }

    // confirmPaymentHold verifies signature + ownership and marks hold as HELD.
    await PaymentService.confirmPaymentHold(
      session.user.id,
      parsed.data.razorpay_order_id,
      parsed.data.razorpay_payment_id,
      parsed.data.razorpay_signature,
    );

    return NextResponse.json(
      { success: true, message: "Payment captured successfully." },
      { status: 200 }
    );
  } catch (error: any) {
    logger.error("POST /api/payments/capture error", { error: error.message });

    if (error.message?.includes("Invalid signature") || error.message?.includes("does not exist")) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { success: false, message: "Failed to capture payment" },
      { status: 500 }
    );
  }
}
