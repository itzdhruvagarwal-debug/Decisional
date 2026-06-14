/**
 * Post Monitor — Enhanced with 30-Day Monitoring & Clawback Logic
 *
 * Verifies if deal content is still live and compliant.
 * Implements a 30-day post-completion monitoring window with:
 * - Day 1-7: Daily checks
 * - Day 8-14: Every 2 days
 * - Day 15-30: Weekly checks
 *
 * Clawback triggers: If post is deleted/private within 30 days,
 * a percentage of the influencer's payment is clawed back based on timing.
 *
 * STRICT RULE-BASED LOGIC ONLY — NO ML.
 */

import prisma from "./db";
import { checkPostVerification } from "./fraud-detection";
import { updateTrustAndLevel } from "./trust-engine";
import { logger } from "./logger";
import { applyProgressivePenalty } from "./penalty-system";

// ==================== TYPES ====================

export interface PostStatusResult {
  dealId: string;
  isAlive: boolean;
  status: "ACTIVE" | "DELETED" | "PRIVATE" | "CHANGED";
  message?: string;
  monitoringDay?: number;
}

export interface ClawbackResult {
  dealId: string;
  triggered: boolean;
  clawbackPercentage: number;
  clawbackAmountPaise: number;
  reason: string;
}

// ==================== MONITORING SCHEDULE ====================

/**
 * Determines if a deal should be checked today based on its monitoring day.
 * Day 1-7:   Check daily
 * Day 8-14:  Check every 2 days
 * Day 15-30: Check weekly
 * Day 31+:   Monitoring complete
 */
export function shouldCheckToday(completedAt: Date): {
  shouldCheck: boolean;
  day: number;
} {
  const daysSinceCompletion = Math.floor(
    (Date.now() - completedAt.getTime()) / (86400 * 1000),
  );

  if (daysSinceCompletion > 30) {
    return { shouldCheck: false, day: daysSinceCompletion };
  }

  if (daysSinceCompletion <= 7) {
    // Daily checks
    return { shouldCheck: true, day: daysSinceCompletion };
  }

  if (daysSinceCompletion <= 14) {
    // Every 2 days
    return {
      shouldCheck: daysSinceCompletion % 2 === 0,
      day: daysSinceCompletion,
    };
  }

  // Weekly (check on day 21 and 28)
  return {
    shouldCheck: daysSinceCompletion % 7 === 0,
    day: daysSinceCompletion,
  };
}

// ==================== CLAWBACK CALCULATION ====================

/**
 * Calculate clawback percentage based on when the post was removed.
 * Earlier removal = higher penalty.
 *
 * Day 1-3:   100% clawback (clear fraud/bad faith)
 * Day 4-7:   75% clawback
 * Day 8-14:  50% clawback
 * Day 15-21: 25% clawback
 * Day 22-30: 15% clawback (late removal, still penalized)
 */
export function calculateClawbackPercentage(
  daysSinceCompletion: number,
): number {
  if (daysSinceCompletion <= 3) return 100;
  if (daysSinceCompletion <= 7) return 75;
  if (daysSinceCompletion <= 14) return 50;
  if (daysSinceCompletion <= 21) return 25;
  if (daysSinceCompletion <= 30) return 15;
  return 0; // Past monitoring window
}

// ==================== CORE VERIFICATION ====================

