import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { apiWrapper } from "@/lib/api-wrapper";
import { DisputeService } from "@/services/dispute.service";
import { disputeSchema, disputeEvidenceSchema } from "@/lib/validations";
import { checkRateLimit } from "@/lib/rate-limit";

export const GET = apiWrapper(async (req) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dealId = searchParams.get("dealId");
  const status = searchParams.get("status");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
  const limit = Math.min(
    Math.max(1, parseInt(searchParams.get("limit") || "20") || 20),
    50,
  );

  const result = await DisputeService.listDisputes(session.user.id, {
    ...(dealId ? { dealId } : {}),
    ...(status ? { status } : {}),
    page,
    limit,
  });

  return NextResponse.json({
    disputes: result.disputes,
    pagination: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
    },
  });
});

export const POST = apiWrapper(async (req) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const action = body.action || "create";

  if (action === "create") {
    // Rate limit: 5 dispute submissions per hour (prevents spam disputes)
    const disputeLimit = await checkRateLimit(session.user.id, "DISPUTES");
    if (!disputeLimit.success) {
      return NextResponse.json(
        {
          error:
            "Too many dispute submissions. Please wait before submitting another dispute.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": Math.ceil(
              disputeLimit.reset - Date.now() / 1000,
            ).toString(),
          },
        },
      );
    }
    const parsed = disputeSchema.parse(body);
    const result = await DisputeService.createDispute(session.user.id, parsed);
    return NextResponse.json({ success: true, ...result });
  }

  if (action === "add_evidence") {
    const parsed = disputeEvidenceSchema.parse(body);
    const result = await DisputeService.addEvidence(session.user.id, {
      disputeId: parsed.disputeId,
      type: parsed.type,
      url: parsed.url,
      ...(parsed.description ? { description: parsed.description } : {}),
    });
    return NextResponse.json({ success: true, ...result });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
});

export const PATCH = apiWrapper(async (req) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { disputeId, action, reason } = body;

  if (!disputeId || !action) {
    return NextResponse.json(
      { error: "disputeId and action are required" },
      { status: 400 },
    );
  }

  const result = await DisputeService.handleAction(session.user.id, {
    disputeId,
    action,
    reason,
  });

  return NextResponse.json(result);
});
