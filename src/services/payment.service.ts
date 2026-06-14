import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import {
  createPreAuthOrder,
  createOrder,
  calculateTotalAmount,
  verifyPaymentSignature,
  createPayout,
  capturePayment,
  getPayment,
} from "@/lib/razorpay";
import { encrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { resolveBrandPlatformFee } from "@/lib/platform-fees";
import { processReferralReward } from "@/lib/referral-engine";
import { addUserXp, checkAndAwardBadges } from "@/lib/gamification-engine";
import { updateTrustAndLevel } from "@/lib/trust-engine";
import { checkPaymentFraud } from "@/lib/fraud-detection";

export class PaymentService {
  static async createWalletTopUpOrder(userId: string, amountInPaise: number) {
    if (!Number.isInteger(amountInPaise) || amountInPaise <= 0) {
      throw new Error("Invalid top-up amount");
    }

    const wallet = await prisma.wallet.upsert({
      where: { userId },
      create: { userId, balance: 0, pendingBalance: 0 },
      update: {},
    });

    const receipt = `wallet_${userId}_${Date.now()}`;
    const order = await createOrder({
      amount: amountInPaise,
      currency: "INR",
      receipt,
      notes: {
        type: "wallet_topup",
        user_id: userId,
      },
    });

    await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        type: "CREDIT",
        amount: amountInPaise,
        status: "PENDING",
        description: "Wallet top-up via Razorpay order",
        razorpayOrderId: order.orderId,
      },
    });

    return {
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
    };
  }

  // ==================== PRE-AUTH (Payment Holds) ====================

  static async createPaymentHold(userId: string, dealId: string) {
    if (!dealId) throw new Error("Deal ID is required");

    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        brand: { select: { userId: true } },
        paymentHold: true,
      },
    });

    if (!deal) throw new Error("Deal not found");
    const ownerId = deal.brand?.userId;
    if (ownerId !== userId) throw new Error("Unauthorized");

    if (deal.paymentHold && ["HELD", "PENDING"].includes(deal.paymentHold.status)) {
      return {
        exists: true,
        orderId: deal.paymentHold.razorpayOrderId,
        amount: deal.paymentHold.amount,
        currency: "INR",
      };
    }

    const hasLockedPaymentSnapshot =
      deal.totalAmount > 0 && deal.platformFee > 0 && deal.gatewayFee >= 0;
    const feeSnapshot = hasLockedPaymentSnapshot
      ? null
      : await resolveBrandPlatformFee(userId);
    const amounts = hasLockedPaymentSnapshot
      ? {
          dealAmount: deal.amount,
          platformFee: deal.platformFee,
          gatewayFee: deal.gatewayFee,
          totalAmount: deal.totalAmount,
          influencerReceives: deal.amount,
          platformFeePercent:
            deal.amount > 0
              ? Number(((deal.platformFee / deal.amount) * 100).toFixed(2))
              : 0,
        }
      : calculateTotalAmount(
          deal.amount,
          feeSnapshot?.effectivePlatformFee,
        );

    const order = await createPreAuthOrder({
      dealId: deal.id,
      amount: amounts.totalAmount,
      notes: {
        deal_amount: amounts.dealAmount.toString(),
        platform_fee: amounts.platformFee.toString(),
        gateway_fee: amounts.gatewayFee.toString(),
        platform_fee_percent: amounts.platformFeePercent.toString(),
        ...(feeSnapshot
          ? {
              level_discount: `Level ${feeSnapshot.userLevel} -> ${feeSnapshot.levelBasedFee}%`,
              referral_discount: `${feeSnapshot.referralTier} -> ${feeSnapshot.referralFee}%`,
            }
          : { fee_snapshot: "locked_on_deal" }),
      },
    });

    try {
      const paymentHold = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const hold = await tx.paymentHold.create({
          data: {
            dealId: deal.id,
            razorpayOrderId: order.orderId,
            amount: amounts.totalAmount,
            status: "PENDING",
            expiresAt: new Date(Date.now() + 4.5 * 24 * 60 * 60 * 1000),
          },
        });

        await tx.deal.update({
          where: { id: dealId },
          data: {
            status: "PAYMENT_PENDING",
            platformFee: amounts.platformFee,
            gatewayFee: amounts.gatewayFee,
            totalAmount: amounts.totalAmount,
          },
        });

        return hold;
      });

      return {
        exists: false,
        orderId: order.orderId,
        amount: order.amount,
        currency: order.currency,
        breakdown: amounts,
        paymentHoldId: paymentHold.id,
        expiresAt: paymentHold.expiresAt,
      };
    } catch (error: any) {
      if (error.code === "P2002") {
        const existingHold = await prisma.paymentHold.findUnique({ where: { dealId: deal.id } });
        if (existingHold)
          return {
            exists: true,
            orderId: existingHold.razorpayOrderId,
            amount: existingHold.amount,
            currency: "INR",
          };
      }
      throw error;
    }
  }

  static async confirmPaymentHold(userId: string, orderId: string, paymentId: string, signature: string) {
    const paymentHold = await prisma.paymentHold.findUnique({
      where: { razorpayOrderId: orderId },
      include: { deal: { include: { brand: true } } },
    });
    if (!paymentHold) throw new Error("Payment hold not found");
    if (paymentHold.deal.brand?.userId !== userId) throw new Error("Unauthorized");

    const isValid = verifyPaymentSignature({ orderId, paymentId, signature });
    if (!isValid) throw new Error("Invalid payment signature");

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // ATOMIC UPDATE GUARD
      const updateResult = await tx.paymentHold.updateMany({
        where: { id: paymentHold.id, status: "PENDING" },
        data: {
          status: "HELD",
          razorpayPaymentId: paymentId,
          capturedAt: new Date(),
        },
      });

      if (updateResult.count === 0) throw new Error("Payment already processed");

      await tx.deal.update({
        where: { id: paymentHold.dealId },
        data: { status: "PAYMENT_HELD" },
      });

      const wallet = await tx.wallet.upsert({
        where: { userId },
        create: { userId, balance: 0, pendingBalance: 0 },
        update: {},
      });

      // IMMUTABLE LEDGER
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          dealId: paymentHold.dealId,
          type: "DEBIT",
          amount: paymentHold.amount,
          status: "COMPLETED",
          description: "Payment held for deal (Escrow)",
          razorpayPaymentId: paymentId,
        },
      });
    });

    return { success: true };
  }

  /**
   * TWO-PHASE COMPLETION PATTERN
   * Phase 1: DB Lock & Validate (Atomic)
   * Phase 2: External Call (Side-effect)
   */
  static async processDealCompletion(dealId: string) {
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: { paymentHold: true, influencer: true, brand: true },
    });

    if (
      !deal ||
      ["COMPLETED", "CANCELLED", "DISPUTED", "PENDING_SIGNATURE", "PAYMENT_PENDING"].includes(
        deal.status,
      )
    ) {
      return;
    }
    const brandUserId = deal.brand?.userId;
    if (!brandUserId) {
      logger.critical("PAYOUT_FAILED: Missing brand owner", { dealId });
      return;
    }

    const hasGatewayHold =
      deal.paymentHold?.status === "HELD" && Boolean(deal.paymentHold.razorpayPaymentId);
    const canSettleFromWallet = !deal.paymentHold;

    if (deal.paymentHold && !hasGatewayHold && !canSettleFromWallet) {
      logger.warn("Deal completion skipped for ineligible payment hold", {
        dealId,
        holdStatus: deal.paymentHold.status,
      });
      return;
    }

    try {
      if (hasGatewayHold) {
        // IDEMPOTENCY GUARD: Check if payment is already captured before attempting.
        // This prevents double-capture on retry when a previous attempt succeeded at
        // Razorpay but the subsequent DB transaction failed.
        const existingPayment = await getPayment(deal.paymentHold!.razorpayPaymentId!);
        if (existingPayment.status !== "captured") {
          await capturePayment({
            paymentId: deal.paymentHold!.razorpayPaymentId!,
            amount: deal.paymentHold!.amount,
          });
        } else {
          logger.info("Payment already captured, skipping re-capture", {
            dealId,
            paymentId: deal.paymentHold!.razorpayPaymentId,
          });
        }
      }

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const brandWallet = await tx.wallet.findUnique({
          where: { userId: brandUserId },
          select: { id: true, pendingBalance: true },
        });

        if (
          !hasGatewayHold &&
          !deal.reservedFromWallet &&
          (!brandWallet || brandWallet.pendingBalance < (deal.totalAmount || deal.amount))
        ) {
          throw new Error("NO_RESERVED_CAMPAIGN_FUNDS");
        }

        if (hasGatewayHold && deal.paymentHold) {
          const holdUpdate = await tx.paymentHold.updateMany({
            where: { id: deal.paymentHold.id, status: "HELD" },
            data: { status: "CAPTURED", capturedAt: new Date() },
          });

          if (holdUpdate.count === 0) {
            return;
          }
        }

        const dealUpdate = await tx.deal.updateMany({
          where: { id: deal.id, status: { not: "COMPLETED" } },
          data: { status: "COMPLETED", completedAt: new Date() },
        });

        if (dealUpdate.count === 0) return;

        if (brandWallet) {
          const pendingRelease = deal.reservedFromWallet
            ? 0
            : Math.min(brandWallet.pendingBalance, deal.totalAmount || deal.amount);
          await tx.wallet.update({
            where: { id: brandWallet.id },
            data: {
              ...(pendingRelease > 0
                ? { pendingBalance: { decrement: pendingRelease } }
                : {}),
              totalSpent: { increment: deal.totalAmount || deal.amount },
            },
          });
        }

        if (deal.brandId) {
          await tx.brandProfile.update({
            where: { id: deal.brandId },
            data: { totalSpent: { increment: deal.totalAmount || deal.amount } },
          });
        }

        const influencerPayout = deal.influencerPayout ?? deal.amount;
        // TDS Deduction — Section 194-O (1% on earnings >= ₹5,00,000)
        const TDS_THRESHOLD = 500000; // ₹5 Lakh
        const TDS_RATE = 0.01; // 1%
        const influencerProfile = await tx.influencerProfile.findUnique({
          where: { userId: deal.influencer.userId },
          select: { totalEarnings: true },
        });
        const cumulativeEarnings = (influencerProfile?.totalEarnings || 0) + influencerPayout;
        const tdsAmount = cumulativeEarnings >= TDS_THRESHOLD ? Math.round(influencerPayout * TDS_RATE) : 0;
        const netPayout = influencerPayout - tdsAmount;

        const wallet = await tx.wallet.upsert({
          where: { userId: deal.influencer.userId },
          create: {
            userId: deal.influencer.userId,
            balance: netPayout,
            totalEarned: netPayout,
          },
          update: {
            balance: { increment: netPayout },
            totalEarned: { increment: netPayout },
          },
        });

        await tx.transaction.create({
          data: {
            walletId: wallet.id,
            dealId: deal.id,
            type: "CREDIT",
            amount: netPayout,
            status: "COMPLETED",
            description: `Payout for deal: ${deal.id}`,
          },
        });

        if (tdsAmount > 0) {
          await tx.transaction.create({
            data: {
              walletId: wallet.id,
              dealId: deal.id,
              type: "DEBIT",
              amount: tdsAmount,
              status: "COMPLETED",
              description: `TDS deduction (Section 194-O, 1%) for deal: ${deal.id}`,
            },
          });
        }

        // 1. Increment completedDeals and totalEarnings in influencerProfile
        await tx.influencerProfile.update({
          where: { userId: deal.influencer.userId },
          data: {
            completedDeals: { increment: 1 },
            totalEarnings: { increment: influencerPayout },
          },
        });

        // 2. Add User XP
        await addUserXp(deal.influencer.userId, 100, "DEAL_VERIFIED", tx);

        // 3. Process Referral Reward
        try {
          await processReferralReward(deal.influencer.userId, deal.amount, tx);
        } catch (err) {
          logger.warn("Referral reward failed", { error: err, userId: deal.influencer.userId });
        }

        // 4. Check and award badges
        await checkAndAwardBadges(deal.influencer.userId, "DEAL_COMPLETED", tx);
      });

      // 5. Recalculate Trust outside the transaction after successful commit
      await updateTrustAndLevel(deal.influencer.userId, "DEAL_VERIFIED");
    } catch (error) {
      if (hasGatewayHold && deal.paymentHold) {
        await prisma.deal.updateMany({
          where: { id: dealId, status: { not: "COMPLETED" } },
          data: { status: "PAYMENT_HELD" },
        });
      } else if (error instanceof Error && error.message === "NO_RESERVED_CAMPAIGN_FUNDS") {
        await prisma.deal.updateMany({
          where: { id: dealId, status: { not: "COMPLETED" } },
          data: { status: "PAYMENT_PENDING" },
        });
      }

      logger.critical("CAPTURE_FAILED: Manual intervention required", {
        dealId,
        paymentId: deal.paymentHold?.razorpayPaymentId,
        error,
      });
    }
  }

  static async initiateWithdrawal(userId: string, data: { amount: number; bankAccountName: string; bankAccountNumber: string; ifscCode: string; upiId?: string }, idempotencyKey: string) {
    const fraudCheck = await checkPaymentFraud({
      userId,
      amount: data.amount,
      bankAccount: data.bankAccountNumber,
      upiId: data.upiId,
    });

    if (fraudCheck.action === "BLOCK") {
      logger.warn("Withdrawal blocked by fraud check", {
        userId,
        amount: data.amount,
        flags: fraudCheck.flags.map((f) => f.description).join(", "),
      });
      throw new Error("Withdrawal blocked by fraud detection system. Please contact support.");
    }

    const withdrawal = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.transaction.findUnique({
        where: { razorpayPaymentId: idempotencyKey },
        include: { wallet: { select: { userId: true } } },
      });
      if (existing) {
        if (existing.wallet.userId !== userId) {
          logger.warn("Withdrawal idempotency owner mismatch", {
            userId,
            transactionId: existing.id,
          });
          throw new Error("IDEMPOTENCY_KEY_OWNER_MISMATCH");
        }

        if (existing.status === "FAILED") {
          // Free up the unique constraint slot while preserving the failed transaction audit trail
          await tx.transaction.update({
            where: { id: existing.id },
            data: { razorpayPaymentId: `failed:${existing.id}:${idempotencyKey}` },
          });
        } else {
          return { alreadyProcessed: true };
        }
      }

      const updateResult = await tx.wallet.updateMany({
        where: { userId, balance: { gte: data.amount }, isFrozen: false },
        data: { balance: { decrement: data.amount } }
      });

      if (updateResult.count === 0) throw new Error("INSUFFICIENT_FUNDS_OR_FROZEN");

      const wallet = await tx.wallet.findUnique({ where: { userId } });
      const encryptedAcc = encrypt(data.bankAccountNumber);

      const w = await tx.withdrawal.create({
        data: {
          walletId: wallet!.id,
          amount: data.amount,
          bankAccountName: data.bankAccountName,
          bankAccountNumber: encryptedAcc,
          ifscCode: data.ifscCode,
          upiId: data.upiId ? encrypt(data.upiId) : null,
          status: fraudCheck.action === "REVIEW" ? "PENDING_REVIEW" : "PROCESSING",
          isManualReview: fraudCheck.action === "REVIEW",
          riskScore: fraudCheck.riskScore,
        }
      });

      const t = await tx.transaction.create({
        data: {
          walletId: wallet!.id,
          withdrawalId: w.id,
          type: "WITHDRAWAL",
          amount: data.amount,
          status: "PENDING",
          description: `Withdrawal Ref: ${w.id}`,
          razorpayPaymentId: idempotencyKey,
        }
      });

      return { w, t };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    if ("alreadyProcessed" in withdrawal) {
      return { success: true, alreadyProcessed: true };
    }

    if (withdrawal.w.status === "PENDING_REVIEW") {
      return { success: true, status: "PENDING_REVIEW" };
    }

    try {
      const payout = await createPayout({
        accountNumber: data.bankAccountNumber,
        ifscCode: data.ifscCode,
        beneficiaryName: data.bankAccountName,
        amount: data.amount,
        referenceId: withdrawal.w.id,
      });

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        if (payout.status === "processed") {
          await tx.withdrawal.update({
            where: { id: withdrawal.w.id },
            data: { status: "COMPLETED", processedAt: new Date(), razorpayPayoutId: payout.payoutId }
          });
          await tx.transaction.update({
            where: { id: withdrawal.t.id },
            data: { status: "COMPLETED" }
          });
          await tx.wallet.update({
            where: { userId },
            data: { totalWithdrawn: { increment: data.amount } }
          });
        } else if (["rejected", "failed", "reversed"].includes(payout.status)) {
          await tx.wallet.update({
            where: { userId },
            data: { balance: { increment: data.amount } }
          });
          await tx.withdrawal.update({
            where: { id: withdrawal.w.id },
            data: { status: "FAILED", failureReason: `Payout rejected/failed immediately with status ${payout.status}`, razorpayPayoutId: payout.payoutId }
          });
          await tx.transaction.update({
            where: { id: withdrawal.t.id },
            data: { status: "FAILED" }
          });
        } else {
          await tx.withdrawal.update({
            where: { id: withdrawal.w.id },
            data: { status: "PROCESSING", razorpayPayoutId: payout.payoutId }
          });
        }
      });

      return { success: true, status: payout.status };
    } catch (error: any) {
      const errorMsg = error?.message || "";
      const isTimeoutOrNetworkError =
        errorMsg.includes("timeout") ||
        errorMsg.includes("fetch") ||
        errorMsg.includes("network") ||
        errorMsg.includes("ENOTFOUND") ||
        errorMsg.includes("ECONNREFUSED") ||
        errorMsg.includes("Circuit is OPEN");

      logger.error("PAYOUT_FAILED: Payout creation failed", { userId, error });

      if (isTimeoutOrNetworkError) {
        logger.warn("Payout request timed out or network error occurred. Keeping status as PROCESSING for background/webhook reconciliation.", { userId, withdrawalId: withdrawal.w.id });
        return { success: true, status: "PROCESSING" };
      } else {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          await tx.wallet.update({ where: { userId }, data: { balance: { increment: data.amount } } });
          await tx.withdrawal.update({
            where: { id: withdrawal.w.id },
            data: { status: "FAILED", failureReason: errorMsg || "Gateway creation failed" }
          });
          await tx.transaction.update({
            where: { id: withdrawal.t.id },
            data: { status: "FAILED" }
          });
        });
        throw new Error(`Payout failed: ${errorMsg || "Gateway error"}. Funds returned to wallet.`);
      }
    }
  }
}