export async function verifyPostStatus(
  dealId: string,
): Promise<PostStatusResult> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      postUrl: true,
      contractTerms: true,
      postingDeadline: true,
      completedAt: true,
      verifiedAt: true,
      postedAt: true,
      influencerId: true,
      influencer: { select: { userId: true } },
    },
  });

  if (!deal || !deal.postUrl) {
    return {
      dealId,
      isAlive: false,
      status: "DELETED",
      message: "No post URL found",
    };
  }

  const termsObj = deal.contractTerms as Record<string, unknown> | null;
  const rawElements = Array.isArray(termsObj?.mandatoryElements)
    ? termsObj.mandatoryElements
    : termsObj?.mandatoryTags;
  const mandatoryElements: string[] = Array.isArray(rawElements)
    ? rawElements.map((element) => String(element).trim()).filter(Boolean)
    : [];
  const requiredTags = mandatoryElements.filter((el: string) =>
    el.startsWith("@"),
  );
  const requiredHashtags = mandatoryElements.filter((el: string) =>
    el.startsWith("#"),
  );

  // Use existing fraud detection logic to check URL validity/access
  const checkResult = await checkPostVerification({
    dealId: deal.id,
    influencerUserId: deal.influencer.userId,
    postUrl: deal.postUrl,
    requiredTags,
    requiredHashtags,
    postingDeadline: deal.postingDeadline,
  });

  // Determine status based on flags
  const isUnreachable = checkResult.flags.some(
    (f) => f.rule === "URL_UNREACHABLE",
  );
  const isPrivate = checkResult.flags.some((f) => f.rule === "POST_IS_PRIVATE");

  // Calculate monitoring day — fallback: completedAt → verifiedAt → postedAt
  const referenceDate = deal.completedAt ?? deal.verifiedAt ?? deal.postedAt;
  const monitoringDay = referenceDate
    ? Math.floor(
      (Date.now() - new Date(referenceDate).getTime()) / (86400 * 1000),
    )
    : 0;

  if (isUnreachable) {
    await handlePostFailure(deal, "DELETED", monitoringDay);
    return {
      dealId,
      isAlive: false,
      status: "DELETED",
      message: "Post URL is unreachable",
      monitoringDay,
    };
  }

  if (isPrivate) {
    await handlePostFailure(deal, "PRIVATE", monitoringDay);
    return {
      dealId,
      isAlive: false,
      status: "PRIVATE",
      message: "Post is private",
      monitoringDay,
    };
  }

  // Update monitoring stats
  await prisma.deal.update({
    where: { id: dealId },
    data: {
      lastPostCheck: new Date(),
      postCheckCount: { increment: 1 },
      isPostAlive: true,
    },
  });

  return { dealId, isAlive: true, status: "ACTIVE", monitoringDay };
}

// ==================== FAILURE HANDLING + CLAWBACK ====================

