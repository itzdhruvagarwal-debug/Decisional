import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { AdminService } from "@/services/admin.service";
import { logger } from "@/lib/logger";
import { requireActiveAdmin } from "@/lib/admin-auth";

const querySchema = z.object({
  page: z.preprocess(
    (val) => (val === undefined ? undefined : Number(val)),
    z.number().int().min(1).default(1),
  ),
  limit: z.preprocess(
    (val) => (val === undefined ? undefined : Number(val)),
    z.number().int().min(1).max(100).default(20),
  ),
  search: z.string().trim().max(100).optional(),
  type: z.enum(["INFLUENCER", "BRAND", "ADMIN", "ALL"]).optional(),
  status: z
    .enum(["ACTIVE", "PENDING_VERIFICATION", "SUSPENDED", "BANNED", "ALL"])
    .optional(),
});

export async function GET(request: Request) {
  try {
    const session = await auth();
    try {
      await requireActiveAdmin(session?.user);
    } catch {
      return NextResponse.json({ success: false, message: "Forbidden. Admin access required." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      page: searchParams.get("page") || undefined,
      limit: searchParams.get("limit") || undefined,
      search: searchParams.get("search") || undefined,
      type: searchParams.get("type") || undefined,
      status: searchParams.get("status") || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ success: false, message: "Invalid queries", data: parsed.error.format() }, { status: 400 });
    }

    const { page, limit, type, status, search } = parsed.data;
    const users = await AdminService.listUsers({
      page,
      limit,
      ...(search ? { search } : {}),
      ...(type && type !== "ALL" ? { userType: type } : {}),
      ...(status && status !== "ALL" ? { status } : {}),
    });

    return NextResponse.json({ success: true, message: "Users retrieved", data: users }, { status: 200 });
  } catch (error: any) {
    logger.error("GET /api/admin/users error", { error: error.message });
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
