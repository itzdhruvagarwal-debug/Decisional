import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { dbIdSchema } from "@/lib/validations";
import { DealService } from "@/services/deal.service";
import { logger } from "@/lib/logger";

const paramsSchema = z.object({ id: dbIdSchema });
const rejectSchema = z.object({
    reason: z.string().trim().min(5).max(500).optional(),
}).optional();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const resolvedParams = await context.params;
        const parsedParams = paramsSchema.safeParse(resolvedParams);
        if (!parsedParams.success) return NextResponse.json({ success: false, message: "Invalid Deal ID" }, { status: 400 });

        const body = await request.json().catch(() => ({}));
        const parsedBody = rejectSchema.safeParse(body);
        if (!parsedBody.success) {
            return NextResponse.json({ success: false, message: "Invalid payload", data: parsedBody.error.format() }, { status: 400 });
        }

        await DealService.rejectPendingInvite(
            session.user.id,
            parsedParams.data.id,
            parsedBody.data?.reason,
        );

        return NextResponse.json({ success: true, message: "Invite rejected successfully" }, { status: 200 });
    } catch (error: any) {
        logger.error("POST /api/deals/[id]/reject error", { error: error.message });

        if (error.message?.includes("Unauthorized")) {
            return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
        }

        if (error.message?.includes("not found") || error.code === "P2025") {
            return NextResponse.json({ success: false, message: "Deal not found" }, { status: 404 });
        }

        if (error.message?.includes("pending signature")) {
            return NextResponse.json({ success: false, message: error.message }, { status: 400 });
        }

        return NextResponse.json({ success: false, message: "Failed to reject invite" }, { status: 500 });
    }
}