async function handlePostFailure(
  deal: {
    id: string;
    postUrl?: string | null;
    influencer?: { userId: string } | null;
    completedAt?: Date | null;
  },
  status: "DELETED" | "PRIVATE",
  monitoringDay: number,
) {
  try {
    // 1. Mark post as not alive
    await prisma.deal.update({
      where: { id: deal.id },
      data: {
        isPostAlive: false,
        lastPostCheck: new Date(),
        postCheckCount: { increment: 1 },
      },
    });

    // 2. Calculate and execute clawback if within 30 days
    let clawback: ClawbackResult | null = null;
    if (monitoringDay <= 30) {
      clawback = await executeClawback(deal.id, monitoringDay, status);
    }

    // 3. Fetch brand userId for notification
    const fullDeal = await prisma.deal.findUnique({
      where: { id: deal.id },
      select: {
        amount: true,
        brand: { select: { userId: true } },
      },
    });

    const ownerUserId = fullDeal?.brand?.userId;

    // 4. Notify deal owner (brand) with clawback info
    if (ownerUserId) {
      const clawbackMsg = clawback?.triggered
        ? ` A ${clawback.clawbackPercentage}% clawback (₹${(clawback.clawbackAmountPaise / 100).toFixed(2)}) has been initiated.`
        : "";
      await prisma.notification.create({
        data: {
          userId: ownerUserId,
          type: "alert",
          title:
            status === "DELETED" ? "🚨 Post Deleted!" : "🚨 Post Made Private!",
          message: `Our monitoring detected that the post for deal #${deal.id.slice(-6)} was ${status.toLowerCase()} on day ${monitoringDay} of the 30-day window.${clawbackMsg}`,
          data: JSON.parse(
            JSON.stringify({
              dealId: deal.id,
              postUrl: deal.postUrl,
              monitoringDay,
              clawback,
            }),
          ),
        },
      });
    }

    // 5. Notify influencer about consequence
    if (deal.influencer?.userId) {
      const clawbackMsg = clawback?.triggered
        ? ` ₹${(clawback.clawbackAmountPaise / 100).toFixed(2)} (${clawback.clawbackPercentage}%) has been deducted from your wallet.`
        : "";
      await prisma.notification.create({
        data: {
          userId: deal.influencer.userId,
          type: "trust_warning",
          title: "⚠️ Post Removal Detected",
          message: `Your post for deal #${deal.id.slice(-6)} was detected as ${status.toLowerCase()} on day ${monitoringDay}.${clawbackMsg} This affects your trust score.`,
          data: { dealId: deal.id, monitoringDay },
        },
      });
    }

    // 6. Log activity for audit trail
    if (deal.influencer?.userId) {
      await prisma.activityLog.create({
        data: {
          userId: deal.influencer.userId,
          action: "POST_STATUS_CHANGE",
          metadata: {
            dealId: deal.id,
            status,
            postUrl: deal.postUrl,
            monitoringDay,
            clawbackTriggered: clawback?.triggered || false,
            clawbackPercentage: clawback?.clawbackPercentage || 0,
            detectedAt: new Date().toISOString(),
          },
        },
      });
    }

    // 7. Apply progressive penalty and record violation
    if (deal.influencer?.userId) {
      try {
        await applyProgressivePenalty(
          deal.influencer.userId,
          "POST_DELETION",
          `Post ${status.toLowerCase()} on day ${monitoringDay} of 30-day monitoring window for deal ${deal.id}`,
          deal.postUrl || undefined
        );
      } catch (penaltyError) {
        logger.error("Failed to apply progressive penalty after post failure", penaltyError, {
          dealId: deal.id,
          userId: deal.influencer.userId,
        });
      }
    }
  } catch (error) {
    logger.error("PostMonitor handlePostFailure error", error, {
      dealId: deal.id,
    });
  }
}

// ==================== CLAWBACK EXECUTION ====================

async function executeClawback(
  dealId: string,
  monitoringDay: number,
  reason: string,
): Promise<ClawbackResult> {
  const clawbackPercentage = calculateClawbackPercentage(monitoringDay);

  if (clawbackPercentage === 0) {
    return {
      dealId,
      triggered: false,
      clawbackPercentage: 0,
      clawbackAmountPaise: 0,
      reason: "Past monitoring window",
    };
  }

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      amount: true,
      status: true,
      influencer: {
        select: {
          userId: true,
          user: { select: { id: true } },
        },
      },
      brand: { select: { userId: true } },
    },
  });

  if (!deal || deal.status !== "COMPLETED") {
    return {
      dealId,
      triggered: false,
      clawbackPercentage: 0,
      clawbackAmountPaise: 0,
      reason: deal ? "Deal is not completed; clawback skipped" : "Deal not found",
    };
  }

  const clawbackAmountPaise = Math.round(
    (deal.amount * clawbackPercentage) / 100,
  );
  const influencerUserId = deal.influencer.userId;
  const brandUserId = deal.brand?.userId;

  try {
    await prisma.$transaction(async (tx: any) => {
      // 1. Deduct from influencer wallet
      const influencerWallet = await tx.wallet.findUnique({
        where: { userId: influencerUserId },
      });

      if (influencerWallet) {
        // Clamp deduction to prevent negative balances
        const deductAmount = Math.max(0, Math.min(influencerWallet.balance, clawbackAmountPaise));
        const debtPending = clawbackAmountPaise - deductAmount;

        if (deductAmount > 0) {
          await tx.wallet.update({
            where: { userId: influencerUserId },
            data: { balance: { decrement: deductAmount } },
          });

          await tx.transaction.create({
            data: {
              walletId: influencerWallet.id,
              amount: deductAmount,
              type: "DEBIT",
              dealId,
              description: `Clawback (${clawbackPercentage}%) — Post ${reason} on day ${monitoringDay} of 30-day window${debtPending > 0 ? ` (Pending debt: ${debtPending} Paise)` : ""}`,
              status: "COMPLETED",
            },
          });
        }

        // 2. Credit brand only for funds actually recovered from influencer.
        if (brandUserId && deductAmount > 0) {
          const brandWallet = await tx.wallet.findUnique({
            where: { userId: brandUserId },
          });
          if (brandWallet) {
            await tx.wallet.update({
              where: { userId: brandUserId },
              data: { balance: { increment: deductAmount } },
            });
            await tx.transaction.create({
              data: {
                walletId: brandWallet.id,
                amount: deductAmount,
                type: "CREDIT",
                dealId,
                description: `Clawback refund — Influencer post ${reason} on day ${monitoringDay}${debtPending > 0 ? ` (Unrecovered debt: ${debtPending} paise)` : ""}`,
                status: "COMPLETED",
              },
            });
          }
        }
      }
    });

    logger.info("Clawback executed", {
      dealId,
      monitoringDay,
      clawbackPercentage,
      clawbackAmountPaise,
    });

    return {
      dealId,
      triggered: true,
      clawbackPercentage,
      clawbackAmountPaise,
      reason: `Post ${reason} on day ${monitoringDay} — ${clawbackPercentage}% clawback applied`,
    };
  } catch (error) {
    logger.error("Clawback execution failed", error, { dealId });
    return {
      dealId,
      triggered: false,
      clawbackPercentage,
      clawbackAmountPaise,
      reason: "Clawback execution failed due to error",
    };
  }
}

