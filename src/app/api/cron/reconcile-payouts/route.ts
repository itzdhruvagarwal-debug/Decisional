import { NextRequest, NextResponse } from "next/server";
import { apiWrapper } from "@/lib/api-wrapper";
import { validateCronSecret } from "../guard";
import prisma from "@/lib/db";
import { PaymentService } from "@/services/payment.service";
import { logger } from "@/lib/logger";

async function _handler_POST(_req: NextRequest) {
  await validateCronSecret();

  // Find all deals that are VERIFIED but completedAt is null.
  // NOTE: Late-post-blocked deals are moved to PAYMENT_PENDING (adminFlag=LATE_POST_BLOCKED)
  // by processDealCompletion before throwing, so they are automatically excluded here.
  const verifiedDeals = await prisma.deal.findMany({
    where: {
      status: { in: ["VERIFIED", "CONTENT_APPROVED"] },
      completedAt: null,
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });

  logger.info("Found verified deals needing payout reconciliation", { count: verifiedDeals.length });

  let successCount = 0;
  let failureCount = 0;
  const escalated: string[] = [];

  for (const deal of verifiedDeals) {
    try {
      await PaymentService.processDealCompletion(deal.id);
      successCount++;
      // Reset failures on successful completion
      await prisma.deal.update({
        where: { id: deal.id },
        data: { reconcileFailures: 0 },
      });
    } catch (error: unknown) {
      failureCount++;
      // Increment failures in the DB and check the updated count
      const updatedDeal = await prisma.deal.update({
        where: { id: deal.id },
        data: { reconcileFailures: { increment: 1 } },
        select: { reconcileFailures: true },
      });
      const count = updatedDeal.reconcileFailures;

      if (count >= 3) {
        escalated.push(deal.id);
        logger.critical("RECONCILE_ESCALATION: Deal has failed reconciliation 3+ times — requires manual admin intervention", {
          dealId: deal.id,
          failureCount: count,
          error: error instanceof Error ? error.message : String(error),
        });
      } else {
        logger.error("Failed to reconcile verified deal payout", {
          dealId: deal.id,
          attempt: count,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return NextResponse.json({
    success: true,
    message: "Reconciliation complete",
    totalProcessed: verifiedDeals.length,
    successCount,
    failureCount,
    escalated,
  });
}

export const POST = apiWrapper(_handler_POST);
