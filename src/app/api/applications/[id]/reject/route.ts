import { apiWrapper } from "@/lib/api-wrapper";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { routeParamsSchema } from "@/lib/validations";
import { ApplicationService } from "@/services/application.service";

const paramsSchema = routeParamsSchema;
const bodySchema = z.object({ reason: z.string().min(5).max(500).optional() });

async function _handler_POST(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[]>> },
) {
  try {
    const session = await auth();
    // Safe access as requireBrand is checked by apiWrapper
    const userId = session!.user!.id!;

    const resolvedParams = await context.params;
    const parsedParams = paramsSchema.safeParse(resolvedParams);
    if (!parsedParams.success) {
      return NextResponse.json(
        { success: false, message: "Invalid application ID" },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsedBody = bodySchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { success: false, message: "Invalid payload", data: parsedBody.error.format() },
        { status: 400 },
      );
    }

    const application = await ApplicationService.rejectApplication(
      userId,
      parsedParams.data.id,
      parsedBody.data.reason,
    );

    return NextResponse.json({
      success: true,
      message: "Application rejected",
      data: { application },
    });
  } catch (error: unknown) {
    logger.error("POST /api/applications/[id]/reject error", error);

    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("not found") || errorMsg.includes("Not authorized")) {
      return NextResponse.json(
        { success: false, message: errorMsg },
        { status: 404 },
      );
    }

    if (errorMsg.includes("pending")) {
      return NextResponse.json(
        { success: false, message: errorMsg },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: false, message: "Failed to reject application" },
      { status: 500 },
    );
  }
}

// Wrapped handlers via apiWrapper
export const POST = apiWrapper(_handler_POST, {
  requireBrand: true,
  brandErrorMessage: "Brand authorization required",
  userRateLimit: {
    bucket: "APPLICATIONS",
    errorMessage: "Too many application requests",
  },
});
