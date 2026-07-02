import { NextRequest, NextResponse } from "next/server";
import { apiWrapper } from "@/lib/api-wrapper";
import { logger } from "@/lib/logger";
import { validateCronSecret } from "../guard";
import { cleanupExpiredIdempotencyKeys } from "@/lib/idempotency";

async function _handler_POST(_req: NextRequest) {
  await validateCronSecret();

  const deleted = await cleanupExpiredIdempotencyKeys();

  logger.info("[Cron] Idempotency cleanup completed", { deleted });

  return NextResponse.json({ success: true, deleted });
}

export const POST = apiWrapper(_handler_POST);
