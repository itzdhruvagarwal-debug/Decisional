import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { apiWrapper } from "@/lib/api-wrapper";
import { UserService } from "@/services/user.service";
import { requireActiveAdmin } from "@/lib/admin-auth";
import { parsePagination } from "@/lib/utils";

function parseQueryParams(searchParams: URLSearchParams) {
  const category = searchParams.get("category");
  const city = searchParams.get("city");
  const minFollowersStr = searchParams.get("minFollowers");
  const minFollowers = minFollowersStr ? Number.parseInt(minFollowersStr, 10) : undefined;
  const minEngagementRateStr = searchParams.get("minEngagementRate");
  const minEngagementRate = minEngagementRateStr ? Math.round(Number.parseFloat(minEngagementRateStr) * 100) : undefined;
  const minRateStr = searchParams.get("minRate");
  const minRate = minRateStr ? Math.round(Number.parseFloat(minRateStr) * 100) : undefined;
  const maxRateStr = searchParams.get("maxRate");
  const maxRate = maxRateStr ? Math.round(Number.parseFloat(maxRateStr) * 100) : undefined;
  const platform = searchParams.get("platform");
  const searchTerm = searchParams.get("search");

  return {
    category,
    city,
    minFollowers,
    minEngagementRate,
    minRate,
    maxRate,
    platform,
    searchTerm,
  };
}

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
  const params = parseQueryParams(searchParams);
  const { page, limit } = parsePagination(searchParams);

  const filterParams: any = { page, limit };
  if (params.category) filterParams.category = params.category;
  if (params.city) filterParams.city = params.city;
  if (typeof params.minFollowers === "number") filterParams.minFollowers = params.minFollowers;
  if (typeof params.minEngagementRate === "number") filterParams.minEngagementRate = params.minEngagementRate;
  if (typeof params.minRate === "number") filterParams.minRate = params.minRate;
  if (typeof params.maxRate === "number") filterParams.maxRate = params.maxRate;
  if (params.platform) filterParams.platform = params.platform;
  if (params.searchTerm) filterParams.searchTerm = params.searchTerm;
  if (session.user.userType === "BRAND") {
    filterParams.brandUserId = session.user.id;
  }

  const result = await UserService.listInfluencers(filterParams);

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
