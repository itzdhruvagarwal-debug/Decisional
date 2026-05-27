import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getAdminAnalytics,
  getBrandAnalytics,
  getInfluencerAnalytics,
} from "@/lib/analytics-engine";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    let stats;
    if (session.user.userType === "ADMIN") {
      stats = await getAdminAnalytics();
    } else if (session.user.userType === "BRAND") {
      stats = await getBrandAnalytics(session.user.id);
    } else if (session.user.userType === "INFLUENCER") {
      stats = await getInfluencerAnalytics(session.user.id);
    } else {
      return NextResponse.json(
        { success: false, message: "Unsupported account type" },
        { status: 403 },
      );
    }

    return NextResponse.json({ success: true, message: "Stats fetched", data: stats }, { status: 200 });
  } catch (error: any) {
    logger.error("GET /api/analytics error", { error: error.message });
    return NextResponse.json({ success: false, message: "Failed to load analytics" }, { status: 500 });
  }
}
