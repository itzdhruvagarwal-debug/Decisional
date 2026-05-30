"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { updateTrustAndLevel } from "@/lib/trust-engine";
import { finalizeDealGamification } from "@/lib/gamification-engine";
import { capturePayment, refundPayment } from "@/lib/razorpay";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { requireActiveAdmin } from "@/lib/admin-auth";

async function requireAdmin() {
  const session = await auth();
  await requireActiveAdmin(session?.user);
  return session!;
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
          paymentHold: true,
          influencer: { select: { userId: true } },
          brand: { select: { userId: true } },
        },
      },
    },
  });

  if (!dispute) throw new Error("Dispute not found");

  const gatewayPaymentId = dispute.deal.paymentHold?.razorpayPaymentId;
  const gatewayStatus = dispute.deal.paymentHold?.status;
  const needsGatewayAction =
    Boolean(gatewayPaymentId) &&
    ((decision === "RELEASE_INFLUENCER" && gatewayStatus === "HELD") ||
      (decision === "REFUND_BRAND" && gatewayStatus === "CAPTURED"));

  if (needsGatewayAction) {
    const lock = await prisma.dispute.updateMany({
      where: {
        id: disputeId,
        status: { notIn: ["RESOLVED", "CLOSED", "TIER3_ARBITRATION"] },
      },
      data: {
        status: "TIER3_ARBITRATION",
        tier: 3,
        resolution: `Admin payment action in progress: ${decision}`,
      },
    });

    if (lock.count === 0) {
      throw new Error("Dispute already resolved, closed, or being processed.");
    }

    try {
      if (decision === "REFUND_BRAND") {
        await refundPayment({
          paymentId: gatewayPaymentId!,
          amount: dispute.deal.paymentHold!.amount,
          notes: { reason: "Dispute resolved: Refund Brand" },
        });
      } else {
        await capturePayment({
          paymentId: gatewayPaymentId!,
          amount: dispute.deal.paymentHold!.amount,
        });
      }
    } catch (error) {
      await prisma.dispute.updateMany({
        where: { id: disputeId, status: "TIER3_ARBITRATION" },
        data: {
          status: dispute.status,
          tier: dispute.tier,
          resolution: dispute.resolution,
        },
      });
      logger.critical("Gateway action failed during dispute resolution", error, {
        disputeId,
        decision,
      });
      throw new Error("Payment gateway action failed. Dispute was not resolved.");
    }
  }

  await prisma.$transaction(async (tx: any) => {
    // 1. Update Dispute Status
    const lockCheck = await tx.dispute.updateMany({
      where: { id: disputeId, status: { notIn: ["RESOLVED", "CLOSED"] } },
      data: {
        status: "RESOLVED",
        resolution: reason,
        resolvedByUserId: session.user.id,
        resolvedAt: new Date(),
        brandOutcome:
          decision === "REFUND_BRAND"
            ? JSON.stringify({ action: "REFUND", refund_percentage: 100 })
            : null,
        influencerOutcome:
          decision === "RELEASE_INFLUENCER"
            ? JSON.stringify({ action: "RELEASE", payment_percentage: 100 })
            : null,
      },
    });

    if (lockCheck.count === 0) {
      throw new Error("Dispute already resolved, closed, or concurrent request detected.");
    }

    // 2. Handle Deal & Funds
    if (decision === "REFUND_BRAND") {
      // Cancel Deal
      await tx.deal.update({
        where: { id: dispute.dealId },
        data: { status: "CANCELLED" },
      });

      // Handle Funds (Wallet or Razorpay)
      if (dispute.deal.paymentHold) {
        // Razorpay Hold Deal
        await tx.paymentHold.update({
          where: { id: dispute.deal.paymentHold.id },
          data: { status: "RELEASED", releasedAt: new Date() },
        });
      } else if (dispute.deal.brandId) {
        // Internal Wallet Deal
        const brand = await tx.brandProfile.findUnique({
          where: { id: dispute.deal.brandId },
        });
        if (brand) {
          const brandWallet = await tx.wallet.findUnique({ where: { userId: brand.userId } });

          if (brandWallet) {
            const updateResult = await tx.wallet.updateMany({
              where: { id: brandWallet.id, pendingBalance: { gte: dispute.deal.amount } },
              data: {
                balance: { increment: dispute.deal.amount },
                pendingBalance: { decrement: dispute.deal.amount },
              },
            });

            if (updateResult.count > 0) {
              await tx.transaction.create({
                data: {
                  walletId: brandWallet.id,
                  type: "REFUND",
                  amount: dispute.deal.amount,
                  description: `Refund for disputed deal: ${dispute.deal.campaignId} (Reason: ${reason})`,
                  status: "COMPLETED",
                },
              });
            }
          }
        }
      }
    } else {
      // RELEASE TO INFLUENCER
      // Mark Deal as Completed
      await tx.deal.update({
        where: { id: dispute.dealId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      // Handle Funds (Wallet or Razorpay)
      if (dispute.deal.paymentHold) {
        // Razorpay Hold Deal
        await tx.paymentHold.update({
          where: { id: dispute.deal.paymentHold.id },
          data: { status: "CAPTURED", capturedAt: new Date() },
        });

        // Credit Influencer Wallet
        if (dispute.deal.influencerId) {
          const influencer = await tx.influencerProfile.findUnique({
            where: { id: dispute.deal.influencerId },
          });
          if (influencer) {
            await tx.wallet.upsert({
              where: { userId: influencer.userId },
              create: {
                userId: influencer.userId,
                balance: dispute.deal.amount,
                totalEarned: dispute.deal.amount,
              },
              update: {
                balance: { increment: dispute.deal.amount },
                totalEarned: { increment: dispute.deal.amount },
              },
            });

            const wallet = await tx.wallet.findUnique({ where: { userId: influencer.userId } });
            if (wallet) {
              await tx.transaction.create({
                data: {
                  walletId: wallet.id,
                  dealId: dispute.deal.id,
                  type: "CREDIT",
                  amount: dispute.deal.amount,
                  status: "COMPLETED",
                  description: `Dispute Resolved in Favor: ${dispute.deal.campaignId}`,
                },
              });
            }

            await tx.influencerProfile.update({
              where: { id: influencer.id },
              data: {
                completedDeals: { increment: 1 },
                totalEarnings: { increment: dispute.deal.amount },
              },
            });

            await finalizeDealGamification(influencer.userId, dispute.deal.amount, tx);
          }
        }
      } else {
        // Credit Influencer Wallet (Internal Wallet Deal)
        if (dispute.deal.influencerId) {
          const influencer = await tx.influencerProfile.findUnique({
            where: { id: dispute.deal.influencerId },
          });
          if (influencer) {
            // STRICT DEBT REQUIREMENT: Decrement pendingBalance from brand's wallet first!
            if (dispute.deal.brand?.userId) {
              const debitResult = await tx.wallet.updateMany({
                where: { userId: dispute.deal.brand.userId, pendingBalance: { gte: dispute.deal.amount } },
                data: { pendingBalance: { decrement: dispute.deal.amount } }
              });

              if (debitResult.count === 0) {
                throw new Error("Invalid deal state: Missing pending balance in brand's wallet. Concurrent process detected.");
              }
            }

            await tx.wallet.update({
              where: { userId: influencer.userId },
              data: {
                balance: { increment: dispute.deal.amount },
                totalEarned: { increment: dispute.deal.amount },
                transactions: {
                  create: {
                    type: "CREDIT",
                    amount: dispute.deal.amount,
                    description: `Dispute Resolved in Favor: ${dispute.deal.campaignId}`,
                    status: "COMPLETED",
                  },
                },
              },
            });

            await tx.influencerProfile.update({
              where: { id: influencer.id },
              data: {
                completedDeals: { increment: 1 },
                totalEarnings: { increment: dispute.deal.amount },
              },
            });

            await finalizeDealGamification(influencer.userId, dispute.deal.amount, tx);
          }
        }
      }
    }
  });

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
