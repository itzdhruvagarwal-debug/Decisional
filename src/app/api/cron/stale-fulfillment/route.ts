import { NextRequest, NextResponse } from "next/server";
import { apiWrapper } from "@/lib/api-wrapper";
import { validateCronSecret } from "../guard";
import prisma from "@/lib/db";
import { DisputeType } from "@prisma/client";
import { NotificationService } from "@/services/notification.service";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

/**
 * Stale Product Fulfillment Scanner — Daily Cron
 * ──────────────────────────────────────────────
 * Scans deals stuck in READY_TO_DISPATCH or DISPATCHED state.
 *
 * Thresholds:
 *   7+ days  → reminder notification to both parties
 *   14+ days → auto-escalate: create a PRODUCT_NOT_RECEIVED dispute and
 *               notify both parties + all admins
 *
 * Safety: only touches deals where status = PAYMENT_HELD (escrow active)
 * and requiresProduct = true. Deals with an existing open dispute are skipped.
 *
 * Schedule: 0 10 * * * (daily at 10:00 AM UTC / 3:30 PM IST)
 */

const REMINDER_DAYS = 7;
const ESCALATION_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 200;
const LOCK_KEY = "cron:stale_fulfillment:lock";
const LOCK_TTL_SECS = 300;

interface StaleDeal {
  id: string;
  productFulfillmentStatus: string;
  updatedAt: Date;
  dispatchedAt: Date | null;
  campaign: { title: string };
  influencer: { userId: string; displayName: string | null };
  brand: { userId: string; companyName: string | null } | null;
}

function getStaleDays(deal: StaleDeal): number {
  // For DISPATCHED, measure from when it was dispatched.
  // For READY_TO_DISPATCH, measure from last status change (updatedAt).
  const anchor =
    deal.productFulfillmentStatus === "DISPATCHED" && deal.dispatchedAt
      ? deal.dispatchedAt
      : deal.updatedAt;
  return Math.floor((Date.now() - anchor.getTime()) / MS_PER_DAY);
}

async function hasOpenDispute(dealId: string): Promise<boolean> {
  const existing = await prisma.dispute.findFirst({
    where: {
      dealId,
      status: { in: ["OPEN", "TIER1_AUTO", "TIER2_MEDIATION"] },
    },
    select: { id: true },
  });
  return existing !== null;
}

async function sendReminderNotifications(deal: StaleDeal, staleDays: number) {
  const campaignTitle = deal.campaign.title;
  const influencerName = deal.influencer.displayName || "Influencer";
  const brandName = deal.brand?.companyName || "Brand";
  const dealLink = `/dashboard/deals/${deal.id}`;

  const notifications: Parameters<typeof NotificationService.createNotifications>[0] = [];

  if (deal.productFulfillmentStatus === "READY_TO_DISPATCH") {
    // Brand hasn't dispatched yet
    if (deal.brand?.userId) {
      notifications.push({
        userId: deal.brand.userId,
        type: "deal_update",
        title: `⚠️ Product dispatch overdue — ${staleDays} days`,
        message: `The deal "${campaignTitle}" with ${influencerName} is waiting for you to dispatch the product. It has been ${staleDays} day${staleDays === 1 ? "" : "s"} since the shipping address was submitted. Please dispatch soon to avoid escalation.`,
        data: { link: dealLink, dealId: deal.id, staleDays, type: "stale_fulfillment_reminder" },
      });
    }
    if (deal.influencer?.userId) {
      notifications.push({
        userId: deal.influencer.userId,
        type: "deal_update",
        title: `⏳ Awaiting product dispatch — ${staleDays} days`,
        message: `The brand ${brandName} has not yet dispatched the product for "${campaignTitle}". It has been ${staleDays} day${staleDays === 1 ? "" : "s"}. You may raise a dispute if needed.`,
        data: { link: dealLink, dealId: deal.id, staleDays, type: "stale_fulfillment_reminder" },
      });
    }
  } else {
    // DISPATCHED — influencer hasn't confirmed receipt
    if (deal.influencer?.userId) {
      notifications.push({
        userId: deal.influencer.userId,
        type: "deal_update",
        title: `⚠️ Please confirm product received — ${staleDays} days in transit`,
        message: `The product for "${campaignTitle}" has been marked as dispatched by ${brandName} and has been in transit for ${staleDays} day${staleDays === 1 ? "" : "s"}. Please confirm receipt once you have the product.`,
        data: { link: dealLink, dealId: deal.id, staleDays, type: "stale_fulfillment_reminder" },
      });
    }
    if (deal.brand?.userId) {
      notifications.push({
        userId: deal.brand.userId,
        type: "deal_update",
        title: `⏳ Product receipt unconfirmed — ${staleDays} days`,
        message: `${influencerName} has not yet confirmed receipt of the product for "${campaignTitle}". It has been ${staleDays} day${staleDays === 1 ? "" : "s"} since dispatch. Please follow up.`,
        data: { link: dealLink, dealId: deal.id, staleDays, type: "stale_fulfillment_reminder" },
      });
    }
  }

  if (notifications.length > 0) {
    await NotificationService.createNotifications(notifications);
  }
}

