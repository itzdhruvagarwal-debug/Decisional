/**
 * Weekly Social Proof Recalculation Cron
 *
 * Recalculates followerAuthenticityScore and contentQualityScore
 * for all active influencers. Should be triggered weekly via an
 * external scheduler.
 */

import { NextResponse } from "next/server";
import { recalculateAllSocialProof } from "@/lib/social-proof-calculator";
import { logger } from "@/lib/logger";
import { validateCronSecret } from "../guard";

async function runSocialProofCron() {
  try {
    await validateCronSecret();

    const startTime = Date.now();
    const result = await recalculateAllSocialProof();
    const durationMs = Date.now() - startTime;

    logger.info("Weekly social proof recalculation complete", {
      processed: result.processed,
      failed: result.failed,
      durationMs,
    });

    return NextResponse.json({
      success: true,
      ...result,
      durationMs,
    });
  } catch (error: any) {
    logger.error("Social proof cron failed", { error: error.message });

    if (error.message === "Invalid Cron Secret") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(
      { error: "Social proof recalculation failed" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return runSocialProofCron();
}

export async function POST() {
  return runSocialProofCron();
}
