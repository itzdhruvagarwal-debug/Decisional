import { NextResponse } from "next/server";
import { validateCronSecret } from "../guard";
import { runDailyPostMonitoring } from "@/lib/post-monitor";
import { logger } from "@/lib/logger";

export async function POST() {
  try {
    await validateCronSecret();

    const penalties = await runDailyPostMonitoring();

    return NextResponse.json({ success: true, message: "Post monitor routine complete", data: penalties });
  } catch (error: any) {
    logger.error("Cron Error (Post Monitor)", { error: error.message });
    if (error.message === "Invalid Cron Secret") {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ success: false, message: "Cron internal failure" }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
