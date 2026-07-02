/**
 * Progressive Penalty System — Escalating Consequences for Violations
 *
 * Penalty Tiers:
 * Strike 1:      Warning + 5% trust reduction
 * Strike 2:      24h cooldown on new deals + 10% trust reduction
 * Strike 3:      7-day suspension + 20% trust reduction + payout hold
 * Strike 4:      30-day ban + 50% trust reduction
 * Strike 5+:     Permanent ban + account review
 *
 * STRICT RULE-BASED LOGIC ONLY — NO ML.
 */

import { Prisma } from "@prisma/client";
import prisma from "./db";
import { updateTrustAndLevel } from "./trust-engine";
import { logger } from "./logger";
import { applyResolution } from "./dispute-mediator";
import { NotificationService } from "@/services/notification.service";
import { createActivityLog } from "./audit";

// ==================== TYPES ====================

export type ViolationCategory =
  | "FAKE_ENGAGEMENT"
  | "POST_DELETION"
  | "CONTENT_PLAGIARISM"
  | "MISSED_DEADLINE"
  | "FAKE_METRICS"
  | "PAYMENT_FRAUD"
  | "HARASSMENT"
  | "SPAM"
  | "LATE_RESPONSE"
  | "OTHER";

export interface PenaltyResult {
  userId: string;
  strikeNumber: number;
  action: PenaltyAction;
  trustReduction: number;
  description: string;
  expiresAt?: Date | null | undefined;
  requiresManualReview: boolean;
}

export type PenaltyAction =
  | "WARNING"
  | "COOLDOWN_72H"
  | "SUSPENSION_14D"
  | "BAN_90D"
  | "PERMANENT_BAN";

// ==================== PENALTY CALCULATION ====================

const PENALTY_TIERS: Record<
  number,
  {
    action: PenaltyAction;
    trustReduction: number;
    durationDays: number | null;
    description: string;
  }
> = {
  1: {
    action: "WARNING",
    trustReduction: 30,
    durationDays: null,
    description: "First warning issued. Please review platform guidelines.",
  },
  2: {
    action: "COOLDOWN_72H",
    trustReduction: 60,
    durationDays: 3,
    description:
      "72-hour cooldown applied. You cannot create or accept new deals.",
  },
  3: {
    action: "SUSPENSION_14D",
    trustReduction: 120,
    durationDays: 14,
    description: "14-day suspension. Active payouts are on hold pending review.",
  },
  4: {
    action: "BAN_90D",
    trustReduction: 300,
    durationDays: 90,
    description: "90-day ban. Account is restricted from all deal activities.",
  },
  5: {
    action: "PERMANENT_BAN",
    trustReduction: 600,
    durationDays: null,
    description: "Account permanently banned due to repeated violations.",
  },
};

/**
 * Calculate and apply penalty based on the user's violation history.
 * Returns the strike number and action taken.
 */
export async function applyProgressivePenalty(
  userId: string,
  category: ViolationCategory,
  details: string,
  evidence?: string,
): Promise<PenaltyResult> {
  // Count existing violations in the last 90 days
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400 * 1000);

  const { strikeNumber, tier, expiresAt } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const recentViolations = await tx.userViolation.count({
      where: {
        userId,
        createdAt: { gte: ninetyDaysAgo },
      },
    });

    const strike = Math.min(recentViolations + 1, 5);
    const penaltyTier = PENALTY_TIERS[strike]!;

    const expiration: Date | null = penaltyTier.durationDays
      ? new Date(Date.now() + penaltyTier.durationDays * 86400 * 1000)
      : null;

    await tx.userViolation.create({
      data: {
        userId,
        type: mapCategoryToViolationType(category),
        severity:
          strike >= 4 ? "HIGH" : strike >= 2 ? "MEDIUM" : "LOW",
        description: `[Strike ${strike}] ${details}`,
        evidence: evidence ?? null,
        action: mapPenaltyToViolationAction(penaltyTier.action),
        expiresAt: expiration,
        metadata: {
          category,
          strikeNumber: strike,
          trustReduction: penaltyTier.trustReduction,
          penaltyAction: penaltyTier.action,
        },
      },
    });

    return { strikeNumber: strike, tier: penaltyTier, expiresAt: expiration };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  // 2. Apply trust score reduction via updateTrustAndLevel to avoid race condition and overwrite bugs
  if (tier.trustReduction > 0) {
    try {
      await updateTrustAndLevel(userId, "TERMS_VIOLATION");
    } catch (err) {
      logger.error("Failed to run updateTrustAndLevel after progressive penalty", err);
    }
  }

  // 3. Apply account restrictions based on penalty
  if (
    tier.action === "COOLDOWN_72H" ||
    tier.action === "SUSPENSION_14D" ||
    tier.action === "BAN_90D"
  ) {
    await prisma.user.update({
      where: { id: userId },
      data: { status: "SUSPENDED" },
    });
  }

  if (tier.action === "PERMANENT_BAN") {
    await prisma.user.update({
      where: { id: userId },
      data: { status: "BANNED" },
    });
  }

  // 4. If suspension — hold active payouts
  if (strikeNumber >= 3) {
    await holdActivePayouts(userId);
  }

  // 5. Notify user
  await NotificationService.createNotification({
    userId,
    type: strikeNumber >= 3 ? "trust_warning" : "alert",
    title: `⚠️ Strike ${strikeNumber}: ${tier.action.replace(/_/g, " ")}`,
    message: `${tier.description} Reason: ${details}`,
    data: JSON.parse(JSON.stringify({ strikeNumber, category, expiresAt })),
  });

  logger.warn("Progressive penalty applied", {
    userId,
    strikeNumber,
    action: tier.action,
    category,
    trustReduction: tier.trustReduction,
  });

  return {
    userId,
    strikeNumber,
    action: tier.action,
    trustReduction: tier.trustReduction,
    description: tier.description,
    expiresAt,
    requiresManualReview: strikeNumber >= 4,
  };
}

