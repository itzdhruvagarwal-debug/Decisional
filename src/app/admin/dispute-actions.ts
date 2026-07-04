"use server";

import { AppError } from "@/lib/errors";

import prisma from "@/lib/db";
import { redis } from "@/lib/redis";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { updateTrustAndLevel } from "@/lib/trust-engine";
import { finalizeDealGamification } from "@/lib/gamification-engine";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { requireActiveAdmin } from "@/lib/admin-auth";
import {
  creditInfluencerPayoutWithTax,
  recordPlatformFeeRevenue,
} from "@/lib/deal-settlement";

async function requireAdmin() {
  const session = await auth();
  await requireActiveAdmin(session?.user);
  return session!;
}

async function determineDisputeConfidence(disputeId: string, dispute: any): Promise<string> {
  let confidence = "HIGH";
  try {
    if (dispute.influencerOutcome) {
      const parsed = JSON.parse(dispute.influencerOutcome);
      if (parsed.confidence) confidence = parsed.confidence;
    } else if (dispute.brandOutcome) {
      const parsed = JSON.parse(dispute.brandOutcome);
      if (parsed.confidence) confidence = parsed.confidence;
    } else {
      const { analyzeDispute } = await import("@/lib/dispute-mediator");
      const analysis = await analyzeDispute(disputeId);
      if (analysis?.confidence) {
        confidence = analysis.confidence;
      }
    }
  } catch (err) {
    logger.error("Error determining dispute confidence in resolveDispute", err);
  }
  return confidence;
}

async function handleRefundBrand(tx: Prisma.TransactionClient, dispute: any, reason: string) {
  // Cancel Deal
  await tx.deal.update({
    where: { id: dispute.dealId },
    data: { status: "CANCELLED" },
  });

  // Handle Funds (Internal Wallet Deal)
  if (dispute.deal.brandId) {
    const brand = await tx.brandProfile.findUnique({
      where: { id: dispute.deal.brandId },
    });
    if (brand) {
      const brandWallet = await tx.wallet.findUnique({ where: { userId: brand.userId } });

      if (brandWallet) {
        const refundAmount = dispute.deal.totalAmount || dispute.deal.amount;
        const updateResult = dispute.deal.reservedFromWallet
          ? await tx.wallet.updateMany({
              where: { id: brandWallet.id, pendingBalance: { gte: refundAmount } },
              data: {
                balance: { increment: refundAmount },
                pendingBalance: { decrement: refundAmount },
              },
            })
          : await tx.wallet.updateMany({
              where: { id: brandWallet.id },
              data: { balance: { increment: refundAmount } },
            });

        if (updateResult.count > 0) {
          await tx.transaction.create({
            data: {
              walletId: brandWallet.id,
              type: "REFUND",
              amount: refundAmount,
              description: `Refund for disputed deal: ${dispute.deal.campaignId} (Reason: ${reason})`,
              status: "COMPLETED",
              metadata: {
                balanceImpact: true,
                reservedFromWallet: dispute.deal.reservedFromWallet,
                source: "admin_dispute_refund",
              },
            },
          });
        } else {
          throw AppError.badRequest("Invalid deal state: missing refundable wallet reserve.");
        }
      }
    }
  }

  await tx.campaign.update({
    where: { id: dispute.deal.campaignId },
    data: {
      reservedAmount: { decrement: dispute.deal.amount },
      reservedTotalAmount: { decrement: dispute.deal.totalAmount || dispute.deal.amount },
    },
  });
}

