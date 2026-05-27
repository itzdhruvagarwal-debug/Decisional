import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { PaymentService } from "@/services/payment.service";
import { logger } from "@/lib/logger";

const addFundsSchema = z.object({
  amount: z.preprocess(
    (value) => Number(value),
    z
      .number()
      .int()
      .min(100, "Minimum top-up is INR 100")
      .max(500000, "Maximum top-up per request is INR 5,00,000"),
  ),
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
    const parsed = addFundsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid payload",
          data: parsed.error.format(),
        },
        { status: 400 },
      );
    }

    const amountInPaise = parsed.data.amount * 100;
    const orderData = await PaymentService.createWalletTopUpOrder(
      session.user.id,
      amountInPaise,
    );

    return NextResponse.json(
      {
        success: true,
        message: "Payment intent created",
        orderId: orderData.orderId,
        amount: orderData.amount,
        currency: orderData.currency,
        key: orderData.key,
      },
      { status: 200 },
    );
  } catch (error: any) {
    logger.error("POST /api/wallet/add-funds error", { error: error.message });
    return NextResponse.json(
      { success: false, message: "Failed to initiate payment." },
      { status: 500 },
    );
  }
}