// ==================== ACTIVE PAYOUT HOLD ====================

async function holdActivePayouts(userId: string) {
  try {
    // Find active deals where the influencer has pending payouts
    // Select status so we can record it before overwriting with DISPUTED
    const activeDeals = await prisma.deal.findMany({
      where: {
        influencer: { userId },
        status: { in: ["PAYMENT_HELD", "CONTENT_SUBMITTED", "REVISION_REQUESTED", "CONTENT_APPROVED", "POSTED", "VERIFICATION_PENDING", "VERIFIED"] },
        reservedFromWallet: true,
      },
      select: { id: true, status: true },
    });

    for (const deal of activeDeals) {
      // Capture current status BEFORE overwriting — needed for dispute resolution restoration
      const statusBeforeHold = deal.status;

      const updated = await prisma.deal.updateMany({
        where: {
          id: deal.id,
          status: { notIn: ["COMPLETED", "CANCELLED", "DISPUTED"] },
        },
        data: {
          status: "DISPUTED",
          rejectionReason: "Payout held due to account violation review.",
        },
      });

      // Only create dispute record if we actually changed the deal status
      if (updated.count > 0) {
        // Create a proper Dispute record so dispute-mediator can restore status on dismissal
        await prisma.dispute.create({
          data: {
            dealId: deal.id,
            raisedByUserId: userId,
            type: "TERMS_VIOLATION",
            description: "Payout automatically held pending account violation review by admin.",
            status: "OPEN",
            dealStatusAtCreation: statusBeforeHold,
          },
        });
      }

      await createActivityLog({
        userId,
        action: "PAYOUT_HELD_DUE_TO_VIOLATION",
        metadata: {
          dealId: deal.id,
          reason: "Account under review due to violations",
          previousDealStatus: statusBeforeHold,
        },
      });
    }

    logger.info("Active payouts held for user under penalty", {
      userId,
      dealsAffected: activeDeals.length,
    });
  } catch (error) {
    logger.error("Failed to hold active payouts", error, { userId });
  }
}


// ==================== SUSPENSION LIFT (CRON) ====================

/**
 * Check and lift expired suspensions.
 * Should be run daily via cron.
 */
