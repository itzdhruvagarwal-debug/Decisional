/**
 * Weekly Challenges Cron — Generate new challenges every Monday
 */

import { NextResponse } from "next/server";
import { generateWeeklyChallenges } from "@/lib/weekly-challenges";
import { logger } from "@/lib/logger";
import { validateCronSecret } from "../guard";

async function runWeeklyChallengesCron() {
  try {
    await validateCronSecret();

    const result = await generateWeeklyChallenges();

    logger.info("Weekly challenges generated", result);

    return NextResponse.json({
      success: true,
      weekId: result.weekId,
      influencerChallenges: result.influencerChallenges.length,
      brandChallenges: result.brandChallenges.length,
    });
  } catch (error: any) {
    logger.error("Weekly challenges cron failed", { error: error.message });

    if (error.message === "Invalid Cron Secret") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(
      { error: "Failed to generate weekly challenges" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return runWeeklyChallengesCron();
}

export async function POST() {
  return runWeeklyChallengesCron();
}
