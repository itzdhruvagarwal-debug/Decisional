import { createHmac, timingSafeEqual } from "crypto";
import { logger } from "./logger";

/**
 * Enterprise-grade Request Signing Utility
 * Used for verifying internal callbacks, webhooks, and secure inter-service communication.
 */

function getSigningSecret(): string {
  const secret = process.env.SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SIGNING_SECRET environment variable is missing or too short (minimum 32 chars). " +
      "This is required for webhook and inter-service request verification.",
    );
  }
  return secret;
}

/**
 * Generate a signature for a payload.
 * Adds a timestamp to prevent replay attacks.
 */
export function signPayload(payload: string | object, secret?: string): string {
  const key = secret || getSigningSecret();
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const timestamp = Date.now().toString();

  const hmac = createHmac("sha256", key);
  hmac.update(`${timestamp}.${body}`);
  const signature = hmac.digest("hex");

  return `t=${timestamp},v1=${signature}`;
}

/**
 * Verify a signature against a payload.
 * Implements constant-time comparison and timestamp window verification.
 */
export function verifySignature(
  payload: string | object,
  header: string,
  secret?: string,
  windowSeconds: number = 300, // 5 minutes default
): boolean {
  try {
    if (!header) return false;

    const key = secret || getSigningSecret();
    const body =
      typeof payload === "string" ? payload : JSON.stringify(payload);

    // Parse header: t=123,v1=abc
    const parts = header.split(",");
    const tPart = parts.find((p) => p.startsWith("t="));
    const vPart = parts.find((p) => p.startsWith("v1="));

    if (!tPart || !vPart) return false;

    const timestamp = tPart.split("=")[1];
    const signature = vPart.split("=")[1];
    if (!timestamp || !signature) return false;

    // Check for replay attacks
    const now = Date.now();
    const requestTime = parseInt(timestamp, 10);

    if (
      isNaN(requestTime) ||
      Math.abs(now - requestTime) > windowSeconds * 1000
    ) {
      logger.warn(
        "Signature verification failed: Replay attack or stale request",
        { timestamp },
      );
      return false;
    }

    // Re-calculate signature
    const expectedHmac = createHmac("sha256", key);
    expectedHmac.update(`${timestamp}.${body}`);
    const expectedSignature = expectedHmac.digest("hex");

    // Timing-safe comparison to prevent timing attacks
    const signatureBuffer = Buffer.from(signature!, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch (error) {
    logger.error("Signature verification error", error);
    return false;
  }
}
