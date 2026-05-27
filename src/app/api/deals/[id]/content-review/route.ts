import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { DealService } from "@/services/deal.service";
import { dbIdSchema } from "@/lib/validations";
import { z } from "zod";

const paramsSchema = z.object({ id: dbIdSchema });
const reviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  feedback: z.string().trim().optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Invalid deal ID" }, { status: 400 });
    }

    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = reviewSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { status, feedback } = parsed.data;
    if (status === "REJECTED" && (!feedback || feedback.length < 5)) {
      return NextResponse.json(
        { error: "Feedback is required when requesting revisions" },
        { status: 400 },
      );
    }

    const result =
      status === "APPROVED"
        ? await DealService.approveContent(session.user.id, parsedParams.data.id)
        : await DealService.requestRevision(
          session.user.id,
          parsedParams.data.id,
          feedback!,
        );

    return NextResponse.json({ success: true, deal: result });
  } catch (error) {
    logger.error("Content review error", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to review content";
    const status =
      message.includes("Unauthorized")
        ? 403
        : message.includes("not found")
          ? 404
          : message.includes("review") || message.includes("status")
            ? 400
            : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
