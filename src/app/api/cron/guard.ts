import { headers } from "next/headers";
import { timingSafeEqual } from "crypto";

export async function validateCronSecret() {
  const reqHeaders = await headers();
  const authHeader = reqHeaders.get("authorization");
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    throw new Error("CRON_SECRET is not configured");
  }

  const expected = `Bearer ${configuredSecret}`;

  // SECURITY: Use timing-safe comparison to prevent timing attacks
  if (
    !authHeader ||
    authHeader.length !== expected.length ||
    !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
  ) {
    throw new Error("Invalid Cron Secret");
  }
}
