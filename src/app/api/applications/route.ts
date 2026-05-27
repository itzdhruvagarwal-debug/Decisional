import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { ApplicationService } from "@/services/application.service";
import { logger } from "@/lib/logger";
import { dbIdSchema } from "@/lib/validations";
import { requireActiveAdmin } from "@/lib/admin-auth";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaignId");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
    const limit = Math.min(Math.max(1, parseInt(searchParams.get("limit") || "20") || 20), 50);

    const userType = (session.user as any).userType || "INFLUENCER";
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

    return NextResponse.json({ success: true, message: "Applications loaded", data: apps }, { status: 200 });
  } catch (error: any) {
    logger.error("GET /api/applications error", { error: error.message });
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

const applySchema = z.object({
  campaignId: dbIdSchema,
  proposal: z.string().min(10),
  proposedRate: z.number().positive(),
  estimatedDeliveryDays: z.number().int().positive().max(90).optional(),
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || (session.user as any).userType !== "INFLUENCER") {
      return NextResponse.json({ success: false, message: "Influencer account required" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = applySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid payload", data: parsed.error.format() }, { status: 400 });

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
    return NextResponse.json({ success: true, message: "Application submitted", data: application }, { status: 201 });
  } catch (error: any) {
    logger.error("POST /api/applications error", { error: error.message });
    const message = error.message || "Submission failed";
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
      return NextResponse.json({ success: false, message }, { status: 400 });
    }

    return NextResponse.json({ success: false, message: "Submission failed" }, { status: 500 });
  }
}
