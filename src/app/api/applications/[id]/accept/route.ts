import { apiWrapper } from "@/lib/api-wrapper";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { routeParamsSchema } from "@/lib/validations";
import { ApplicationService } from "@/services/application.service";
import { logger } from "@/lib/logger";

const paramsSchema = routeParamsSchema;

async function _handler_POST(
  _request: NextRequest,
  context: { params: Promise<Record<string, string | string[]>> },
) {
  try {
    const session = await auth();
    // Safe access as requireBrand is checked by apiWrapper
    const userId = session!.user!.id!;

    const resolvedParams = await context.params;
    const parsedParams = paramsSchema.safeParse(resolvedParams);
    if (!parsedParams.success) return NextResponse.json({ success: false, message: "Invalid ID" }, { status: 400 });

    let customRate: number | undefined;
    try {
      const body = await _request.json();
      if (body?.customRate !== undefined) {
        // Validate customRate: must be a positive integer in paise, max ₹10 lakh (100_000_000 paise)
        const rateSchema = z.number()
          .int("customRate must be a whole number in paise")
          .positive("customRate must be positive")
          .max(100_000_000, "customRate cannot exceed ₹10,00,000 (100000000 paise)");
        const parsed = rateSchema.safeParse(body.customRate);
        if (!parsed.success) {
          return NextResponse.json(
            { success: false, message: parsed.error.issues[0]?.message || "Invalid customRate" },
            { status: 400 },
          );
        }
        customRate = parsed.data;
      }
    } catch {
      // Body parsing fails if request has no body, which is expected for default accepts
    }

    const deal = await ApplicationService.acceptApplication(
      userId,
      parsedParams.data.id,
      customRate,
    );

    return NextResponse.json({ success: true, message: "Application accepted, deal initiated.", data: deal }, { status: 200 });
  } catch (error: unknown) {
    logger.error("POST /api/applications/[id]/accept error", error);

    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes("not found") || errorMsg.includes("Not authorized")) {
      return NextResponse.json(
        { success: false, message: errorMsg },
        { status: 404 },
      );
    }

    if (
      errorMsg.includes("Insufficient") ||
      errorMsg.includes("budget") ||
      errorMsg.includes("pending")
    ) {
      return NextResponse.json(
        { success: false, message: errorMsg },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: false, message: "Failed to accept application" },
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
