/**
 * GET /api/user/reputation
 * Returns user-facing qualitative reputation summary and non-gameable improvement guidance.
 * NEVER exposes internal weight constants, point calculations, or raw formulas.
 */

import { apiWrapper, ApiResponse, AuthenticatedRequest } from "@/lib/api-wrapper";
import { getUserQualitativeReputation } from "@/lib/trust-engine";
import { logger } from "@/lib/logger";

async function _GET(req: AuthenticatedRequest) {
  try {
    const userId = req.session.user.id;
    const reputation = await getUserQualitativeReputation(userId);

    if (!reputation) {
      return ApiResponse.error("User reputation profile not found", 404);
    }

    return ApiResponse.success({ reputation });
  } catch (error) {
    logger.error("Failed to fetch qualitative reputation summary", error, {
      userId: req.session.user.id,
    });
    return ApiResponse.error("Failed to load reputation summary", 500);
  }
}

export const GET = apiWrapper(
  (req) => _GET(req as AuthenticatedRequest),
  { requireAuth: true },
);
