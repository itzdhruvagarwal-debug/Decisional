import { Prisma } from "@prisma/client";
import { logger } from "./logger";

/**
 * Credits the wallet of a user, applying any outstanding debts.
 * If user has outstanding debt, it deducts the credit amount up to the debt.
 */
export async function creditWalletWithDebtAdjustment(
  tx: Prisma.TransactionClient,
  userId: string,
  creditAmount: number,
  dealId?: string,
  description?: string,
  razorpayPaymentId?: string | null,
  metadata?: Record<string, unknown>,
) {
  // 1. Fetch wallet to check for debt, locking the row to serialize concurrent updates
  const wallets = await tx.$queryRaw<{ id: string; debt: number }[]>`
    SELECT id, debt FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE
  `;
  const wallet = wallets[0] || null;

  if (!wallet) {
    // If no wallet exists, create one with the credit amount
    const newWallet = await tx.wallet.create({
      data: {
        userId,
        balance: creditAmount,
        totalEarned: creditAmount,
      },
    });

    if (creditAmount > 0) {
      await tx.transaction.create({
        data: {
          walletId: newWallet.id,
          dealId: dealId || null,
          type: "CREDIT",
          amount: creditAmount,
          status: "COMPLETED",
          description: description || `Payout credited`,
          razorpayPaymentId: razorpayPaymentId || null,
          metadata: metadata ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });
    }

    return newWallet;
  }

  const outstandingDebt = wallet.debt || 0;
  if (outstandingDebt > 0 && creditAmount > 0) {
    const debtPaid = Math.min(outstandingDebt, creditAmount);
    const netCredit = creditAmount - debtPaid;

    // Update wallet: reduce debt, increment balance by netCredit, increment totalEarned by netCredit
    const updatedWallet = await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: { increment: netCredit },
        totalEarned: { increment: netCredit },
        debt: { decrement: debtPaid },
      },
    });

    // Distribute recovered debt to creditor(s)
    let remainingDebtPaid = debtPaid;
    const pendingClaims = await tx.debtClaim.findMany({
      where: {
        debtorWalletId: wallet.id,
        status: "PENDING",
        amount: { gt: 0 },
      },
      orderBy: { createdAt: "asc" },
    });

    for (const claim of pendingClaims) {
      if (remainingDebtPaid <= 0) break;
      const payForThisClaim = Math.min(claim.amount, remainingDebtPaid);

      // 1. Update the claim amount/status
      const newAmount = claim.amount - payForThisClaim;
      await tx.debtClaim.update({
        where: { id: claim.id },
        data: {
          amount: newAmount,
          status: newAmount === 0 ? "RECOVERED" : "PENDING",
        },
      });

      // 2. Credit the creditor's wallet directly
      const creditorWallet = await tx.wallet.upsert({
        where: { userId: claim.creditorUserId },
        create: { userId: claim.creditorUserId, balance: payForThisClaim, pendingBalance: 0 },
        update: { balance: { increment: payForThisClaim } },
      });

      // 3. Record transaction for the creditor's wallet (REFUND)
      await tx.transaction.create({
        data: {
          walletId: creditorWallet.id,
          dealId: claim.dealId,
          type: "REFUND",
          amount: payForThisClaim,
          status: "COMPLETED",
          description: `Recovered clawback debt refund from influencer payout (Deal: ${claim.dealId})`,
        },
      });

      remainingDebtPaid -= payForThisClaim;
    }

    if (remainingDebtPaid > 0) {
      logger.critical("DEBT_DISTRIBUTION_GAP: Debt recovered but not fully distributed to creditors due to claim sum discrepancy", {
        walletId: wallet.id,
        userId,
        remainingDebtPaid,
        debtPaid,
      });
    }

    // Create a transaction record for the debt recovery
    await tx.transaction.create({
      data: {
        walletId: wallet.id,
        dealId: dealId || null,
        type: "DEBIT",
        amount: debtPaid,
        status: "COMPLETED",
        description: `Debt recovery auto-deduction for outstanding clawback balance`,
      },
    });

    // Also create a credit transaction for the net credit if netCredit > 0
    if (netCredit > 0) {
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          dealId: dealId || null,
          type: "CREDIT",
          amount: netCredit,
          status: "COMPLETED",
          description: description || `Payout credited (net of debt)`,
          razorpayPaymentId: razorpayPaymentId || null,
          metadata: metadata ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });
    }

    return updatedWallet;
  }

  // No debt, do standard update
  const updatedWallet = await tx.wallet.update({
    where: { id: wallet.id },
    data: {
      balance: { increment: creditAmount },
      totalEarned: { increment: creditAmount },
    },
  });

  // Create credit transaction for the full amount
  if (creditAmount > 0) {
    await tx.transaction.create({
      data: {
        walletId: wallet.id,
        dealId: dealId || null,
        type: "CREDIT",
        amount: creditAmount,
        status: "COMPLETED",
        description: description || `Payout credited`,
        razorpayPaymentId: razorpayPaymentId || null,
          metadata: metadata ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  }

  return updatedWallet;
}
