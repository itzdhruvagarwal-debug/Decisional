import { apiWrapper } from "@/lib/api-wrapper";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { routeParamsSchema, contentSubmissionSchema } from "@/lib/validations";
import { DealService } from "@/services/deal.service";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { getErrorMessage } from "@/lib/utils";

const paramsSchema = routeParamsSchema;
const submitContentBodySchema = contentSubmissionSchema.omit({ dealId: true });

async function _handler_POST(
  request: NextRequest,
  { params }: { params: Promise<Record<string, string | string[]>> },
) {
  try {
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid deal ID" }, { status: 400 });
    }

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limit = await checkRateLimit(session.user.id, "DEAL_UPDATES");
    if (!limit.success) {
      return NextResponse.json(
        { error: "Too many deal update requests" },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsedBody = submitContentBodySchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsedBody.error.flatten() },
        { status: 400 },
      );
    }

    const submission = await DealService.submitContent(
      session.user.id,
      parsedParams.data.id,
      parsedBody.data.contentUrl || "",
      parsedBody.data.notes,
      parsedBody.data.contentUrls,
    );

    return NextResponse.json({
      success: true,
      message: "Content submitted successfully. The brand will review within 48 hours.",
      deal: submission,
    });
  } catch (error) {
    logger.error("Content submission error", error);
    const message = getErrorMessage(error) || "Failed to submit content";
    const status =
      message.includes("Unauthorized")
        ? 403
        : message.includes("status") || message.includes("valid")
          ? 400
          : 500;

    return NextResponse.json({ error: message }, { status });
  }
}


// Wrapped handlers via apiWrapper
export const POST = apiWrapper(_handler_POST);
