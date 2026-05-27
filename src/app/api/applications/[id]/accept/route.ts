import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { dbIdSchema } from "@/lib/validations";
import { ApplicationService } from "@/services/application.service";
import { logger } from "@/lib/logger";

const paramsSchema = z.object({ id: dbIdSchema });

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();

    if (!session?.user?.id || (session.user as any).userType !== "BRAND") {
      return NextResponse.json({ success: false, message: "Brand authorization required" }, { status: 403 });
    }

    const resolvedParams = await context.params;
    const parsedParams = paramsSchema.safeParse(resolvedParams);
    if (!parsedParams.success) return NextResponse.json({ success: false, message: "Invalid ID" }, { status: 400 });

    const deal = await ApplicationService.acceptApplication(
      session.user.id,
      parsedParams.data.id,
    );

    return NextResponse.json({ success: true, message: "Application accepted, deal initiated.", data: deal }, { status: 200 });
  } catch (error: any) {
    logger.error("POST /api/applications/[id]/accept error", error);

    if (
      error?.message?.includes("not found") ||
      error?.message?.includes("Not authorized")
    ) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 404 },
      );
    }

    if (
      error?.message?.includes("Insufficient") ||
      error?.message?.includes("budget") ||
      error?.message?.includes("pending")
    ) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: false, message: "Failed to accept application" },
      { status: 500 },
    );
  }
}
