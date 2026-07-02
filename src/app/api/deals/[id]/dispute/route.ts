import { apiWrapper } from "@/lib/api-wrapper";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { invalidate } from "@/lib/cache";
import { routeParamsSchema } from "@/lib/validations";
import { z } from "zod";
import { getDealParticipantRole } from "@/lib/utils";

const paramsSchema = routeParamsSchema;
const disputeSchema = z.object({
  reason: z.string().min(5),
  description: z.string().min(10),
  type: z.enum(["QUALITY", "TIMELINE", "PAYMENT", "CONTENT_DELETED", "TERMS_VIOLATION", "OTHER"]).optional(),
});

async function _handler_POST(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[]>> },
) {
  try {
    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid deal ID" }, { status: 400 });
    }

    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = disputeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { reason, description, type } = parsed.data;
    const dealId = parsedParams.data.id;

    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: { influencer: true, brand: true },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    // Verify Participant
    const { isInfluencer, isBrand } = getDealParticipantRole(deal, session.user.id);

    if (!isInfluencer && !isBrand) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (
      deal.status === "COMPLETED" ||
      deal.status === "CANCELLED" ||
      deal.status === "DISPUTED"
    ) {
      return NextResponse.json(
        { error: "Cannot dispute in current status" },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // ATOMIC LOCK: Lock the deal from creating concurrent disputes
      const lockResult = await tx.deal.updateMany({
        where: {
          id: dealId,
          status: { notIn: ["COMPLETED", "CANCELLED", "DISPUTED"] }
        },
        data: { updatedAt: new Date() }
      });

      if (lockResult.count === 0) {
        throw new Error("Deal status changed concurrently or is already disputed");
      }
      // Create Dispute
      const dispute = await tx.dispute.create({
        data: {
          dealId: dealId,
          raisedByUserId: session.user.id,
          type: type || "OTHER",
          description: `${reason} - ${description}`,
          status: "OPEN",
          dealStatusAtCreation: deal.status,
        },
      });

      // Update Deal Status
      await tx.deal.update({
        where: { id: dealId },
        data: { status: "DISPUTED" },
      });

      return dispute;
    });

    await invalidate(`deal:${dealId}`);
    return NextResponse.json({ success: true, dispute: result });
  } catch (error) {
    logger.error("Dispute creation error", error);
    return NextResponse.json(
      { error: "Failed to raise dispute" },
      { status: 500 },
    );
  }
}


// Wrapped handlers via apiWrapper
export const POST = apiWrapper(_handler_POST);