export async function liftExpiredSuspensions(): Promise<{ lifted: number }> {
  const now = new Date();

  // 1. Find users with expired violation actions
  const expiredViolations = await prisma.userViolation.findMany({
    where: {
      expiresAt: { lte: now },
      action: "TEMP_SUSPENSION",
      user: { status: "SUSPENDED" },
    },
    select: { userId: true },
  });

  const userIdsToCheck = Array.from(
    new Set(expiredViolations.map((v: { userId: string }) => v.userId)),
  );
  if (userIdsToCheck.length === 0) {
    return { lifted: 0 };
  }

  // 2. Check which users still have active (non-expired) suspensions
  const stillActive = await prisma.userViolation.findMany({
    where: {
      userId: { in: userIdsToCheck },
      expiresAt: { gt: now },
      action: "TEMP_SUSPENSION",
    },
    select: { userId: true },
  });

  const stillActiveSet = new Set(stillActive.map((v: { userId: string }) => v.userId));
  const userIdsToLift = userIdsToCheck.filter((id) => !stillActiveSet.has(id));

  if (userIdsToLift.length === 0) {
    return { lifted: 0 };
  }

  // 3. Update all lifted users to ACTIVE status
  await prisma.user.updateMany({
    where: { id: { in: userIdsToLift } },
    data: { status: "ACTIVE" },
  });

  // 4. Auto-dismiss OPEN TERMS_VIOLATION disputes created by holdActivePayouts.
  // These disputes were opened solely to freeze payouts during the suspension period;
  // now that the suspension has expired, the violation period is served — DISMISS them
  // so deal statuses are restored and funds are released.
  const openHoldDisputes = await prisma.dispute.findMany({
    where: {
      raisedByUserId: { in: userIdsToLift },
      type: "TERMS_VIOLATION",
      status: "OPEN",
    },
    select: { id: true, raisedByUserId: true },
  });

  for (const dispute of openHoldDisputes) {
    try {
      // Synthetic DISMISSED analysis — suspension has been served, hold no longer justified.
      // applyResolution uses dispute.dealStatusAtCreation (set by holdActivePayouts above)
      // to restore the deal to its pre-hold status.
      const dismissedAnalysis = {
        disputeId: dispute.id,
        tier: 1 as const,
        verdict: "DISMISSED" as const,
        confidence: "HIGH" as const,
        refundPercentage: 0,
        influencerPayoutPercentage: 100,
        trustScoreChanges: { influencer: 0, brand: 0 },
        explanation:
          "Suspension period has expired. Payout hold automatically lifted. Deal status restored.",
        findings: [] as { check: string; result: "PASS" | "FAIL" | "WARNING" | "N/A"; detail: string }[],
        suggestedAction: "Resume normal deal processing.",
        autoResolvable: true,
      };
      await applyResolution(dispute.id, dismissedAnalysis, "AUTO");
      logger.info("Auto-dismissed TERMS_VIOLATION dispute on suspension lift", {
        disputeId: dispute.id,
        userId: dispute.raisedByUserId,
      });
    } catch (err) {
      // Non-fatal — log and continue so all other disputes still get processed
      logger.error("Failed to auto-dismiss dispute on suspension lift", err, {
        disputeId: dispute.id,
        userId: dispute.raisedByUserId,
      });
    }
  }

  // 5. Create notifications for all lifted users
  await NotificationService.createNotifications((userIdsToLift as string[]).map((userId) => ({
    userId,
    type: "alert",
    title: "✅ Suspension Lifted",
    message:
      "Your account suspension has expired. You can now resume normal activities. Please follow platform guidelines to avoid future penalties.",
  })));

  return { lifted: userIdsToLift.length };
}



// ==================== HELPERS ====================

function mapCategoryToViolationType(category: ViolationCategory) {
  const map: Record<
    ViolationCategory,
    | "SPAM"
    | "FRAUD"
    | "HARASSMENT"
    | "TERMS_VIOLATION"
    | "CONTENT_POLICY"
    | "LATE_RESPONSE"
    | "OTHER"
  > = {
    FAKE_ENGAGEMENT: "FRAUD",
    POST_DELETION: "CONTENT_POLICY",
    CONTENT_PLAGIARISM: "CONTENT_POLICY",
    MISSED_DEADLINE: "TERMS_VIOLATION",
    FAKE_METRICS: "FRAUD",
    PAYMENT_FRAUD: "FRAUD",
    HARASSMENT: "HARASSMENT",
    SPAM: "SPAM",
    LATE_RESPONSE: "LATE_RESPONSE",
    OTHER: "OTHER",
  };
  return map[category];
}

function mapPenaltyToViolationAction(action: PenaltyAction) {
  const map: Record<
    PenaltyAction,
    "WARNING" | "TEMP_SUSPENSION" | "PERMANENT_BAN"
  > = {
    WARNING: "WARNING",
    COOLDOWN_72H: "TEMP_SUSPENSION",
    SUSPENSION_14D: "TEMP_SUSPENSION",
    BAN_90D: "TEMP_SUSPENSION",
    PERMANENT_BAN: "PERMANENT_BAN",
  };
  return map[action];
}
