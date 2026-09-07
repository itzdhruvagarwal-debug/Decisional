import { NextRequest, NextResponse } from "next/server";
import { apiWrapper } from "@/lib/api-wrapper";
import { validateCronSecret } from "../guard";
import { logger } from "@/lib/logger";

// Export route segment config
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Import all cron handlers
import { POST as cleanupIdempotency } from "../cleanup-idempotency/route";
import { POST as cleanupOAuth } from "../cleanup-oauth/route";
import { POST as contentAutoApprove } from "../content-auto-approve/route";
import { POST as engagement } from "../engagement/route";
import { POST as expireSignatures } from "../expire-signatures/route";
import { POST as ledgerScan } from "../ledger-scan/route";
import { POST as liftSuspensions } from "../lift-suspensions/route";
import { POST as postMonitor } from "../post-monitor/route";
import { POST as reconcilePayouts } from "../reconcile-payouts/route";
import { POST as socialProof } from "../social-proof/route";
import { POST as staleFulfillment } from "../stale-fulfillment/route";
import { POST as tenureBadges } from "../tenure-badges/route";
import { POST as weeklyChallenges } from "../weekly-challenges/route";

interface CronJobDefinition {
  name: string;
  handler: (req: NextRequest, context: { params: Promise<Record<string, string | string[]>> }) => Promise<Response>;
}

const CRON_JOBS: CronJobDefinition[] = [
  { name: "reconcile-payouts", handler: reconcilePayouts },
  { name: "content-auto-approve", handler: contentAutoApprove },
  { name: "post-monitor", handler: postMonitor },
  { name: "stale-fulfillment", handler: staleFulfillment },
  { name: "expire-signatures", handler: expireSignatures },
  { name: "engagement", handler: engagement },
  { name: "lift-suspensions", handler: liftSuspensions },
  { name: "ledger-scan", handler: ledgerScan },
  { name: "social-proof", handler: socialProof },
  { name: "tenure-badges", handler: tenureBadges },
  { name: "cleanup-idempotency", handler: cleanupIdempotency },
  { name: "cleanup-oauth", handler: cleanupOAuth },
  { name: "weekly-challenges", handler: weeklyChallenges },
];

async function _handler_POST(req: NextRequest) {
  await validateCronSecret();

  const startTime = Date.now();
  const context = { params: Promise.resolve({}) };
  const onlyParam = req.nextUrl.searchParams.get("only");
  const requestedJobs = onlyParam
    ? new Set(onlyParam.split(",").map((s) => s.trim().toLowerCase()))
    : null;

  const targetJobs = requestedJobs
    ? CRON_JOBS.filter((j) => requestedJobs.has(j.name))
    : CRON_JOBS;

  logger.info("[Cron Master] Dispatching batch cron jobs", {
    total: targetJobs.length,
    jobs: targetJobs.map((j) => j.name),
  });

  const results: Record<
    string,
    { success: boolean; status?: number; data?: unknown; error?: string; durationMs: number }
  > = {};

  let successCount = 0;
  let failureCount = 0;

  for (const job of targetJobs) {
    const jobStart = Date.now();
    try {
      const response = await job.handler(req, context);
      const data = await response.json().catch(() => null);
      const isSuccess = response.ok;

      results[job.name] = {
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
      logger.error(`[Cron Master] Job ${job.name} failed`, { error: errorMessage });
      results[job.name] = {
        success: false,
        error: errorMessage,
        durationMs: Date.now() - jobStart,
      };
    }
  }

  const totalDurationMs = Date.now() - startTime;

  logger.info("[Cron Master] Batch execution completed", {
    successCount,
    failureCount,
    totalDurationMs,
  });

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
