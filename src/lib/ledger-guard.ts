import prisma from "./db";
import { logger } from "./logger";

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
}

/**
 * Recalculate and verify a specific user's wallet balance.
 * Returns null if everything is correct, or anomaly data ifdrift exists.
 */
export async function verifyWalletBalance(userId: string): Promise<VerificationAnomaly | null> {
    const [wallet, _txSummary] = await Promise.all([
        prisma.wallet.findUnique({
            where: { userId },
            select: { id: true, balance: true, userId: true }
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

    if (calculatedBalance !== wallet.balance) {
        const drift = wallet.balance - calculatedBalance;
        const anomaly = {
            walletId: wallet.id,
            userId: wallet.userId,
            calculatedBalance,
            storedBalance: wallet.balance,
            drift
        };

        // Securely log the anomaly — NEVER auto-fix silently
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

        return anomaly;
    }

    return null;
}

/**
 * Scan all wallets for financial drift.
 * Runs periodically to guard system integrity.
 */
export async function scanAllWalletsForDrift(limit: number = 100): Promise<VerificationAnomaly[]> {
    const wallets = await prisma.wallet.findMany({
        take: limit,
        select: { userId: true }
    });

    const anomalies: VerificationAnomaly[] = [];
    for (const wallet of wallets) {
        const anomaly = await verifyWalletBalance(wallet.userId);
        if (anomaly) anomalies.push(anomaly);

        // Wait briefly to avoid DB hammering
        await new Promise(resolve => setTimeout(resolve, 10));
    }

    return anomalies;
}
