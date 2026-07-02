import { apiWrapper } from "@/lib/api-wrapper";
import { NextRequest, NextResponse  } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { routeParamsSchema } from "@/lib/validations";
import { DealService } from "@/services/deal.service";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

const paramsSchema = routeParamsSchema;
const rejectSchema = z.object({
    reason: z.string().trim().min(5).max(500).optional(),
}).optional();

async function _handler_POST(request: NextRequest, context: { params: Promise<Record<string, string | string[]>> }) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const limit = await checkRateLimit(session.user.id, "DEAL_UPDATES");
        if (!limit.success) {
            return NextResponse.json({ success: false, message: "Too many deal update requests" }, { status: 429 });
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
    } catch (error: unknown) {
        logger.error("POST /api/deals/[id]/reject error", { error });

        const errMsg = error instanceof Error ? error.message : String(error);
        const errCode = (error as { code?: string })?.code;

        if (errMsg?.includes("Unauthorized")) {
            return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
        }

        if (errMsg?.includes("not found") || errCode === "P2025") {
            return NextResponse.json({ success: false, message: "Deal not found" }, { status: 404 });
        }

        if (errMsg?.includes("pending signature")) {
            return NextResponse.json({ success: false, message: errMsg }, { status: 400 });
        }

        return NextResponse.json({ success: false, message: "Failed to reject invite" }, { status: 500 });
    }
}


// Wrapped handlers via apiWrapper
export const POST = apiWrapper(_handler_POST);
