/**
 * Deal Engagement API
 * GET: Fetch engagement metrics for a deal
 * POST: Manually trigger engagement capture (admin/cron)
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import {
  getEngagementReport,
  captureEngagement,
} from "@/lib/engagement-tracker";
import { logger } from "@/lib/logger";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    // Verify access to this deal
    const deal = await prisma.deal.findUnique({
      where: { id },
      include: {
        influencer: { select: { userId: true } },
        brand: { select: { userId: true } },
      },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const isInfluencer = deal.influencer.userId === session.user.id;
    const isBrand = deal.brand?.userId === session.user.id;

    if (!isInfluencer && !isBrand) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const report = await getEngagementReport(id);

    return NextResponse.json({ engagement: report });
  } catch (error) {
    logger.error("Engagement fetch error", error);
    return NextResponse.json(
      { error: "Failed to fetch engagement" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const interval = body.interval;
    if (!["24h", "48h", "7d"].includes(interval)) {
      return NextResponse.json(
        { error: "Invalid interval. Must be 24h, 48h, or 7d" },
        { status: 400 },
      );
    }

    // Verify deal ownership
    const deal = await prisma.deal.findUnique({
      where: { id },
      include: {
        influencer: { select: { userId: true } },
        brand: { select: { userId: true } },
      },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const isInfluencer = deal.influencer.userId === session.user.id;
    const isBrand = deal.brand?.userId === session.user.id;

    if (!isInfluencer && !isBrand) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (!deal.postUrl) {
      return NextResponse.json(
        { error: "No post URL found. Post must be verified first." },
        { status: 400 },
      );
    }

    const metrics = await captureEngagement(id, interval);

    if (!metrics) {
      return NextResponse.json(
        { error: "Failed to capture engagement metrics" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      interval,
      metrics,
    });
  } catch (error) {
    logger.error("Engagement capture error", error);
    return NextResponse.json(
      { error: "Engagement capture failed" },
      { status: 500 },
    );
  }
}
