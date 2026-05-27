import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AdminAnalyticsService } from "@/services/admin-analytics.service";
import { logger } from "@/lib/logger";
import { requireActiveAdmin } from "@/lib/admin-auth";

export async function GET() {
  try {
    const session = await auth();
    try {
      await requireActiveAdmin(session?.user);
    } catch {
      return NextResponse.json({ success: false, message: "Forbidden. Admin access required." }, { status: 403 });
    }

    const financials = await AdminAnalyticsService.getFinancialOverview();

    return NextResponse.json({ success: true, message: "Report generated", data: financials }, { status: 200 });
  } catch (error: any) {
    logger.error("GET /api/admin/financial error", { error: error.message });
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
