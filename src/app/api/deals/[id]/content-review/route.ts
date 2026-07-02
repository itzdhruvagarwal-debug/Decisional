import { apiWrapper } from "@/lib/api-wrapper";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { DealService } from "@/services/deal.service";
import { routeParamsSchema, contentApprovalSchema } from "@/lib/validations";
import { checkRateLimit } from "@/lib/rate-limit";

const paramsSchema = routeParamsSchema;

async function _handler_POST(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[]>> },
) {
  const parsedParams = paramsSchema.safeParse(await context.params);
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
  
  // Inject dealId from params to satisfy contentApprovalSchema shape if client didn't supply it
  if (body && typeof body === "object" && !body.dealId) {
    body.dealId = parsedParams.data.id;
  }

  const parsed = contentApprovalSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { approved, reviews } = parsed.data;

  let result;
  if (approved && !reviews) {
    result = await DealService.approveContent(session.user.id, parsedParams.data.id);
  } else {
    result = await DealService.reviewContent(
      session.user.id,
      parsedParams.data.id,
      reviews || []
    );
  }

  return NextResponse.json({ success: true, deal: result });
}

// Wrapped handlers via apiWrapper
export const POST = apiWrapper(_handler_POST);
