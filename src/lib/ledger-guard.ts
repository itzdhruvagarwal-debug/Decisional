import prisma from "./db";
import { logger } from "./logger";
import { Prisma } from "@prisma/client";

/**
 * Ledger Invariant Verification Engine (LIVE)
 * ──────────────────────────────────────────────────────────
 * Recalculates wallet balances from the transaction ledger.
 * This should be run as a background task to detect financial drift.
 * 
 * INVARIANT: wallet.balance === sum(CREDIT) - sum(DEBIT)
 */

export interface VerificationAnomaly {
    walletId: string;
    userId: string;
    calculatedBalance: number;
    storedBalance: number;
    drift: number;
    storedPendingBalance?: number;
    pendingDrift?: number;
}

/**
 * Recalculate and verify a specific user's wallet balance.
 * Returns null if everything is correct, or anomaly data ifdrift exists.
 */
export async function verifyWalletBalance(userId: string): Promise<VerificationAnomaly | null> {
    const [wallet, _txSummary] = await Promise.all([
        prisma.wallet.findUnique({
            where: { userId },
            select: { id: true, balance: true, pendingBalance: true, userId: true }
        }),
        prisma.transaction.aggregate({
            where: {
                wallet: { userId },
                status: "COMPLETED"
            },
            _sum: { amount: true }
        })
    ]);

    if (!wallet) return null;

    // Since sum(amount) for transactions covers both credit and debit, 
    // and we process credit as (+) and debit as (-), simple sum should work.
    // Wait, let's verify if Transaction model stores absolute amount or signed?
    // Looking at PaymentService, it increments/decrements balance based on type.
    // Let's explicitly separate credit and debit to be 100% sure.

    const [credits, debits] = await Promise.all([
        prisma.transaction.aggregate({
            where: {
                wallet: { userId },
                status: "COMPLETED",
                type: { in: ["CREDIT", "REFUND"] }
            },
            _sum: { amount: true }
        }),
        prisma.transaction.aggregate({
            where: {
                wallet: { userId },
                status: "COMPLETED",
                type: { in: ["DEBIT", "WITHDRAWAL", "PLATFORM_FEE", "CLAWBACK", "CHARGEBACK"] }
            },
            _sum: { amount: true }
        })
    ]);

    const totalCredits = credits._sum.amount || 0;
    const totalDebits = debits._sum.amount || 0;
    const calculatedBalance = totalCredits - totalDebits;

    const pendingDrift = wallet.pendingBalance < 0 ? wallet.pendingBalance : 0;

    if (calculatedBalance !== wallet.balance || pendingDrift !== 0) {
        const drift = wallet.balance - calculatedBalance;
        const anomaly = {
            walletId: wallet.id,
            userId: wallet.userId,
            calculatedBalance,
            storedBalance: wallet.balance,
            drift,
            storedPendingBalance: wallet.pendingBalance,
            pendingDrift,
        };

        // Securely log the anomaly. Auto-correction is gated by env so production
        // teams can require manual review unless an incident runbook enables it.
        logger.error("CRITICAL LEDGER DRIFT DETECTED", anomaly);

        // CRITICAL: Await the audit log — ledger drift MUST be recorded
        try {
          await prisma.activityLog.create({
            data: {
              userId: wallet.userId,
              action: "SECURITY_LEDGER_ALERT",
              metadata: {
                ...anomaly,
                reason: "Total ledger sum does not match stored balance"
              }
            }
          });
        } catch (auditErr) {
          // If even the audit log fails, emit a critical log so monitoring catches it
          logger.error("CRITICAL: Failed to record ledger drift audit log", auditErr, {
            walletId: wallet.id,
            userId: wallet.userId,
            drift,
          });
        }

        if (process.env.AUTO_CORRECT_LEDGER_DRIFT === "true") {
          await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            await tx.wallet.update({
              where: { id: wallet.id },
              data: { balance: calculatedBalance },
            });

            await tx.activityLog.create({
              data: {
                userId: wallet.userId,
                action: "SECURITY_LEDGER_AUTO_CORRECTED",
                entityType: "Wallet",
                entityId: wallet.id,
                metadata: {
                  ...anomaly,
                  correctedBalance: calculatedBalance,
                },
              },
            });
          });
        }

        return anomaly;
    }

    return null;
}

/**
 * Scan all wallets for financial drift.
 * Runs periodically to guard system integrity.
 */
export async function scanAllWalletsForDrift(limit: number = 100): Promise<VerificationAnomaly[]> {
    const batchSize = Math.min(Math.max(limit, 1), 500);
    let cursor: string | undefined;

    const anomalies: VerificationAnomaly[] = [];
    while (true) {
        const wallets = await prisma.wallet.findMany({
            take: batchSize,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            orderBy: { id: "asc" },
            select: { id: true, userId: true }
        });

        if (wallets.length === 0) break;

        for (const wallet of wallets) {
            const anomaly = await verifyWalletBalance(wallet.userId);
            if (anomaly) anomalies.push(anomaly);
        }

        cursor = wallets[wallets.length - 1]?.id;
        if (wallets.length < batchSize) break;
    }

    return anomalies;
}
