import { apiWrapper, ApiResponse } from "@/lib/api-wrapper";
import { NextRequest } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { dbIdSchema } from "@/lib/validations";
import { logger } from "@/lib/logger";
import { CampaignService } from "@/services/campaign.service";
import { requireActiveAdmin } from "@/lib/admin-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { parsePagination } from "@/lib/utils";

export const createCampaignSchema = z
  .object({
    title: z.string().min(3),
    description: z.string().min(10),
    requirements: z.string().min(10),
    guidelines: z.string().max(3000).optional(),

    totalBudget: z.number().int().min(1000, "Minimum campaign budget is ₹1,000"),
    perInfluencerBudget: z.number().int().min(500, "Minimum per-influencer budget is ₹500").optional(),
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
          rate: z.number().int().min(0).optional(),
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
    if (value.requiresProduct && value.totalBudget === 0) {
      if (value.productValue === undefined || value.productValue < 500) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["productValue"],
          message: "Product-only campaigns must specify a product value of at least ₹500",
        });
      }
      if (value.minFollowers !== undefined && value.minFollowers > 10000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["minFollowers"],
          message: "Product-only campaigns must target influencers with up to 10,000 followers",
        });
      }
    }

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

async function _handler_GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return ApiResponse.unauthorized();
    }

    const { searchParams } = new URL(request.url);
    const { page, limit, skip: _skip } = parsePagination(searchParams);

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

    const parsedMinBudget = minBudgetRupees ? Number(minBudgetRupees) : Number.NaN;
    const parsedMaxBudget = maxBudgetRupees ? Number(maxBudgetRupees) : Number.NaN;
    const minBudget = Number.isFinite(parsedMinBudget)
      ? toPaise(parsedMinBudget)
      : undefined;
    const maxBudget = Number.isFinite(parsedMaxBudget)
      ? toPaise(parsedMaxBudget)
      : undefined;

    const userId = session?.user?.id;
    const userType = session?.user?.userType;
    if (userType === "ADMIN") {
      await requireActiveAdmin(session.user);
    }

    const listParams: any = {
      page,
      limit,
      sortOrder,
      ownerOnly,
    };
    if (status) listParams.status = status;
    if (category) listParams.category = category;
    if (city) listParams.city = city;
    if (typeof minBudget === "number") listParams.minBudget = minBudget;
    if (typeof maxBudget === "number") listParams.maxBudget = maxBudget;
    if (sortBy) listParams.sortBy = sortBy;
    if (search) listParams.search = search;

    const list = await CampaignService.listCampaigns(userId, userType, listParams);

    return ApiResponse.success(
      {
        campaigns: list.campaigns,
        total: list.total,
        totalPages: list.totalPages,
        page,
        limit,
      },
      "Campaigns retrieved",
    );
  } catch (error: unknown) {
    logger.error("GET /api/campaigns error", error);
    return ApiResponse.error("Failed to list campaigns", 500);
  }
}

async function _handler_POST(request: NextRequest) {
  try {
    const session = await auth();
    const userType = session?.user?.userType;

    if (!session?.user?.id) {
      return ApiResponse.unauthorized();
    }

    if (userType !== "BRAND") {
      return ApiResponse.forbidden("Brand account required");
    }

    const limit = await checkRateLimit(session.user.id, "CAMPAIGNS");
    if (!limit.success) {
      return ApiResponse.tooManyRequests("Too many campaign requests");
    }

    const body = await request.json();
    const parsed = createCampaignSchema.safeParse(body);

    if (!parsed.success) {
      return ApiResponse.error("Invalid payload");
    }

    const payload = {
      ...parsed.data,
      totalBudget: toPaise(parsed.data.totalBudget),
      perInfluencerBudget:
        typeof parsed.data.perInfluencerBudget === "number"
          ? toPaise(parsed.data.perInfluencerBudget)
          : undefined,
      productValue:
        typeof parsed.data.productValue === "number"
          ? toPaise(parsed.data.productValue)
          : undefined,
      deliverables: parsed.data.deliverables.map((d) => ({
        ...d,
        rate: typeof d.rate === "number" ? toPaise(d.rate) : undefined,
      })),
    };

    const campaign = await CampaignService.createCampaign(
      session.user.id,
      userType,
      payload,
    );

    return ApiResponse.success(campaign, "Campaign created", 201);
  } catch (error: unknown) {
    logger.error("POST /api/campaigns error", error);

    const errWithTier = error as { tierError?: unknown; message?: string };
    if (errWithTier?.tierError) {
      return ApiResponse.forbidden(errWithTier.message || "Verification required");
    }

    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg?.includes("Insufficient wallet balance")) {
      return ApiResponse.error(errMsg);
    }

    if (errMsg?.includes("required") || errMsg?.includes("Invalid")) {
      return ApiResponse.error(errMsg);
    }

    return ApiResponse.error("Internal server error", 500);
  }
}


// Wrapped handlers via apiWrapper
export const GET = apiWrapper(_handler_GET);
export const POST = apiWrapper(_handler_POST);