// ==================== BATCH MONITORING (CRON) ====================

/**
 * Run daily post monitoring for all deals in the 30-day window.
 * Returns summary of checks and any failures detected.
 */
export async function runDailyPostMonitoring(): Promise<{
  totalChecked: number;
  alive: number;
  failed: number;
  clawbacksTriggered: number;
  skipped: number;
}> {
  const thirtyOneDaysAgo = new Date(Date.now() - 31 * 86400 * 1000);

  // Monitor only completed deals because clawback requires a settled payout.
  const deals = await prisma.deal.findMany({
    where: {
      status: "COMPLETED",
      isPostAlive: true,
      postUrl: { not: null },
      OR: [
        { completedAt: { gte: thirtyOneDaysAgo } },
        { verifiedAt: { gte: thirtyOneDaysAgo } },
        { postedAt: { gte: thirtyOneDaysAgo } },
      ],
    },
    select: {
      id: true,
      completedAt: true,
      verifiedAt: true,
      postedAt: true,
    },
  });

  let totalChecked = 0;
  let alive = 0;
  let failed = 0;
  let clawbacksTriggered = 0;
  let skipped = 0;

  for (const deal of deals) {
    // Fallback chain: completedAt → verifiedAt → postedAt
    const referenceDate = deal.completedAt ?? deal.verifiedAt ?? deal.postedAt;

    if (!referenceDate) {
      // All three timestamps are null — shouldn't happen given the OR filter,
      // but guard defensively.
      logger.warn("Post monitor: deal has no usable reference date, skipping", {
        dealId: deal.id,
      });
      skipped++;
      continue;
    }

    const { shouldCheck, day } = shouldCheckToday(referenceDate);

    if (!shouldCheck) {
      skipped++;
      continue;
    }

    try {
      const result = await verifyPostStatus(deal.id);
      totalChecked++;

      if (result.isAlive) {
        alive++;
      } else {
        failed++;
        // Clawback is handled inside handlePostFailure
        if (day <= 30) clawbacksTriggered++;
      }
    } catch (error) {
      logger.error("Daily monitoring check failed", error, { dealId: deal.id });
      failed++;
    }

    // Rate limit: 100ms between checks to avoid overwhelming external services
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return { totalChecked, alive, failed, clawbacksTriggered, skipped };
}
