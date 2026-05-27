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
      return { exists: true, orderId: deal.paymentHold.razorpayOrderId };
    }

    // Amounts are already in paise (Integers)
    const amounts = calculateTotalAmount(deal.amount);

    const order = await createPreAuthOrder({
      dealId: deal.id,
      amount: amounts.totalAmount,
      notes: {
        deal_amount: amounts.dealAmount.toString(),
        platform_fee: amounts.platformFee.toString(),
        gateway_fee: amounts.gatewayFee.toString(),
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
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });

        await tx.deal.update({
          where: { id: dealId },
          data: { status: "PAYMENT_PENDING" },
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
        if (existingHold) return { exists: true, orderId: existingHold.razorpayOrderId, amount: existingHold.amount };
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

    if (!deal || deal.status === "COMPLETED") return;
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

        if (!hasGatewayHold && (!brandWallet || brandWallet.pendingBalance < deal.amount)) {
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
          const pendingRelease = Math.min(brandWallet.pendingBalance, deal.amount);
          await tx.wallet.update({
            where: { id: brandWallet.id },
            data: {
              ...(pendingRelease > 0
                ? { pendingBalance: { decrement: pendingRelease } }
                : {}),
              totalSpent: { increment: deal.amount },
            },
          });
        }

        if (deal.brandId) {
          await tx.brandProfile.update({
            where: { id: deal.brandId },
            data: { totalSpent: { increment: deal.amount } },
          });
        }

        const wallet = await tx.wallet.upsert({
          where: { userId: deal.influencer.userId },
          create: {
            userId: deal.influencer.userId,
            balance: deal.amount,
            totalEarned: deal.amount,
          },
          update: {
            balance: { increment: deal.amount },
            totalEarned: { increment: deal.amount },
          },
        });

        await tx.transaction.create({
          data: {
            walletId: wallet.id,
            dealId: deal.id,
            type: "CREDIT",
            amount: deal.amount,
            status: "COMPLETED",
            description: `Payout for deal: ${deal.id}`,
          },
        });
      });
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
    const existing = await prisma.transaction.findUnique({
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
        await prisma.transaction.update({
          where: { id: existing.id },
          data: { razorpayPaymentId: `failed:${existing.id}:${idempotencyKey}` },
        });
      } else {
        return { success: true, alreadyProcessed: true };
      }
    }

    const withdrawal = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
          status: "PROCESSING",
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
    });

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
        errorMsg.includes("ECONNREFUSED");

      logger.error("PAYOUT_FAILED: Payout creation failed", { userId, error });

      if (isTimeoutOrNetworkError) {
        throw new Error("Payout request timed out or network error occurred. Please check transaction history status later.");
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
