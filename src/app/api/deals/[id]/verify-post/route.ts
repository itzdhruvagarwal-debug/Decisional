import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { DealService } from "@/services/deal.service";
import { logger } from "@/lib/logger";
import { dbIdSchema, postVerificationSchema } from "@/lib/validations";

const paramsSchema = z.object({ id: dbIdSchema });
const verifyPostBodySchema = postVerificationSchema.omit({ dealId: true });

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
    const parsedBody = verifyPostBodySchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsedBody.error.flatten() },
        { status: 400 },
      );
    }

    const result = await DealService.verifyPost(
      session.user.id,
      parsedParams.data.id,
      parsedBody.data.postUrl,
    );

    return NextResponse.json({
      success: true,
      status: result.status,
      message:
        result.status === "VERIFICATION_PENDING"
          ? "Post submitted. Verification is pending manual review because official platform checks were unavailable."
          : "Post verified successfully. Payment settlement has started.",
    });
  } catch (error) {
    logger.error("Post verification error", error);

    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to verify post";

    let status = 500;
    if (message.includes("Unauthorized")) status = 403;
    if (message.includes("approved") || message.includes("Post verification failed")) {
      status = 400;
    }

    return NextResponse.json({ error: message }, { status });
  }
}
