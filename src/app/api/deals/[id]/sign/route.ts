/**
 * Contract Signing API Route
 *
 * POST /api/deals/[id]/sign
 *
 * Signs a deal contract on behalf of the authenticated user.
 * Uses the contract engine's digital signature system (SHA-256 HMAC).
 * Auto-transitions deal to ACTIVE when both parties have signed.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { signAndSaveDealContract } from "@/lib/contract-engine";
import { logger } from "@/lib/logger";
import { dbIdSchema } from "@/lib/validations";
import { invalidate } from "@/lib/cache";

const paramsSchema = z.object({ id: dbIdSchema });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const resolvedParams = await params;
    const parsedParams = paramsSchema.safeParse(resolvedParams);
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid deal ID" }, { status: 400 });
    }

    const dealId = parsedParams.data.id;
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get deal to determine user's role
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        influencer: { select: { userId: true, displayName: true } },
        brand: { select: { userId: true, companyName: true } },
        campaign: { select: { title: true } },
      },
    });

    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    if (deal.status !== "PENDING_SIGNATURE") {
      return NextResponse.json(
        { error: "Deal is not pending signature" },
        { status: 400 },
      );
    }

    // Determine role
    const isInfluencer = deal.influencer.userId === session.user.id;
    const isBrand = deal.brand?.userId === session.user.id;

    if (!isInfluencer && !isBrand) {
      return NextResponse.json(
        { error: "You are not a party to this deal" },
        { status: 403 },
      );
    }

    const role: "INFLUENCER" | "BRAND" = isInfluencer ? "INFLUENCER" : "BRAND";

    // Extract IP and user agent for audit trail
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    // Use the contract engine to sign
    const result = await signAndSaveDealContract(
      dealId,
      session.user.id,
      role,
      ipAddress,
      userAgent,
    );
    await invalidate(`deal:${dealId}`);

    // Send notification to the counterparty
    const counterpartyUserId = isInfluencer
      ? deal.brand?.userId
      : deal.influencer.userId;

    if (counterpartyUserId) {
      const signerName = isInfluencer
        ? deal.influencer.displayName
        : deal.brand?.companyName;

      await prisma.notification.create({
        data: {
          userId: counterpartyUserId,
          type: result.signed.isFullySigned ? "deal_update" : "deal_update",
          title: result.signed.isFullySigned
            ? "Contract Fully Signed"
            : "Contract Signed",
          message: result.signed.isFullySigned
            ? `Both parties have signed the contract for "${deal.campaign.title}". The deal is now active!`
            : `${signerName || "The other party"} has signed the contract for "${deal.campaign.title}". Please sign to activate the deal.`,
          data: { link: `/dashboard/deals/${dealId}` },
        },
      });
    }

    logger.info("Contract signed via dedicated route", {
      dealId,
      userId: session.user.id,
      role,
      isFullySigned: result.signed.isFullySigned,
    });

    return NextResponse.json({
      success: true,
      message: result.message,
      isFullySigned: result.signed.isFullySigned,
      signedAt: result.signed.signedAt,
    });
  } catch (error: unknown) {
    // Handle known contract engine errors gracefully with safe static messages
    const msg = error instanceof Error ? error.message : "";

    if (msg.includes("already signed")) {
      return NextResponse.json(
        { error: "This contract has already been signed" },
        { status: 409 },
      );
    }

    if (msg.includes("pending signature")) {
      return NextResponse.json(
        { error: "Deal is not pending signature" },
        { status: 400 },
      );
    }

    if (msg.includes("not the")) {
      return NextResponse.json(
        { error: "You are not authorized to sign this contract" },
        { status: 403 },
      );
    }

    logger.error("Contract signing error", error);
    return NextResponse.json(
      { error: "Failed to sign contract. Please try again." },
      { status: 500 },
    );
  }
}
