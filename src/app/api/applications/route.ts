import { apiWrapper, ApiResponse } from "@/lib/api-wrapper";
import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { ApplicationService } from "@/services/application.service";
import { logger } from "@/lib/logger";
import { dbIdSchema } from "@/lib/validations";
import { requireActiveAdmin } from "@/lib/admin-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { parsePagination } from "@/lib/utils";

async function _handler_GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return ApiResponse.unauthorized();
    }

    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaignId");
    const { page, limit, skip: _skip } = parsePagination(searchParams);

    const userType = session.user.userType || "INFLUENCER";
    if (userType === "ADMIN") {
      await requireActiveAdmin(session.user);
    }

    const apps = await ApplicationService.listApplications(
      session.user.id,
      userType,
      {
        ...(campaignId ? { campaignId } : {}),
        page,
        limit,
      },
    );

    return ApiResponse.success(apps, "Applications loaded");
  } catch (error: unknown) {
    logger.error("GET /api/applications error", { error: (error instanceof Error ? error.message : String(error)) });
    return ApiResponse.error("Internal server error", 500);
  }
}

const applySchema = z.object({
  campaignId: dbIdSchema,
  proposal: z.string().min(10),
  proposedRate: z.number().positive(),
  estimatedDeliveryDays: z.number().int().positive().max(90).optional(),
});

async function _handler_POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || session.user.userType !== "INFLUENCER") {
      return ApiResponse.forbidden("Influencer account required");
    }

    const limit = await checkRateLimit(session.user.id, "APPLICATIONS");
    if (!limit.success) {
      return ApiResponse.tooManyRequests("Too many application requests");
    }

    const body = await request.json();
    const parsed = applySchema.safeParse(body);
    if (!parsed.success) return ApiResponse.error("Invalid payload");

    const application = await ApplicationService.createApplication(session.user.id, {
      ...parsed.data,
      ...(parsed.data.estimatedDeliveryDays
        ? {
          estimatedDelivery: new Date(
            Date.now() + parsed.data.estimatedDeliveryDays * 24 * 60 * 60 * 1000,
          ).toISOString(),
        }
        : {}),
    });
    return ApiResponse.success(application, "Application submitted", 201);
  } catch (error: unknown) {
    logger.error("POST /api/applications error", { error: (error instanceof Error ? error.message : String(error)) });
    const message = (error instanceof Error ? error.message : String(error)) || "Submission failed";
    const isBusinessValidation =
      message.includes("Already applied") ||
      message.includes("already applied") ||
      message.includes("complete your") ||
      message.includes("must") ||
      message.includes("required") ||
      message.includes("not accepting") ||
      message.includes("deadline") ||
      message.includes("Verification") ||
      message.includes("Trust score") ||
      message.includes("Limited by") ||
      message.includes("blocked");

    if (isBusinessValidation) {
      return ApiResponse.error(message);
    }

    return ApiResponse.error("Submission failed", 500);
  }
}


// Wrapped handlers via apiWrapper
export const GET = apiWrapper(_handler_GET);
export const POST = apiWrapper(_handler_POST);
