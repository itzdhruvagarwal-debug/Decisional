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

import prisma from "./db";
import { updateTrustAndLevel } from "./trust-engine";
import { logger } from "./logger";

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
  expiresAt?: Date | undefined;
  requiresManualReview: boolean;
}

export type PenaltyAction =
  | "WARNING"
  | "COOLDOWN_24H"
  | "SUSPENSION_7D"
  | "BAN_30D"
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
    trustReduction: 5,
    durationDays: null,
    description: "First warning issued. Please review platform guidelines.",
  },
  2: {
    action: "COOLDOWN_24H",
    trustReduction: 10,
    durationDays: 1,
    description:
      "24-hour cooldown applied. You cannot create or accept new deals.",
  },
  3: {
    action: "SUSPENSION_7D",
    trustReduction: 20,
    durationDays: 7,
    description: "7-day suspension. Active payouts are on hold pending review.",
  },
  4: {
    action: "BAN_30D",
    trustReduction: 50,
    durationDays: 30,
    description: "30-day ban. Account is restricted from all deal activities.",
  },
  5: {
    action: "PERMANENT_BAN",
    trustReduction: 100,
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

  const recentViolations = await prisma.userViolation.count({
    where: {
      userId,
      createdAt: { gte: ninetyDaysAgo },
    },
  });

  const strikeNumber = Math.min(recentViolations + 1, 5);
  const tier = PENALTY_TIERS[strikeNumber]!;


  const expiresAt = tier.durationDays
    ? new Date(Date.now() + tier.durationDays * 86400 * 1000)
    : undefined;

  // 1. Create violation record
  await prisma.userViolation.create({
    data: {
      userId,
      type: mapCategoryToViolationType(category),
      severity:
        strikeNumber >= 4 ? "HIGH" : strikeNumber >= 2 ? "MEDIUM" : "LOW",
      description: `[Strike ${strikeNumber}] ${details}`,
      evidence,
      action: mapPenaltyToViolationAction(tier.action),
      expiresAt,
      metadata: {
        category,
        strikeNumber,
        trustReduction: tier.trustReduction,
        penaltyAction: tier.action,
      },
    },
  });

  // 2. Apply trust score reduction
  if (tier.trustReduction > 0) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        trustScore: { decrement: tier.trustReduction },
      },
    });

    // Also trigger trust engine events for compounding effects
    try {
      await updateTrustAndLevel(userId, "TERMS_VIOLATION");
    } catch {
      // Trust engine update is best-effort
    }
  }

  // 3. Apply account restrictions based on penalty
  if (
    tier.action === "COOLDOWN_24H" ||
    tier.action === "SUSPENSION_7D" ||
    tier.action === "BAN_30D"
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
  await prisma.notification.create({
    data: {
      userId,
      type: strikeNumber >= 3 ? "trust_warning" : "alert",
      title: `⚠️ Strike ${strikeNumber}: ${tier.action.replace(/_/g, " ")}`,
      message: `${tier.description} Reason: ${details}`,
      data: JSON.parse(JSON.stringify({ strikeNumber, category, expiresAt })),
    },
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
    const activeDeals = await prisma.deal.findMany({
      where: {
        influencer: { userId },
        status: { in: ["CONTENT_APPROVED", "VERIFIED", "COMPLETED"] },
        paymentHold: { status: "HELD" },
      },
      select: { id: true },
    });

    for (const deal of activeDeals) {
      await prisma.activityLog.create({
        data: {
          userId,
          action: "PAYOUT_HELD_DUE_TO_VIOLATION",
          metadata: {
            dealId: deal.id,
            reason: "Account under review due to violations",
          },
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

  // Find users with expired violation actions
  const expiredViolations = await prisma.userViolation.findMany({
    where: {
      expiresAt: { lte: now },
      action: "TEMP_SUSPENSION",
      user: { status: "SUSPENDED" },
    },
    select: {
      userId: true,
      id: true,
    },
    distinct: ["userId"],
  });

  let lifted = 0;

  for (const violation of expiredViolations) {
    // Check if user has any OTHER active (non-expired) suspensions
    const activeViolations = await prisma.userViolation.count({
      where: {
        userId: violation.userId,
        expiresAt: { gt: now },
        action: "TEMP_SUSPENSION",
      },
    });

    if (activeViolations === 0) {
      await prisma.user.update({
        where: { id: violation.userId },
        data: { status: "ACTIVE" },
      });

      await prisma.notification.create({
        data: {
          userId: violation.userId,
          type: "alert",
          title: "✅ Suspension Lifted",
          message:
            "Your account suspension has expired. You can now resume normal activities. Please follow platform guidelines to avoid future penalties.",
        },
      });

      lifted++;
    }
  }

  return { lifted };
}

// ==================== IP RATE LIMITING ====================
// Redis sliding-window rate limiter — see src/lib/rate-limit.ts for implementation.
// Used via middleware (middleware.ts) and inline in API route handlers.
// Import `checkRateLimit` from '@/lib/rate-limit' and call:
//   checkRateLimit(ip, 'AUTH')  in auth routes
//   checkRateLimit(ip, 'API_DEFAULT') for general API protection
// All limits and windows are configured in RATE_LIMIT_CONFIGS.

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
    COOLDOWN_24H: "TEMP_SUSPENSION",
    SUSPENSION_7D: "TEMP_SUSPENSION",
    BAN_30D: "TEMP_SUSPENSION",
    PERMANENT_BAN: "PERMANENT_BAN",
  };
  return map[action];
}
