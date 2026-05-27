import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { apiWrapper } from "@/lib/api-wrapper";
import { DealService } from "@/services/deal.service";
import {
  contentSubmissionSchema,
  contentApprovalSchema,
  postVerificationSchema,
} from "@/lib/validations";
import { requireActiveAdmin } from "@/lib/admin-auth";

export const GET = apiWrapper(async (req) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
  const limit = Math.min(
    Math.max(1, parseInt(searchParams.get("limit") || "20") || 20),
    50,
  );
  const status = searchParams.get("status");

  if (session.user.userType === "ADMIN") {
    await requireActiveAdmin(session.user);
  }

  const result = await DealService.listDeals(
    session.user.id,
    session.user.userType,
    {
      ...(status ? { status } : {}),
      page,
      limit,
    },
  );

  return NextResponse.json({
    deals: result.deals,
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
  const action = body.action;

  if (action === "submit_content") {
    const parsed = contentSubmissionSchema.parse(body);
    const result = await DealService.submitContent(
      session.user.id,
      parsed.dealId,
      parsed.contentUrl,
      parsed.notes,
    );
    return NextResponse.json({
      success: true,
      message: "Content submitted",
      data: result,
    });
  }

  if (action === "review_content") {
    const parsed = contentApprovalSchema.parse(body);
    if (parsed.approved) {
      await DealService.approveContent(session.user.id, parsed.dealId);
      return NextResponse.json({ success: true, message: "Content approved" });
    } else {
      const result = await DealService.requestRevision(
        session.user.id,
        parsed.dealId,
        parsed.feedback || "",
      );
      return NextResponse.json({
        success: true,
        message: "Revision requested",
        data: result,
      });
    }
  }

  if (action === "verify_post") {
    const parsed = postVerificationSchema.parse(body);
    await DealService.verifyPost(
      session.user.id,
      parsed.dealId,
      parsed.postUrl,
    );
    return NextResponse.json({ success: true, message: "Post verified" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
});
