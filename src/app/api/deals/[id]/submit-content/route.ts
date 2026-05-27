import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { dbIdSchema, contentSubmissionSchema } from "@/lib/validations";
import { DealService } from "@/services/deal.service";
import { logger } from "@/lib/logger";

const paramsSchema = z.object({ id: dbIdSchema });
const submitContentBodySchema = contentSubmissionSchema.omit({ dealId: true });

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
      parsedBody.data.contentUrl,
      parsedBody.data.notes,
    );

    return NextResponse.json({
      success: true,
      message: "Content submitted successfully. The brand will review within 48 hours.",
      deal: submission,
    });
  } catch (error) {
    logger.error("Content submission error", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to submit content";
    const status =
      message.includes("Unauthorized")
        ? 403
        : message.includes("status") || message.includes("valid")
          ? 400
          : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
