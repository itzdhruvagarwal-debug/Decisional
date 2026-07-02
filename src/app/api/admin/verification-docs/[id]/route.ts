import { apiWrapper, ApiResponse } from "@/lib/api-wrapper";
import { NextRequest } from "next/server";
import { reviewVerification } from "@/lib/verification-engine";
import { logger } from "@/lib/logger";
import { z } from "zod";

const reviewSchema = z.object({
  status: z.enum(["VERIFIED", "REJECTED"]),
  reason: z.string().optional(),
});

async function _handler_PUT(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[]>> }
) {
  try {
    const session = (request as NextRequest & { session: { user: { id: string } } }).session;

    const resolvedParams = await context.params;
    const documentId = String(resolvedParams.id ?? '');
    const body = await request.json().catch(() => ({}));
    const parsed = reviewSchema.safeParse(body);

    if (!parsed.success) {
      return ApiResponse.error("Invalid payload");
    }

    const { status, reason } = parsed.data;

    const result = await reviewVerification({
      documentId,
      reviewerId: session!.user!.id!,
      status,
      ...(reason ? { reason } : {}),
    });

    return ApiResponse.success(result, "Verification reviewed");
  } catch (error: unknown) {
    logger.error("PUT /api/admin/verification-docs/[id] error", { error: (error instanceof Error ? error.message : String(error)) });
    return ApiResponse.error("Something went wrong. Please try again.", 500);
  }
}

// Wrapped handlers via apiWrapper
export const PUT = apiWrapper(_handler_PUT, { requireAuth: true, requireAdmin: true });
