import { NextRequest, NextResponse } from "next/server";
import { apiWrapper } from "@/lib/api-wrapper";
import { auth } from "@/lib/auth";
import { AdminService } from "@/services/admin.service";
import { requireActiveAdmin } from "@/lib/admin-auth";

async function _handler_GET(request: NextRequest) {
  const session = await auth();
  await requireActiveAdmin(session?.user);

  const { searchParams } = new URL(request.url);
  const actorId = searchParams.get("actorId") || undefined;
  const entityType = searchParams.get("entityType") || undefined;
  const entityId = searchParams.get("entityId") || undefined;
  const startDate = searchParams.get("startDate") ? new Date(searchParams.get("startDate")!) : undefined;
  const endDate = searchParams.get("endDate") ? new Date(searchParams.get("endDate")!) : undefined;

  const filter: Parameters<typeof AdminService.listAuditLogs>[0] = {};
  if (actorId) filter.actorId = actorId;
  if (entityType) filter.entityType = entityType;
  if (entityId) filter.entityId = entityId;
  if (startDate) filter.startDate = startDate;
  if (endDate) filter.endDate = endDate;

  const auditLogs = await AdminService.listAuditLogs(filter);

  return NextResponse.json({
    success: true,
    data: auditLogs,
  });
}

export const GET = apiWrapper(_handler_GET);