async function autoEscalateToDispute(deal: StaleDeal, staleDays: number) {
  const campaignTitle = deal.campaign.title;
  const dealLink = `/dashboard/deals/${deal.id}`;

  try {
    // Find a system admin to raise the dispute on behalf of the system
    const adminUser = await prisma.user.findFirst({
      where: { userType: "ADMIN" },
      select: { id: true },
    });

    if (!adminUser) {
      logger.error("STALE_FULFILLMENT: Cannot auto-escalate — no admin users found", {
        dealId: deal.id,
      });
      return false;
    }

    // Create dispute inside a transaction
    await prisma.$transaction(async (tx) => {
      // Check once more inside transaction that there's no open dispute
      const existingDispute = await tx.dispute.findFirst({
        where: {
          dealId: deal.id,
          status: { in: ["OPEN", "TIER1_AUTO", "TIER2_MEDIATION"] },
        },
        select: { id: true },
      });
      if (existingDispute) return;

      // Flip the deal status to DISPUTED
      await tx.deal.update({
        where: { id: deal.id },
        data: { status: "DISPUTED" },
      });

      // Create the dispute record
      await tx.dispute.create({
        data: {
          dealId: deal.id,
          raisedByUserId: adminUser.id,
          type: "OTHER" as DisputeType,
          status: "TIER1_AUTO",
          description:
            `Auto-escalated by system after ${staleDays} days with no fulfillment progress. ` +
            `Fulfillment status was "${deal.productFulfillmentStatus}" at time of escalation. ` +
            `Admin review required to resolve.`,
          dealStatusAtCreation: deal.productFulfillmentStatus,
        },
      });

      // Notify both parties
      const escalationNotifications: Parameters<
        typeof NotificationService.createNotifications
      >[0] = [];

      if (deal.brand?.userId) {
        escalationNotifications.push({
          userId: deal.brand.userId,
          type: "dispute",
          title: `🚨 Deal auto-escalated to dispute`,
          message: `The deal "${campaignTitle}" has been automatically escalated to a dispute after ${staleDays} days without fulfillment progress. An admin will review and resolve this.`,
          data: { link: dealLink, dealId: deal.id, staleDays, type: "stale_fulfillment_escalation" },
        });
      }

      if (deal.influencer?.userId) {
        escalationNotifications.push({
          userId: deal.influencer.userId,
          type: "dispute",
          title: `🚨 Deal auto-escalated to dispute`,
          message: `The deal "${campaignTitle}" has been automatically escalated to a dispute after ${staleDays} days without fulfillment progress. An admin will review and resolve this.`,
          data: { link: dealLink, dealId: deal.id, staleDays, type: "stale_fulfillment_escalation" },
        });
      }

      if (escalationNotifications.length > 0) {
        await NotificationService.createNotifications(escalationNotifications, tx);
      }
    });

    // Notify all admins about the escalation
    const allAdmins = await prisma.user.findMany({
      where: { userType: "ADMIN" },
      select: { id: true },
    });

    if (allAdmins.length > 0) {
      await NotificationService.createNotifications(
        allAdmins.map((admin) => ({
          userId: admin.id,
          type: "admin_alert" as const,
          title: `🚨 System auto-escalated stale deal`,
          message: `Deal ${deal.id} ("${campaignTitle}") was stuck in "${deal.productFulfillmentStatus}" for ${staleDays} days and has been auto-escalated to a TIER1_AUTO dispute. Manual review required.`,
          data: { link: dealLink, dealId: deal.id, staleDays, type: "stale_fulfillment_escalation" },
        })),
      );
    }

    return true;
  } catch (err) {
    logger.error("STALE_FULFILLMENT: Auto-escalation failed", { dealId: deal.id, error: err });
    return false;
  }
}