async function handleReleaseInfluencer(tx: Prisma.TransactionClient, dispute: any, payoutAmount: number) {
  // Mark Deal as Completed
  await tx.deal.update({
    where: { id: dispute.dealId },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  if (dispute.deal.brandId) {
    await tx.brandProfile.update({
      where: { id: dispute.deal.brandId },
      data: { totalSpent: { increment: dispute.deal.totalAmount || dispute.deal.amount } },
    });
  }

  let gamificationReferrerId: string | null = null;

  // Credit Influencer Wallet (Internal Wallet Deal)
  if (dispute.deal.influencerId) {
    const influencer = await tx.influencerProfile.findUnique({
      where: { id: dispute.deal.influencerId },
    });
    if (influencer) {
      // STRICT DEBT REQUIREMENT: Decrement pendingBalance from brand's wallet first!
      if (dispute.deal.brand?.userId && dispute.deal.reservedFromWallet) {
        const reserveAmount = dispute.deal.totalAmount || dispute.deal.amount;
        const debitResult = await tx.wallet.updateMany({
          where: { userId: dispute.deal.brand.userId, pendingBalance: { gte: reserveAmount } },
          data: { pendingBalance: { decrement: reserveAmount } }
        });

        if (debitResult.count === 0) {
          throw AppError.badRequest("Invalid deal state: Missing pending balance in brand's wallet. Concurrent process detected.");
        }
      }

      await creditInfluencerPayoutWithTax(
        tx,
        {
          userId: influencer.userId,
          dealId: dispute.deal.id,
          grossPayout: payoutAmount,
          description: `Dispute Resolved in Favor: ${dispute.deal.campaignId}`,
          metadata: {
            balanceImpact: true,
            source: "admin_wallet_dispute_resolution",
          },
        },
      );

      await recordPlatformFeeRevenue(tx, {
        brandUserId: dispute.deal.brand?.userId,
        deal: dispute.deal,
        source: "admin_dispute_resolution",
      });
      const gamificationResult = await finalizeDealGamification(influencer.userId, payoutAmount, tx);
      gamificationReferrerId = gamificationResult?.referrerId ?? null;
    }
  }

  return { gamificationReferrerId };
}

export async function resolveDispute(
  disputeId: string,
  decision: "REFUND_BRAND" | "RELEASE_INFLUENCER",
  reason: string,
) {
  const session = await requireAdmin();

  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      deal: {
        include: {
          influencer: { select: { userId: true } },
          brand: { select: { userId: true } },
        },
      },
    },
  });

  if (!dispute) throw AppError.notFound("Dispute not found");
  if (dispute.deal.status === "COMPLETED" && decision === "RELEASE_INFLUENCER") {
    throw AppError.badRequest("Cannot release payout for an already completed deal.");
  }

  const confidence = await determineDisputeConfidence(disputeId, dispute);

  let gamificationReferrerId: string | null = null;
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const payoutAmount = dispute.deal.influencerPayout ?? dispute.deal.amount;
    // 1. Update Dispute Status
    const lockCheck = await tx.dispute.updateMany({
      where: {
        id: disputeId,
        status: { notIn: ["RESOLVED", "CLOSED"] },
      },
      data: {
        status: "RESOLVED",
        resolution: reason,
        resolvedByUserId: session.user.id,
        resolvedAt: new Date(),
        brandOutcome:
          decision === "REFUND_BRAND"
            ? JSON.stringify({ action: "REFUND", refund_percentage: 100, confidence })
            : null,
        influencerOutcome:
          decision === "RELEASE_INFLUENCER"
            ? JSON.stringify({ action: "RELEASE", payment_percentage: 100, confidence })
            : null,
      },
    });

    if (lockCheck.count === 0) {
      throw AppError.badRequest("Dispute already resolved, closed, or concurrent request detected.");
    }

    // 2. Handle Deal & Funds
    if (decision === "REFUND_BRAND") {
      await handleRefundBrand(tx, dispute, reason);
    } else {
      const res = await handleReleaseInfluencer(tx, dispute, payoutAmount);
      gamificationReferrerId = res.gamificationReferrerId;
    }
  });

  if (gamificationReferrerId) {
    try {
      await redis.del(`platform_fee:effective:${gamificationReferrerId}`);
    } catch (err) {
      logger.warn("Failed to invalidate platform fee cache after resolveDispute", { error: err });
    }
  }

  revalidatePath("/admin/disputes");

  // Recalculate trust scores for both parties
  if (dispute.deal.influencerId) {
    const influencer = await prisma.influencerProfile.findUnique({
      where: { id: dispute.deal.influencerId },
      select: { userId: true },
    });
    if (influencer) {
      await updateTrustAndLevel(influencer.userId, "DISPUTE_RESOLVED");
    }
  }
  if (dispute.deal.brandId) {
    const brand = await prisma.brandProfile.findUnique({
      where: { id: dispute.deal.brandId },
      select: { userId: true },
    });
    if (brand) {
      await updateTrustAndLevel(brand.userId, "DISPUTE_RESOLVED");
    }
  }
}
