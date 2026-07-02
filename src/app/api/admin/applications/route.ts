import { apiWrapper, ApiResponse } from "@/lib/api-wrapper";
import { NextRequest } from "next/server";
import { AdminService } from "@/services/admin.service";

async function _handler_GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  if (status === "FLAGGED") {
    const flaggedApps = await AdminService.getFlaggedApplications();
    return ApiResponse.success(flaggedApps, "Flagged applications retrieved");
  }

  return ApiResponse.error("Invalid status parameter");
}

export const GET = apiWrapper(_handler_GET, { requireAuth: true, requireAdmin: true });
