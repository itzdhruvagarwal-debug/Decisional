import { auth } from "@/lib/auth";
import { apiWrapper, ApiResponse } from "@/lib/api-wrapper";
import { DealService } from "@/services/deal.service";
import {
  contentSubmissionSchema,
  contentApprovalSchema,
  postVerificationSchema,
} from "@/lib/validations";
import { requireActiveAdmin } from "@/lib/admin-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { parsePagination } from "@/lib/utils";

export const GET = apiWrapper(async (req) => {
  const session = await auth();
  if (!session?.user?.id) {
    return ApiResponse.unauthorized();
  }

  const { searchParams } = new URL(req.url);
  const { page, limit } = parsePagination(searchParams);
  const status = searchParams.get("status");

  if (session.user.userType === "ADMIN") {
    await requireActiveAdmin(session.user);
  }

  const result = await DealService.listDeals(
    session.user.id,
    session.user.userType,
    {
      ...(status ? { status } : {}),
      page,
      limit,
    },
  );

  return ApiResponse.success(
    {
      deals: result.deals,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
      stats: result.stats,
    },
    "Deals retrieved successfully",
  );
});

export const POST = apiWrapper(async (req) => {
  const session = await auth();
  if (!session?.user?.id) {
    return ApiResponse.unauthorized();
  }

  const limit = await checkRateLimit(session.user.id, "DEAL_UPDATES");
  if (!limit.success) {
    return ApiResponse.tooManyRequests("Too many deal update requests");
  }

  const body = await req.json();
  const action = body.action;

  if (action === "submit_content") {
    if (session.user.userType !== "INFLUENCER") {
      return ApiResponse.forbidden("Influencer access required");
    }
    const parsed = contentSubmissionSchema.parse(body);
    const result = await DealService.submitContent(
      session.user.id,
      parsed.dealId,
      parsed.contentUrl || "",
      parsed.notes,
      parsed.contentUrls,
    );
    return ApiResponse.success(result, "Content submitted");
  }

  if (action === "review_content") {
    if (session.user.userType !== "BRAND") {
      return ApiResponse.forbidden("Brand access required");
    }
    const parsed = contentApprovalSchema.parse(body);
    if (parsed.approved && !parsed.reviews) {
      await DealService.approveContent(session.user.id, parsed.dealId);
      return ApiResponse.success(null, "Content approved");
    } else {
      const result = await DealService.reviewContent(
        session.user.id,
        parsed.dealId,
        parsed.reviews || []
      );
      return ApiResponse.success(result, "Content reviewed");
    }
  }

  if (action === "verify_post") {
    if (session.user.userType !== "INFLUENCER") {
      return ApiResponse.forbidden("Influencer access required");
    }
    const parsed = postVerificationSchema.parse(body);
    await DealService.verifyPost(
      session.user.id,
      parsed.dealId,
      parsed.postUrl,
    );
    return ApiResponse.success(null, "Post verified");
  }

  return ApiResponse.error("Invalid action");
});
