import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { dbIdSchema, productFulfillmentSchema } from "@/lib/validations";
import { DealService } from "@/services/deal.service";
import { logger } from "@/lib/logger";

const paramsSchema = z.object({ id: dbIdSchema });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid deal ID" }, { status: 400 });
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsedBody = productFulfillmentSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsedBody.error.flatten() },
        { status: 400 },
      );
    }

    const dealId = parsedParams.data.id;
    const userId = session.user.id;
    const payload = parsedBody.data;

    const deal =
      payload.action === "submit_address"
        ? await DealService.submitShippingAddress(userId, dealId, payload.address)
        : payload.action === "confirm_dispatch"
          ? await DealService.confirmProductDispatch(userId, dealId, {
              trackingNumber: payload.trackingNumber,
              ...(payload.carrier ? { carrier: payload.carrier } : {}),
            })
          : await DealService.confirmProductReceived(userId, dealId);

    return NextResponse.json({ success: true, deal });
  } catch (error) {
    logger.error("Product fulfillment update failed", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to update product fulfillment";
    const status = message.includes("Unauthorized")
      ? 403
      : message.includes("required") ||
          message.includes("valid") ||
          message.includes("dispatch") ||
          message.includes("received")
        ? 400
        : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
