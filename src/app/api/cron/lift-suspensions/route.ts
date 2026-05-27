import { NextResponse } from "next/server";
import { validateCronSecret } from "../guard";
import { logger } from "@/lib/logger";

export async function POST() {
  try {
    await validateCronSecret();

    const { liftExpiredSuspensions } = await import("@/lib/penalty-system");
    const result = await liftExpiredSuspensions();

    logger.info("Suspensions lifted", { count: result.lifted });

    return NextResponse.json({ success: true, message: `Suspensions lifted: ${result.lifted}` });
  } catch (error: any) {
    logger.error("Cron Error (Lift Suspensions)", { error: error.message });
    if (error.message === "Invalid Cron Secret") {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ success: false, message: "Cron internal failure" }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
