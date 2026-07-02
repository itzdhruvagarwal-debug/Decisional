import { apiWrapper, ApiResponse } from "@/lib/api-wrapper";
import { NextRequest } from "next/server";
import { AdminService } from "@/services/admin.service";
import { logger } from "@/lib/logger";

async function _handler_GET(_request: NextRequest) {
  try {
    const queue = await AdminService.getVerificationQueue();
    return ApiResponse.success(queue, "Verification queue retrieved");
  } catch (error: unknown) {
    logger.error("GET /api/admin/verification-docs error", { error: (error instanceof Error ? error.message : String(error)) });
    return ApiResponse.error("Internal server error", 500);
  }
}

// Wrapped handlers via apiWrapper
export const GET = apiWrapper(_handler_GET, { requireAuth: true, requireAdmin: true });
