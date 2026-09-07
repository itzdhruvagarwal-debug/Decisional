import { NextRequest, NextResponse } from "next/server";
import { apiWrapper } from "@/lib/api-wrapper";
import { validateCronSecret } from "../guard";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRON_JOBS = [
  "reconcile-payouts",
  "content-auto-approve",
  "post-monitor",
  "stale-fulfillment",
  "expire-signatures",
  "engagement",
  "lift-suspensions",
  "ledger-scan",
  "social-proof",
  "tenure-badges",
  "cleanup-idempotency",
  "cleanup-oauth",
  "weekly-challenges",
];

async function _handler_POST(req: NextRequest) {
  await validateCronSecret();

  const startTime = Date.now();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_BASE_URL ||
    req.nextUrl.origin ||
    "https://vyaparmedia.vercel.app";

  const authHeader = req.headers.get("authorization") || "";
  const xCronHeader = req.headers.get("x-cron-secret") || "";

  const onlyParam = req.nextUrl.searchParams.get("only");
  const requestedJobs = onlyParam
    ? new Set(onlyParam.split(",").map((s) => s.trim().toLowerCase()))
    : null;

  const targetJobs = requestedJobs
    ? CRON_JOBS.filter((name) => requestedJobs.has(name))
    : CRON_JOBS;

  logger.info("[Cron Master] Dispatching batch cron jobs via HTTP", {
    total: targetJobs.length,
    jobs: targetJobs,
    origin,
  });

  const results: Record<
    string,
    { success: boolean; status?: number; data?: unknown; error?: string; durationMs: number }
  > = {};

  let successCount = 0;
  let failureCount = 0;

  for (const jobName of targetJobs) {
    const jobStart = Date.now();
    const url = `${origin}/api/cron/${jobName}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          ...(authHeader ? { authorization: authHeader } : {}),
          ...(xCronHeader ? { "x-cron-secret": xCronHeader } : {}),
          "cache-control": "no-cache",
        },
      });

      const data = await response.json().catch(() => null);
      const isSuccess = response.ok;

      results[jobName] = {
        success: isSuccess,
        status: response.status,
        data,
        durationMs: Date.now() - jobStart,
      };

      if (isSuccess) {
        successCount++;
      } else {
        failureCount++;
      }
    } catch (error: unknown) {
      failureCount++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[Cron Master] HTTP call to ${jobName} failed`, { error: errorMessage });
      results[jobName] = {
        success: false,
        error: errorMessage,
        durationMs: Date.now() - jobStart,
      };
    }
  }

  const totalDurationMs = Date.now() - startTime;

  return NextResponse.json({
    success: failureCount === 0,
    message: `Batch cron execution completed: ${successCount} succeeded, ${failureCount} failed`,
    summary: {
      total: targetJobs.length,
      succeeded: successCount,
      failed: failureCount,
      totalDurationMs,
    },
    results,
  });
}

export const POST = apiWrapper(_handler_POST);
export const GET = POST;
