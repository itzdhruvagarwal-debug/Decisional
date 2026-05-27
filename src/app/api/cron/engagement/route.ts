import { NextResponse } from "next/server";
import { validateCronSecret } from "../guard";
import { logger } from "@/lib/logger";
import { batchCaptureEngagement } from "@/lib/engagement-tracker";

export async function POST() {
  try {
    await validateCronSecret();

    // Process engagement snapshots for active deals
    const results = await batchCaptureEngagement();

    return NextResponse.json({ success: true, message: "Engagement synced", data: results });
  } catch (error: any) {
    logger.error("Cron Error (Engagement)", { error: error.message });
    if (error.message === "Invalid Cron Secret") {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ success: false, message: "Cron internal failure" }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
