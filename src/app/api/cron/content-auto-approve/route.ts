import { NextResponse } from "next/server";
import { validateCronSecret } from "../guard";
import { logger } from "@/lib/logger";
import { DealService } from "@/services/deal.service";

async function runContentAutoApproveCron() {
  try {
    await validateCronSecret();

    const result = await DealService.autoApproveExpiredContent();

    return NextResponse.json({
      success: true,
      message: "Content auto-approval completed",
      data: result,
    });
  } catch (error: any) {
    logger.error("Cron Error (Content Auto Approval)", {
      error: error.message,
    });

    if (error.message === "Invalid Cron Secret") {
      return NextResponse.json(
        { success: false, message: "Forbidden" },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { success: false, message: "Cron internal failure" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return runContentAutoApproveCron();
}

export async function POST() {
  return runContentAutoApproveCron();
}
