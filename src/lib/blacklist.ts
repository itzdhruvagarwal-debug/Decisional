import { redis } from "./redis";
import { logger } from "./logger";

const IP_BAN_PREFIX = "ban:ip:";
const TOKEN_REVOKE_PREFIX = "revoke:token:";

/**
 * Enterprise Security: Dynamic Threat Blacklisting
 * Allows instant banning of IPs and revocation of JWT sessions.
 */

export async function banIp(
  ip: string,
  reason: string,
  durationSeconds: number = 86400,
): Promise<void> {
  try {
    await redis.setex(`${IP_BAN_PREFIX}${ip}`, durationSeconds, reason);
    logger.warn(`[SECURITY] IP Banned: ${ip}`, { reason, durationSeconds });
  } catch (error) {
    logger.error("Failed to ban IP", error);
  }
}

export async function isIpBanned(ip: string): Promise<boolean> {
  try {
    const result = await redis.get(`${IP_BAN_PREFIX}${ip}`);
    return !!result;
  } catch (_error) {
    // Fail open if Redis is down
    return false;
  }
}

export async function revokeToken(
  jti: string,
  durationSeconds: number = 86400,
): Promise<void> {
  try {
    // We set the token JTI to be revoked until it naturally expires
    await redis.setex(
      `${TOKEN_REVOKE_PREFIX}${jti}`,
      durationSeconds,
      "revoked",
    );
    logger.info(`[SECURITY] Token Revoked: ${jti}`);
  } catch (error) {
    logger.error("Failed to revoke token", error);
  }
}

export async function isTokenRevoked(jti: string): Promise<boolean> {
  if (!jti) return false;
  try {
    const result = await redis.get(`${TOKEN_REVOKE_PREFIX}${jti}`);
    return !!result;
  } catch (_error) {
    return false;
  }
}
