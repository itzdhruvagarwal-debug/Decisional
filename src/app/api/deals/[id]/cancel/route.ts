import { apiWrapper } from "@/lib/api-wrapper";
import { NextRequest, NextResponse  } from "next/server";
import { auth } from "@/lib/auth";
import prisma, { ensurePlatformTreasury } from "@/lib/db";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { calculateCancellation } from "@/lib/contract-engine";
import { creditInfluencerPayoutWithTax } from "@/lib/deal-settlement";
import { Prisma } from "@prisma/client";
import { getDealTotalAmount } from "@/lib/utils";
import { createActivityLog } from "@/lib/audit";

async function _handler_POST(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[]>> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const limit = await checkRateLimit(session.user.id, "DEAL_UPDATES");
    if (!limit.success) {
      return NextResponse.json({ success: false, message: "Too many requests" }, { status: 429 });
    }

    const resolvedParams = await context.params;
    const dealId = String(resolvedParams.id ?? '');

    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        influencer: true,
        brand: true,
      },
    });

    if (!deal) {
      return NextResponse.json({ success: false, message: "Deal not found" }, { status: 404 });
    }

    // Only the brand owner who created the deal can cancel it
    if (deal.brand?.userId !== session.user.id) {
      return NextResponse.json({ success: false, message: "Forbidden. Only the brand can cancel this deal." }, { status: 403 });
    }

    // Verify deal is in a cancelable state
    if (["COMPLETED", "CANCELLED", "DISPUTED"].includes(deal.status)) {
      return NextResponse.json({ success: false, message: `Deal cannot be cancelled in status ${deal.status}` }, { status: 400 });
    }

    const cancelSummary = await calculateCancellation(dealId);
    const { refundAmount, payoutAmount, platformFeeKept, reason } = cancelSummary;

    // DB updates in transaction
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Use updateMany with status guard to prevent TOCTOU: a concurrent
        // dispute/completion between the outer check and this tx would otherwise
        // silently overwrite DISPUTED/COMPLETED deals to CANCELLED.
        const cancelResult = await tx.deal.updateMany({
          where: {
            id: dealId,
            status: { notIn: ["COMPLETED", "CANCELLED", "DISPUTED"] },
          },
          data: {
            status: "CANCELLED",
            deletedAt: new Date(),
          },
        });
        if (cancelResult.count === 0) {
          throw new Error("Deal is no longer in a cancellable state (concurrent modification).");
        }

        // Decrement campaign reserved amount
        await tx.campaign.update({
          where: { id: deal.campaignId },
          data: {
            reservedAmount: { decrement: deal.amount },
            reservedTotalAmount: { decrement: getDealTotalAmount(deal) },
          },
        });

        // Wallet-funded deal
        if (payoutAmount > 0) {
          const grossPayout = payoutAmount - platformFeeKept;
          if (grossPayout > 0) {
            // Credit influencer payout
            await creditInfluencerPayoutWithTax(tx, {
              userId: deal.influencer.userId,
              dealId: deal.id,
              grossPayout,
              description: `Cancellation payout: ${reason}`,
              metadata: {
                source: "wallet_cancellation_payout",
              },
            });
          } else {
            logger.warn("Cancellation payout resulted in zero or negative gross payout for influencer", {
              dealId: deal.id,
              influencerId: deal.influencer.userId,
              payoutAmount,
              platformFeeKept,
              grossPayout,
            });
          }

          if (platformFeeKept > 0) {
            if (deal.brand?.userId) {
              const brandWallet = await tx.wallet.upsert({
                where: { userId: deal.brand.userId },
                create: { userId: deal.brand.userId, balance: 0, pendingBalance: 0 },
                update: {},
              });

              await tx.transaction.create({
                data: {
                  walletId: brandWallet.id,
                  dealId: deal.id,
                  type: "PLATFORM_FEE",
                  amount: platformFeeKept,
                  status: "COMPLETED",
                  description: `Platform cancellation fee for deal: ${deal.id}`,
                  metadata: {
                    balanceImpact: false,
                    source: "wallet_cancellation_fee",
                    grossDealAmount: deal.amount,
                    payoutAmount,
                    platformFeeKept,
                  },
                },
              });
            }

            // Credit the PLATFORM_TREASURY wallet
            await ensurePlatformTreasury(tx);
            const treasuryWallet = await tx.wallet.update({
              where: { userId: "PLATFORM_TREASURY" },
              data: { balance: { increment: platformFeeKept } },
            });

            await tx.transaction.create({
              data: {
                walletId: treasuryWallet.id,
                dealId: deal.id,
                type: "CREDIT",
                amount: platformFeeKept,
                status: "COMPLETED",
                description: `Platform fee income from cancellation credited to treasury for deal: ${deal.id}`,
                metadata: {
                  source: "wallet_cancellation_fee",
                  brandUserId: deal.brand?.userId,
                },
              },
            });
          }
        }

        if (deal.brand?.userId) {
          let brandWallet = await tx.wallet.findUnique({
            where: { userId: deal.brand.userId },
          });

          if (!brandWallet) {
            brandWallet = await tx.wallet.create({
              data: {
                userId: deal.brand.userId,
                balance: deal.reservedFromWallet ? refundAmount : 0,
                pendingBalance: 0,
              },
            });
          } else {
            const updateData = deal.reservedFromWallet
              ? {
                  balance: { increment: refundAmount },
                  pendingBalance: { decrement: deal.totalAmount ?? deal.amount },
                }
              : {
                  pendingBalance: { decrement: deal.totalAmount ?? deal.amount },
                };

            brandWallet = await tx.wallet.update({
              where: { id: brandWallet.id },
              data: updateData,
            });
          }

          if (refundAmount > 0) {
            await tx.transaction.create({
              data: {
                walletId: brandWallet.id,
                dealId: deal.id,
                type: "REFUND",
                amount: refundAmount,
                status: "COMPLETED",
                description: `Cancellation refund: ${reason}`,
                metadata: {
                  balanceImpact: deal.reservedFromWallet,
                  source: "wallet_cancellation_refund",
                },
              },
            });
          }
        }

        await createActivityLog({
          userId: session.user.id,
          action: "CANCEL_DEAL",
          entityType: "Deal",
          entityId: dealId,
          metadata: {
            payoutAmount,
            refundAmount,
            platformFeeKept,
            reason,
          },
        }, tx);
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });

      return NextResponse.json({ success: true, message: `Deal cancelled successfully. Payout: ${payoutAmount}, Refund: ${refundAmount}` });
    } catch (txError) {
      logger.error("Database transaction failed during cancellation", txError);
      return NextResponse.json({ success: false, message: "Database transaction failed during cancellation" }, { status: 500 });
    }
  } catch (error: unknown) {
    logger.error("POST /api/deals/[id]/cancel error", { error: (error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error)) });
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}


// Wrapped handlers via apiWrapper
export const POST = apiWrapper(_handler_POST);
