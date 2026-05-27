import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { dbIdSchema } from "@/lib/validations";
import { CampaignService } from "@/services/campaign.service";
import { requireActiveAdmin } from "@/lib/admin-auth";

const paramsSchema = z.object({ id: dbIdSchema });
const actionSchema = z.object({ action: z.enum(["ACTIVATE", "CANCEL"]) });

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
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

    const userType = (session?.user as any)?.userType;
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

    return NextResponse.json(
      {
        success: true,
        message: "Campaign loaded",
        data: { campaign },
        campaign,
      },
      { status: 200 },
    );
  } catch (error: any) {
    logger.error("GET /api/campaigns/[id]", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    const userType = (session?.user as any)?.userType;

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }

    if (userType !== "BRAND") {
      return NextResponse.json(
        { success: false, message: "Brand account required" },
        { status: 403 },
      );
    }

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
        ? await CampaignService.activateDraftCampaign(session.user.id, parsedParams.data.id)
        : await CampaignService.cancelCampaign(session.user.id, parsedParams.data.id);

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
  } catch (error: any) {
    logger.error("PATCH /api/campaigns/[id]", error);

    if (
      error?.message?.includes("not found") ||
      error?.message?.includes("unauthorized")
    ) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 404 },
      );
    }

    if (error?.message?.includes("Insufficient wallet balance")) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 },
      );
    }

    if (error?.message?.includes("Cannot cancel") || error?.message?.includes("DRAFT")) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: false, message: "Failed to update campaign" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    const userType = (session?.user as any)?.userType;

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }

    if (userType !== "BRAND") {
      return NextResponse.json(
        { success: false, message: "Brand account required" },
        { status: 403 },
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

    await CampaignService.cancelCampaign(session.user.id, parsed.data.id);

    return NextResponse.json(
      { success: true, message: "Campaign cancelled successfully" },
      { status: 200 },
    );
  } catch (error: any) {
    logger.error("DELETE /api/campaigns/[id]", error);

    if (error?.message?.includes("not found") || error?.message?.includes("unauthorized")) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 404 },
      );
    }

    if (error?.message?.includes("Cannot cancel")) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: false, message: "Failed to cancel campaign" },
      { status: 500 },
    );
  }
}
