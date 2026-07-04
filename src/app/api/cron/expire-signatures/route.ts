import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { apiWrapper } from "@/lib/api-wrapper";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { validateCronSecret } from "../guard";
import { getDealTotalAmount } from "@/lib/utils";
import { AppError } from "@/lib/errors";

async function _handler_POST(_req: NextRequest) {
  await validateCronSecret();

  const now = new Date();
  const BATCH_SIZE = 50;
  const MAX_PROCESS_LIMIT = 200;
  let processedCount = 0;
  const results: Array<{ dealId: string; success: boolean; error?: string }> = [];

  while (processedCount < MAX_PROCESS_LIMIT) {
    const currentTake = Math.min(BATCH_SIZE, MAX_PROCESS_LIMIT - processedCount);
    const expiredDeals = await prisma.deal.findMany({
      where: {
        status: "PENDING_SIGNATURE",
        signDeadline: { lt: now },
      },
      include: {
        brand: { select: { id: true, userId: true, companyName: true } },
        campaign: {
          select: {
            id: true,
            title: true,
            isDirectInvite: true,
            totalBudget: true,
            status: true,
            brandId: true,
          },
        },
        influencer: {
          select: { id: true, userId: true, displayName: true },
        },
      },
      take: currentTake,
    });

    if (expiredDeals.length === 0) {
      break;
    }

    for (const deal of expiredDeals) {
      try {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          await expireSingleDealSignature(tx, deal);
        });

        results.push({
          dealId: deal.id,
          success: true,
        });
      } catch (err: unknown) {
        logger.error("Failed to expire deal signature", err, { dealId: deal.id });
        results.push({
          dealId: deal.id,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    processedCount += expiredDeals.length;
  }

  logger.info("Expire signatures cron run completed", { expiredCount: processedCount });

  return NextResponse.json({
    success: true,
    scanned: processedCount,
    results,
  });
}

export const POST = apiWrapper(_handler_POST);

async function expireSingleDealSignature(tx: Prisma.TransactionClient, deal: any) {
  // Atomic status update guard
  const lockResult = await tx.deal.updateMany({
    where: { id: deal.id, status: "PENDING_SIGNATURE" },
    data: {
      status: "CANCELLED",
      rejectionReason: "Invite signature deadline expired (auto-cancelled)",
    },
  });

  if (lockResult.count === 0) {
    throw AppError.conflict("Deal is no longer in PENDING_SIGNATURE status");
  }

  await tx.application.updateMany({
    where: {
      campaignId: deal.campaignId,
      influencerId: deal.influencerId,
      status: "SELECTED",
    },
    data: {
      status: "WITHDRAWN",
      rejectionReason: "Invite signature deadline expired",
    },
  });

  await tx.campaign.updateMany({
    where: { id: deal.campaignId, selectedInfluencers: { gt: 0 } },
    data: {
      selectedInfluencers: { decrement: 1 },
      reservedAmount: { decrement: deal.amount },
      reservedTotalAmount: { decrement: getDealTotalAmount(deal) },
    },
  });

  if (deal.brand?.userId && deal.reservedFromWallet) {
    const wallet = await tx.wallet.findUnique({
      where: { userId: deal.brand.userId },
      select: { id: true },
    });

    if (wallet && deal.amount > 0) {
      const refundAmount = getDealTotalAmount(deal);
      const isCampaignPoolRefund = !deal.campaign.isDirectInvite;
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          ...(isCampaignPoolRefund
            ? { pendingBalance: { increment: refundAmount } }
            : { balance: { increment: refundAmount } }),
        },
      });

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          dealId: deal.id,
          type: "REFUND",
          amount: refundAmount,
          status: "COMPLETED",
          description: `Refund for expired invite: ${deal.campaign.title}`,
          metadata: {
            balanceImpact: !isCampaignPoolRefund,
            source: isCampaignPoolRefund
              ? "campaign_pool_refund"
              : "direct_invite_refund",
          },
        },
      });
    }
  } else if (deal.campaign.isDirectInvite && deal.brand?.userId) {
    const wallet = await tx.wallet.findUnique({
      where: { userId: deal.brand.userId },
      select: { id: true, pendingBalance: true },
    });

    const refundableAmount = wallet
      ? Math.min(wallet.pendingBalance, getDealTotalAmount(deal))
      : 0;

    if (wallet && refundableAmount > 0) {
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          pendingBalance: { decrement: refundableAmount },
          balance: { increment: refundableAmount },
        },
      });

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          dealId: deal.id,
          type: "REFUND",
          amount: refundableAmount,
          status: "COMPLETED",
          description: `Refund for expired invite: ${deal.campaign.title}`,
        },
      });
    }
  } else if (deal.brand?.userId) {
    // Fallback case: reservedFromWallet = false and !isDirectInvite
    const wallet = await tx.wallet.findUnique({
      where: { userId: deal.brand.userId },
      select: { id: true, pendingBalance: true },
    });

    const refundableAmount = wallet
      ? Math.min(wallet.pendingBalance, getDealTotalAmount(deal))
      : 0;

    if (wallet && refundableAmount > 0) {
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          pendingBalance: { decrement: refundableAmount },
          balance: { increment: refundableAmount },
        },
      });

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          dealId: deal.id,
          type: "REFUND",
          amount: refundableAmount,
          status: "COMPLETED",
          description: `Refund for expired deal signature: ${deal.campaign.title}`,
          metadata: {
            balanceImpact: true,
            source: "non_wallet_pool_refund",
          },
        },
      });
    }
  }

  if (deal.campaign.isDirectInvite) {
    await tx.campaign.update({
      where: { id: deal.campaignId },
      data: { status: "CANCELLED", deletedAt: new Date() },
    });

    if (deal.campaign.brandId && deal.campaign.status === "ACTIVE") {
      await tx.brandProfile.updateMany({
        where: {
          id: deal.campaign.brandId,
          activeCampaigns: { gt: 0 },
        },
        data: {
          activeCampaigns: { decrement: 1 },
        },
      });
    }
  }
}
