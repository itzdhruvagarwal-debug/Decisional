import { apiWrapper, ApiResponse, type AuthenticatedRequest } from "@/lib/api-wrapper";
import { NextRequest } from "next/server";
import { UserType } from "@prisma/client";

import { isAdmin } from "@/lib/rbac";
import { createCampaignSchema } from "@/lib/validations";
import { logger } from "@/lib/logger";
import { CampaignService, type ListCampaignsParams } from "@/services/campaign.service";
import { requireActiveAdmin } from "@/lib/admin-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { parsePagination } from "@/lib/utils";

function toPaise(amountInRupees: number): number {
  return Math.round(amountInRupees * 100);
}

async function _handler_GET(request: NextRequest) {
  try {
    const session = (request as AuthenticatedRequest).session;

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
    
    if (isAdmin(userType)) {
      await requireActiveAdmin(session.user);
    }

    const listParams: ListCampaignsParams = {
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
    const session = (request as AuthenticatedRequest).session;
    const userType = session.user.userType;

    // After permission check, userType is guaranteed to be BRAND
    const safeUserType = userType as UserType;

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
      safeUserType,
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
export const GET = apiWrapper(_handler_GET, { requireAuth: true });
export const POST = apiWrapper(_handler_POST, { requirePermission: "CREATE_CAMPAIGN" });
