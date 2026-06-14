import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { dbIdSchema } from "@/lib/validations";
import { logger } from "@/lib/logger";
import { CampaignService } from "@/services/campaign.service";
import { requireActiveAdmin } from "@/lib/admin-auth";

const createCampaignSchema = z
  .object({
    title: z.string().min(3),
    description: z.string().min(10),
    requirements: z.string().min(10),
    guidelines: z.string().max(3000).optional(),

    totalBudget: z.number().int().positive(),
    perInfluencerBudget: z.number().int().positive().optional(),
    maxInfluencers: z.number().int().min(1).max(100).nullable().optional(),

    targetCategories: z.array(z.string().min(1)).min(1),
    targetCities: z.array(z.string().min(1)).optional().default([]),
    targetLanguages: z.array(z.string().min(1)).optional().default([]),
    targetGender: z.enum(["ANY", "MALE", "FEMALE"]).optional(),
    targetAgeMin: z.number().int().min(13).max(100).nullable().optional(),
    targetAgeMax: z.number().int().min(13).max(100).nullable().optional(),
    minFollowers: z.number().int().min(0).optional().default(0),
    maxFollowers: z.number().int().min(0).optional().default(0),
    minEngagementRate: z.number().int().min(0).optional(),

    applicationDeadline: z.string().datetime().optional(),
    contentDeadline: z.string().datetime(),
    postingDeadline: z.string().datetime(),

    deliverables: z
      .array(
        z.object({
          type: z.string().min(1),
          count: z.number().int().min(1).max(50),
          specs: z.string().max(500).optional(),
        }),
      )
      .min(1),

    requiresProduct: z.boolean().optional().default(false),
    productName: z.string().max(200).optional(),
    productValue: z.number().int().min(0).optional(),
    productDescription: z.string().max(5000).optional(),

    invitedInfluencerId: dbIdSchema.optional(),
    status: z.enum(["DRAFT", "ACTIVE"]).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.perInfluencerBudget !== undefined &&
      value.perInfluencerBudget > value.totalBudget
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["perInfluencerBudget"],
        message: "Per influencer budget cannot exceed total budget",
      });
    }

    if (
      value.targetAgeMin !== null &&
      value.targetAgeMin !== undefined &&
      value.targetAgeMax !== null &&
      value.targetAgeMax !== undefined &&
      value.targetAgeMin > value.targetAgeMax
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetAgeMax"],
        message: "Maximum age must be greater than or equal to minimum age",
      });
    }
  });

function toPaise(amountInRupees: number): number {
  return Math.round(amountInRupees * 100);
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20),
      50,
    );

    const status = searchParams.get("status")?.toUpperCase() || undefined;
    const category = searchParams.get("category") || undefined;
    const city = searchParams.get("city") || undefined;
    const sortBy = searchParams.get("sortBy") || undefined;
    const sortOrder =
      searchParams.get("sortOrder") === "asc" ? "asc" : ("desc" as const);
    const search = searchParams.get("search") || undefined;
    const ownerOnly = searchParams.get("scope") === "mine";

    const minBudgetRupees = searchParams.get("minBudget");
    const maxBudgetRupees = searchParams.get("maxBudget");

    const parsedMinBudget = minBudgetRupees ? Number(minBudgetRupees) : NaN;
    const parsedMaxBudget = maxBudgetRupees ? Number(maxBudgetRupees) : NaN;
    const minBudget = Number.isFinite(parsedMinBudget)
      ? toPaise(parsedMinBudget)
      : undefined;
    const maxBudget = Number.isFinite(parsedMaxBudget)
      ? toPaise(parsedMaxBudget)
      : undefined;

    const userId = session?.user?.id;
    const userType = (session?.user as any)?.userType as string | undefined;
    if (userType === "ADMIN") {
      await requireActiveAdmin(session.user);
    }

    const list = await CampaignService.listCampaigns(userId, userType, {
      page,
      limit,
      sortOrder,
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
      ...(city ? { city } : {}),
      ...(minBudget !== undefined ? { minBudget } : {}),
      ...(maxBudget !== undefined ? { maxBudget } : {}),
      ...(sortBy ? { sortBy } : {}),
      ...(search ? { search } : {}),
      ownerOnly,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Campaigns retrieved",
        data: {
          campaigns: list.campaigns,
          total: list.total,
          totalPages: list.totalPages,
          page,
          limit,
        },
        campaigns: list.campaigns,
      },
      { status: 200 },
    );
  } catch (error: any) {
    logger.error("GET /api/campaigns error", error);
    return NextResponse.json(
      { success: false, message: "Failed to list campaigns" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
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

    const body = await request.json();
    const parsed = createCampaignSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid payload",
          data: parsed.error.format(),
        },
        { status: 400 },
      );
    }

    const payload = {
      ...parsed.data,
      totalBudget: toPaise(parsed.data.totalBudget),
      perInfluencerBudget:
        parsed.data.perInfluencerBudget !== undefined
          ? toPaise(parsed.data.perInfluencerBudget)
          : undefined,
      productValue:
        parsed.data.productValue !== undefined
          ? toPaise(parsed.data.productValue)
          : undefined,
    };

    const campaign = await CampaignService.createCampaign(
      session.user.id,
      userType,
      payload,
    );

    return NextResponse.json(
      { success: true, message: "Campaign created", data: campaign },
      { status: 201 },
    );
  } catch (error: any) {
    logger.error("POST /api/campaigns error", error);

    if (error?.tierError) {
      return NextResponse.json(
        {
          success: false,
          message: error.message || "Verification required",
          data: error.tierError,
        },
        { status: 403 },
      );
    }

    if (error?.message?.includes("Insufficient wallet balance")) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 },
      );
    }

    if (error?.message?.includes("required") || error?.message?.includes("Invalid")) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 },
    );
  }
}
