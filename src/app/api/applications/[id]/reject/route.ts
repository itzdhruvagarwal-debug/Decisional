import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { dbIdSchema } from "@/lib/validations";
import { ApplicationService } from "@/services/application.service";

const paramsSchema = z.object({ id: dbIdSchema });
const bodySchema = z.object({ reason: z.string().min(5).max(500).optional() });

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id || (session.user as any).userType !== "BRAND") {
      return NextResponse.json(
        { success: false, message: "Brand authorization required" },
        { status: 403 },
      );
    }

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
      session.user.id,
      parsedParams.data.id,
      parsedBody.data.reason,
    );

    return NextResponse.json({
      success: true,
      message: "Application rejected",
      data: { application },
    });
  } catch (error: any) {
    logger.error("POST /api/applications/[id]/reject error", error);

    if (
      error?.message?.includes("not found") ||
      error?.message?.includes("Not authorized")
    ) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 404 },
      );
    }

    if (error?.message?.includes("pending")) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: false, message: "Failed to reject application" },
      { status: 500 },
    );
  }
}
