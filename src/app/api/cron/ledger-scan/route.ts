import { NextResponse } from "next/server";
import { validateCronSecret } from "../guard";
import { scanAllWalletsForDrift, VerificationAnomaly } from "@/lib/ledger-guard";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Ledger Drift Scan — Daily Cron
 * ────────────────────────────────
 * Recalculates every wallet's balance from the transaction ledger.
 * If drift is detected, admin notifications are created so the
 * operations team can investigate before financial drift compounds.
 *
 * Schedule: 0 2 * * * (daily at 2:00 AM IST)
 */

async function notifyAdminsOfAnomalies(anomalies: VerificationAnomaly[]) {
  if (anomalies.length === 0) return;

  const adminUsers = await prisma.user.findMany({
    where: { userType: "ADMIN" },
    select: { id: true },
  });

  if (adminUsers.length === 0) {
    logger.error("LEDGER_SCAN: Anomalies detected but NO admin users exist to notify", {
      anomalyCount: anomalies.length,
    });
    return;
  }

  const summary = anomalies
    .map(
      (a) =>
        `• Wallet ${a.walletId.slice(-6)}: stored ₹${(a.storedBalance / 100).toFixed(2)} vs ledger ₹${(a.calculatedBalance / 100).toFixed(2)} (drift ₹${(a.drift / 100).toFixed(2)})`,
    )
    .join("\n");

  const notifications = adminUsers.map((admin: { id: string }) => ({
    userId: admin.id,
    type: "admin_alert",
    title: `🚨 Ledger Drift Detected — ${anomalies.length} wallet(s)`,
    message: `Daily ledger scan found balance discrepancies:\n${summary}`,
    data: {
      type: "ledger_drift",
      anomalyCount: anomalies.length,
      anomalies: anomalies.map((a) => ({
        walletId: a.walletId,
        userId: a.userId,
        drift: a.drift,
      })),
      detectedAt: new Date().toISOString(),
    },
  }));

  await prisma.notification.createMany({ data: notifications });

  logger.error("LEDGER_SCAN: Admin notifications sent for financial drift", {
    anomalyCount: anomalies.length,
    adminCount: adminUsers.length,
  });
}

export async function POST() {
  try {
    await validateCronSecret();

    const anomalies = await scanAllWalletsForDrift(500);

    if (anomalies.length > 0) {
      await notifyAdminsOfAnomalies(anomalies);
    }

    logger.info("Ledger scan complete", {
      totalAnomalies: anomalies.length,
      clean: anomalies.length === 0,
    });

    return NextResponse.json({
      success: true,
      message: anomalies.length === 0
        ? "All wallets balanced — no drift detected"
        : `${anomalies.length} wallet(s) with drift — admin alerted`,
      data: {
        anomalyCount: anomalies.length,
        scannedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error("Cron Error (Ledger Scan)", { error: error.message });
    if (error.message === "Invalid Cron Secret") {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ success: false, message: "Cron internal failure" }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
