import { Prisma } from "@prisma/client";

import prisma from "./db";
import { logger } from "./logger";
import { createActivityLog } from "./audit";
import { redis } from "./redis";
import { WalletService } from "@/services/wallet.service";

const CREDIT_TYPES = new Set(["CREDIT", "REFUND"]);
const DEBIT_TYPES = new Set([
    "DEBIT",
    "WITHDRAWAL",
    "PLATFORM_FEE",
    "CLAWBACK",
    "CHARGEBACK",
]);

type LedgerTransaction = {
    type: string;
    amount: number;
    description: string | null;
    metadata: Prisma.JsonValue | null;
    razorpayPaymentId: string | null;
};

function getMetadataObject(metadata: Prisma.JsonValue | null): Record<string, unknown> | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        return null;
    }

    return metadata as Record<string, unknown>;
}

function impactsStoredWalletBalance(transaction: LedgerTransaction) {
    const metadata = getMetadataObject(transaction.metadata);
    if (metadata?.balanceImpact === false) return false;
    if (metadata?.balanceImpact === true) return true;

    const description = transaction.description || "";

    // Legacy audit rows created before balanceImpact metadata existed.
    if (
        transaction.type === "DEBIT" &&
        transaction.razorpayPaymentId &&
        description === "Payment held for deal (Escrow)"
    ) {
        return false;
    }

    if (
        transaction.type === "DEBIT" &&
        description.startsWith("Funds reserved for direct invite deal:")
    ) {
        return false;
    }

    if (
        transaction.type === "DEBIT" &&
        description.startsWith("TDS deduction")
    ) {
        return false;
    }

    return true;
}

/**
 * Ledger Invariant Verification Engine (LIVE)
 * ──────────────────────────────────────────────────────────
 * Recalculates wallet balances from the transaction ledger.
 * This should be run as a background task to detect financial drift.
 * 
 * INVARIANT: wallet.balance === sum(balance-impacting credits) - sum(balance-impacting debits)
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
    const wallet = await WalletService.getWalletBasic(userId);
    if (!wallet) {
        return null;
    }
    const transactions = await prisma.transaction.findMany({
            where: {
                wallet: { userId },
                status: "COMPLETED",
                deletedAt: null,
            },
            select: {
                type: true,
                amount: true,
                description: true,
                metadata: true,
                razorpayPaymentId: true,
            },
        });

    const balanceTransactions = (transactions as LedgerTransaction[]).filter(
        impactsStoredWalletBalance,
    );
    const totalCredits = balanceTransactions.reduce(
        (sum: number, transaction: LedgerTransaction) =>
            CREDIT_TYPES.has(transaction.type) ? sum + transaction.amount : sum,
        0,
    );
    const totalDebits = balanceTransactions.reduce(
        (sum: number, transaction: LedgerTransaction) =>
            DEBIT_TYPES.has(transaction.type) ? sum + transaction.amount : sum,
        0,
    );
    const calculatedBalance = totalCredits - totalDebits;

    const pendingDrift = Math.min(wallet.pendingBalance, 0);

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

        await handleLedgerDriftAnomaly(wallet, calculatedBalance, drift, anomaly);
        return anomaly;
    }

    return null;
}

async function handleLedgerDriftAnomaly(
    wallet: { id: string; userId: string },
    calculatedBalance: number,
    drift: number,
    anomaly: VerificationAnomaly
): Promise<void> {
    // Securely log the anomaly. Auto-correction is gated by env so production
    // teams can require manual review unless an incident runbook enables it.
    logger.error("CRITICAL LEDGER DRIFT DETECTED", anomaly);

    // CRITICAL: Await the audit log — ledger drift MUST be recorded
    try {
      await createActivityLog({
        userId: wallet.userId,
        action: "SECURITY_LEDGER_ALERT",
        metadata: {
          ...anomaly,
          reason: "Total ledger sum does not match stored balance"
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

        await createActivityLog({
          userId: wallet.userId,
          action: "SECURITY_LEDGER_AUTO_CORRECTED",
          entityType: "Wallet",
          entityId: wallet.id,
          metadata: {
            ...anomaly,
            correctedBalance: calculatedBalance,
          },
        }, tx);
      });
    }
}

/**
 * Scan all wallets for financial drift.
 * Runs periodically to guard system integrity.
 */
const LEDGER_SCAN_CURSOR_KEY = "ledger:scan:last-wallet-id";

async function scanWalletsBatch(wallets: { id: string; userId: string }[], anomalies: VerificationAnomaly[]) {
    const CONCURRENCY_LIMIT = 5;
    for (let i = 0; i < wallets.length; i += CONCURRENCY_LIMIT) {
        const batch = wallets.slice(i, i + CONCURRENCY_LIMIT);
        const batchResults = await Promise.all(
            batch.map(wallet => verifyWalletBalance(wallet.userId))
        );
        for (const anomaly of batchResults) {
            if (anomaly) anomalies.push(anomaly);
        }
    }
}

async function fetchWalletBatchForScan(currentTake: number, cursor: string | undefined) {
    return prisma.wallet.findMany({
        take: currentTake,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: "asc" },
        select: { id: true, userId: true }
    });
}

export async function scanAllWalletsForDrift(maxScanCount: number = 500): Promise<VerificationAnomaly[]> {
    const batchSize = 100;
    let cursor = (await redis.get(LEDGER_SCAN_CURSOR_KEY)) || undefined;
    let totalScanned = 0;
    let wrapped = false;

    const anomalies: VerificationAnomaly[] = [];
    while (totalScanned < maxScanCount) {
        const remainingToScan = maxScanCount - totalScanned;
        const currentTake = Math.min(batchSize, remainingToScan);

        const wallets = await fetchWalletBatchForScan(currentTake, cursor);

        if (wallets.length === 0) {
            if (cursor && !wrapped) {
                cursor = undefined;
                wrapped = true;
                continue;
            }
            break;
        }

        await scanWalletsBatch(wallets, anomalies);

        totalScanned += wallets.length;
        cursor = wallets[wallets.length - 1]?.id;
        if (wallets.length < currentTake) {
            if (!wrapped) {
                cursor = undefined;
                wrapped = true;
                continue;
            }
            break;
        }
    }

    if (cursor) {
        await redis.set(LEDGER_SCAN_CURSOR_KEY, cursor);
    } else {
        await redis.del(LEDGER_SCAN_CURSOR_KEY);
    }

    return anomalies;
}
