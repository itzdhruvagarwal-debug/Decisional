import { NextRequest } from "next/server";
import { apiWrapper, ApiResponse, type AuthenticatedRequest } from "@/lib/api-wrapper";
import { MatchingService } from "@/services/matching.service";
import { createActivityLog } from "@/lib/audit";
import { z } from "zod";

const updateBenchmarkSchema = z.object({
  category: z.string().min(1).max(50),
  baselinePaise: z.number().int().min(1).max(5000), // 1 paise to ₹50
});

async function _getHandler(_req: NextRequest) {
  const benchmarks = await MatchingService.getAllCategoryBenchmarks();
  return ApiResponse.success({ benchmarks }, "Category benchmarks fetched");
}

async function _postHandler(req: NextRequest) {
  const session = (req as AuthenticatedRequest).session;
  const body = await req.json().catch(() => ({}));
  const parsed = updateBenchmarkSchema.safeParse(body);

  if (!parsed.success) {
    return ApiResponse.error("Invalid benchmark payload: " + parsed.error.issues[0]?.message, 400);
  }

  const { category, baselinePaise } = parsed.data;
  await MatchingService.updateCategoryBaselineCpv(category, baselinePaise, session.user.id);

  await createActivityLog({
    userId: session.user.id,
    action: "CATEGORY_BENCHMARK_UPDATED",
    entityType: "SYSTEM_CONFIG",
    entityId: category,
    metadata: {
      category,
      baselinePaise,
      baselineRupees: (baselinePaise / 100).toFixed(2),
      adminEmail: session.user.email,
    },
  }).catch(() => {});

  return ApiResponse.success(
    {
      category,
      baselinePaise,
      baselineRupees: (baselinePaise / 100).toFixed(2),
    },
    `Category ${category} baseline updated to ${(baselinePaise / 100).toFixed(2)} INR`
  );
}

export const GET = apiWrapper(_getHandler, { requireAdmin: true });
export const POST = apiWrapper(_postHandler, { requireAdmin: true });