async function scanStaleFulfillmentDeals(): Promise<{
  scanned: number;
  reminded: number;
  escalated: number;
  skipped: number;
}> {
  let scanned = 0;
  let reminded = 0;
  let escalated = 0;
  let skipped = 0;
  let cursor: string | undefined = undefined;
  let hasMore = true;

  while (hasMore) {
    const batch = (await prisma.deal.findMany({
      where: {
        requiresProduct: true,
        productFulfillmentStatus: { in: ["READY_TO_DISPATCH", "DISPATCHED"] },
        status: "PAYMENT_HELD",
        deletedAt: null,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: {
        id: true,
        productFulfillmentStatus: true,
        updatedAt: true,
        dispatchedAt: true,
        campaign: { select: { title: true } },
        influencer: { select: { userId: true, displayName: true } },
        brand: { select: { userId: true, companyName: true } },
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
    })) as StaleDeal[];

    scanned += batch.length;
    hasMore = batch.length === BATCH_SIZE;
    if (batch.length > 0) {
      cursor = batch[batch.length - 1]!.id;
    }

    for (const deal of batch) {
      const staleDays = getStaleDays(deal as StaleDeal);

      if (staleDays < REMINDER_DAYS) {
        skipped++;
        continue;
      }

      // Check for existing open dispute — skip if already in dispute
      const alreadyDisputed = await hasOpenDispute(deal.id);
      if (alreadyDisputed) {
        skipped++;
        continue;
      }

      if (staleDays >= ESCALATION_DAYS) {
        const escalated_ = await autoEscalateToDispute(deal as StaleDeal, staleDays);
        if (escalated_) {
          escalated++;
          logger.info("STALE_FULFILLMENT: Auto-escalated deal", {
            dealId: deal.id,
            staleDays,
            status: deal.productFulfillmentStatus,
          });
        } else {
          skipped++;
        }
      } else {
        // 7–13 days: send reminder
        await sendReminderNotifications(deal as StaleDeal, staleDays);
        reminded++;
        logger.info("STALE_FULFILLMENT: Sent reminder for stale deal", {
          dealId: deal.id,
          staleDays,
          status: deal.productFulfillmentStatus,
        });
      }
    }
  }

  return { scanned, reminded, escalated, skipped };
}

async function _handler_POST(_req: NextRequest) {
  await validateCronSecret();

  // Redis lock to prevent concurrent runs
  const acquired = await redis.set(LOCK_KEY, "LOCKED", "EX", LOCK_TTL_SECS, "NX");
  if (!acquired) {
    logger.info("STALE_FULFILLMENT: Already running, skipping to avoid race condition.");
    return NextResponse.json({
      success: true,
      message: "Stale fulfillment scan already running — skipped",
      data: { locked: true },
    });
  }

  try {
    const result = await scanStaleFulfillmentDeals();

    logger.info("STALE_FULFILLMENT: Scan complete", result);

    return NextResponse.json({
      success: true,
      message: `Stale fulfillment scan complete — ${result.reminded} reminded, ${result.escalated} escalated`,
      data: {
        ...result,
        scannedAt: new Date().toISOString(),
      },
    });
  } finally {
    await redis.del(LOCK_KEY);
  }
}

export const POST = apiWrapper(_handler_POST);
