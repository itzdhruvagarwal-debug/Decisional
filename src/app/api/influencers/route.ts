import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { apiWrapper } from "@/lib/api-wrapper";
import { UserService } from "@/services/user.service";
import { requireActiveAdmin } from "@/lib/admin-auth";
import { parsePagination } from "@/lib/utils";

export const GET = apiWrapper(async (req) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.userType !== "BRAND" && session.user.userType !== "ADMIN") {
    return NextResponse.json(
      { error: "Forbidden: brand access required" },
      { status: 403 },
    );
  }
  if (session.user.userType === "ADMIN") {
    await requireActiveAdmin(session.user);
  }

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const city = searchParams.get("city");
  const minFollowersStr = searchParams.get("minFollowers");
  const minFollowers = minFollowersStr ? parseInt(minFollowersStr) : undefined;
  const minEngagementRateStr = searchParams.get("minEngagementRate");
  const minEngagementRate = minEngagementRateStr ? Math.round(parseFloat(minEngagementRateStr) * 100) : undefined;
  const minRateStr = searchParams.get("minRate");
  const minRate = minRateStr ? Math.round(parseFloat(minRateStr) * 100) : undefined;
  const maxRateStr = searchParams.get("maxRate");
  const maxRate = maxRateStr ? Math.round(parseFloat(maxRateStr) * 100) : undefined;
  const platform = searchParams.get("platform");
  const searchTerm = searchParams.get("search");
  const { page, limit } = parsePagination(searchParams);

  const result = await UserService.listInfluencers({
    ...(category ? { category } : {}),
    ...(city ? { city } : {}),
    ...(minFollowers !== undefined ? { minFollowers } : {}),
    ...(minEngagementRate !== undefined ? { minEngagementRate } : {}),
    ...(minRate !== undefined ? { minRate } : {}),
    ...(maxRate !== undefined ? { maxRate } : {}),
    ...(platform ? { platform } : {}),
    ...(searchTerm ? { searchTerm } : {}),
    page,
    limit,
    ...(session.user.userType === "BRAND" ? { brandUserId: session.user.id } : {}),
  });

  return NextResponse.json({
    influencers: result.influencers,
    pagination: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
    },
  });
});
