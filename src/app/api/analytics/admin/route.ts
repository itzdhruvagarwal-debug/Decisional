import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAdminAnalytics } from "@/lib/analytics-engine";
import { logger } from "@/lib/logger";
import { requireActiveAdmin } from "@/lib/admin-auth";

export async function GET(_request: NextRequest) {
  try {
    const session = await auth();

    try {
      await requireActiveAdmin(session?.user);
    } catch {
      return NextResponse.json(
        { error: "Unauthorized: Admin access only" },
        { status: 401 },
      );
    }

    const data = await getAdminAnalytics();

    return NextResponse.json(data);
  } catch (error) {
    logger.error("Admin analytics error", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 },
    );
  }
}
