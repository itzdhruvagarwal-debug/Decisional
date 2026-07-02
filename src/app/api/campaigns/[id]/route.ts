import { apiWrapper } from "@/lib/api-wrapper";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { createCampaignSchema } from "@/app/api/campaigns/route";
import { logger } from "@/lib/logger";
import { routeParamsSchema } from "@/lib/validations";
import { CampaignService } from "@/services/campaign.service";
import { requireActiveAdmin } from "@/lib/admin-auth";
import prisma from "@/lib/db";

const paramsSchema = routeParamsSchema;
const actionSchema = z.object({ action: z.enum(["ACTIVATE", "CANCEL"]) });

async function _handler_GET(
  _request: NextRequest,
  context: { params: Promise<Record<string, string | string[]>> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }

    const resolvedParams = await context.params;
    const parsed = paramsSchema.safeParse(resolvedParams);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Invalid campaign ID" },
        { status: 400 },
      );
    }

    const userType = session.user.userType;
    if (userType === "ADMIN") {
      await requireActiveAdmin(session.user);
    }

    const campaign = await CampaignService.getCampaignById(
      parsed.data.id,
      session.user.id,
      userType,
    );

    if (!campaign) {
      return NextResponse.json(
        { success: false, message: "Campaign not found" },
        { status: 404 },
      );
    }

    let hasApplied = false;
    let applicationStatus: string | null = null;

    if (userType === "INFLUENCER") {
      const influencerProfile = await prisma.influencerProfile.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      });
      if (influencerProfile) {
        const application = await prisma.application.findFirst({
          where: {
            campaignId: parsed.data.id,
            influencerId: influencerProfile.id,
          },
          select: { status: true },
        });
        if (application) {
          hasApplied = true;
          applicationStatus = application.status;
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: "Campaign loaded",
        data: { campaign, hasApplied, applicationStatus },
        campaign: {
          ...campaign,
          hasApplied,
          applicationStatus,
        },
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    logger.error("GET /api/campaigns/[id]", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 },
    );
  }
}

async function _handler_PATCH(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[]>> },
) {
  try {
    const session = await auth();
    const userId = session!.user!.id!;

    const resolvedParams = await context.params;
    const parsedParams = paramsSchema.safeParse(resolvedParams);
    if (!parsedParams.success) {
      return NextResponse.json(
        { success: false, message: "Invalid campaign ID" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsedBody = actionSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { success: false, message: "Invalid action" },
        { status: 400 },
      );
    }

    const action = parsedBody.data.action;
    const campaign =
      action === "ACTIVATE"
        ? await CampaignService.activateDraftCampaign(userId, parsedParams.data.id)
        : await CampaignService.cancelCampaign(userId, parsedParams.data.id);

    return NextResponse.json(
      {
        success: true,
        message:
          action === "ACTIVATE"
            ? "Campaign activated successfully"
            : "Campaign cancelled successfully",
        data: { campaign },
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    logger.error("PATCH /api/campaigns/[id]", error);

    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("not found") || errorMsg.includes("unauthorized")) {
      return NextResponse.json(
        { success: false, message: errorMsg },
        { status: 404 },
      );
    }

    if (errorMsg.includes("Insufficient wallet balance")) {
      return NextResponse.json(
        { success: false, message: errorMsg },
        { status: 400 },
      );
    }

    if (errorMsg.includes("Cannot cancel") || errorMsg.includes("DRAFT")) {
      return NextResponse.json(
        { success: false, message: errorMsg },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: false, message: "Failed to update campaign" },
      { status: 500 },
    );
  }
}

async function _handler_DELETE(
  _request: NextRequest,
  context: { params: Promise<Record<string, string | string[]>> },
) {
  try {
    const session = await auth();
    const userId = session!.user!.id!;

    const resolvedParams = await context.params;
    const parsed = paramsSchema.safeParse(resolvedParams);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Invalid campaign ID" },
        { status: 400 },
      );
    }

    await CampaignService.cancelCampaign(userId, parsed.data.id);

    return NextResponse.json(
      { success: true, message: "Campaign cancelled successfully" },
      { status: 200 },
    );
  } catch (error: unknown) {
    logger.error("DELETE /api/campaigns/[id]", error);

    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("not found") || errorMsg.includes("unauthorized")) {
      return NextResponse.json(
        { success: false, message: errorMsg },
        { status: 404 },
      );
    }

    if (errorMsg.includes("Cannot cancel")) {
      return NextResponse.json(
        { success: false, message: errorMsg },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: false, message: "Failed to cancel campaign" },
      { status: 500 },
    );
  }
}

async function _handler_PUT(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[]>> },
) {
  try {
    const session = await auth();
    const userId = session!.user!.id!;

    const resolvedParams = await context.params;
    const parsedParams = paramsSchema.safeParse(resolvedParams);
    if (!parsedParams.success) {
      return NextResponse.json(
        { success: false, message: "Invalid campaign ID" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsedBody = createCampaignSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid payload",
          data: parsedBody.error.format(),
        },
        { status: 400 },
      );
    }

    const toPaise = (amountInRupees: number) => Math.round(amountInRupees * 100);
    const payload = {
      ...parsedBody.data,
      totalBudget: toPaise(parsedBody.data.totalBudget),
      perInfluencerBudget:
        parsedBody.data.perInfluencerBudget !== undefined
          ? toPaise(parsedBody.data.perInfluencerBudget)
          : undefined,
      productValue:
        parsedBody.data.productValue !== undefined
          ? toPaise(parsedBody.data.productValue)
          : undefined,
      deliverables: parsedBody.data.deliverables.map((d) => ({
        ...d,
        rate: d.rate !== undefined ? toPaise(d.rate) : undefined,
      })),
    };

    const campaign = await CampaignService.updateDraftCampaign(
      parsedParams.data.id,
      userId,
      payload,
    );

    return NextResponse.json(
      { success: true, message: "Campaign updated successfully", data: campaign },
      { status: 200 },
    );
  } catch (error: unknown) {
    logger.error("PUT /api/campaigns/[id]", error);
    
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("not found") || errorMsg.includes("unauthorized")) {
      return NextResponse.json(
        { success: false, message: errorMsg },
        { status: 404 },
      );
    }
    
    if (errorMsg.includes("only be updated in DRAFT")) {
      return NextResponse.json(
        { success: false, message: errorMsg },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: false, message: "Failed to update campaign" },
      { status: 500 },
    );
  }
}

// Wrapped handlers via apiWrapper
export const GET = apiWrapper(_handler_GET);

const brandWriteOptions = {
  requireBrand: true,
  brandErrorMessage: "Brand account required",
  userRateLimit: {
    bucket: "CAMPAIGNS",
    errorMessage: "Too many campaign requests",
  },
} as const;

export const PUT = apiWrapper(_handler_PUT, brandWriteOptions);
export const DELETE = apiWrapper(_handler_DELETE, brandWriteOptions);
export const PATCH = apiWrapper(_handler_PATCH, brandWriteOptions);
