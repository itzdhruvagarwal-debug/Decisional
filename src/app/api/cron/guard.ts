import { headers } from "next/headers";
import { createHash, timingSafeEqual } from "crypto";

export async function validateCronSecret() {
  const reqHeaders = await headers();
  const authHeader = reqHeaders.get("authorization");
  const xCronHeader = reqHeaders.get("x-cron-secret");
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    throw new Error("CRON_SECRET is not configured");
  }

  // 1. Verify standard Authorization: Bearer <secret>
  const expectedAuth = `Bearer ${configuredSecret}`;
  const expectedAuthHash = createHash("sha256").update(expectedAuth).digest();
  const actualAuthHash = createHash("sha256").update(authHeader || "").digest();
  const isAuthValid = authHeader && timingSafeEqual(actualAuthHash, expectedAuthHash);

  // 2. Verify fallback x-cron-secret: <secret>
  const expectedXCronHash = createHash("sha256").update(configuredSecret).digest();
  const actualXCronHash = createHash("sha256").update(xCronHeader || "").digest();
  const isXCronValid = xCronHeader && timingSafeEqual(actualXCronHash, expectedXCronHash);

  if (!isAuthValid && !isXCronValid) {
    throw new Error("Invalid Cron Secret");
  }
}
