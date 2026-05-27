import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { apiWrapper } from "@/lib/api-wrapper";
import { AdminService } from "@/services/admin.service";
import { z } from "zod";

// Schema for updating user status
const updateUserSchema = z.object({
  action: z.enum([
    "ban",
    "suspend",
    "activate",
    "adjust_trust",
    "set_verification",
  ]),
  reason: z.string().max(500).optional(),
  trustScoreAdjustment: z.number().min(-100).max(100).optional(),
  verificationLevel: z.enum(["NONE", "BASIC", "IDENTITY", "FULL"]).optional(),
  suspensionDays: z.number().min(1).max(365).optional(),
}).strip();

export const GET = apiWrapper(async (req, { params }) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await AdminService.checkAdminAccess(session.user);
  } catch (_e) {
    return NextResponse.json(
      { error: "Unauthorized: Admin access required" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const userId = Array.isArray(id) ? id[0]! : id;
  if (!userId) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }
  const result = await AdminService.getUserDetails(userId);

  return NextResponse.json(result);
});

export const PUT = apiWrapper(async (req, { params }) => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await AdminService.checkAdminAccess(session.user);
  } catch (_e) {
    return NextResponse.json(
      { error: "Unauthorized: Admin access required" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const userId = Array.isArray(id) ? id[0]! : id;
  if (!userId) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  // Parse Body
  const body = await req.json();
  const parsed = updateUserSchema.parse(body);

  const result = await AdminService.updateUserStatus(
    session.user,
    userId,
    parsed as any,
  );

  return NextResponse.json(result);
});
