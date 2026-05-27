import { randomBytes } from "crypto";
import prisma from "./db";

/**
 * Generate a cryptographically secure random token.
 * Uses 32 bytes (256 bits) of entropy — sufficient for session tokens.
 * UUID v4 uses only ~122 bits of entropy and is weaker for security tokens.
 */
function generateSecureToken(): string {
  return randomBytes(32).toString("hex"); // 64-char hex string, 256-bit entropy
}

/**
 * Generate a new refresh token for a user.
 * Revokes all existing tokens first to enforce single-session policy.
 *
 * @param userId - The ID of the user
 * @returns The generated refresh token record
 */
export async function generateRefreshToken(userId: string) {
  // Revoke all existing tokens to enforce single session at DB level
  await prisma.refreshToken.updateMany({
    where: { userId, revoked: false },
    data: { revoked: true },
  });

  const token = generateSecureToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

  const refreshToken = await prisma.refreshToken.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });

  return refreshToken;
}

/**
 * Rotate a refresh token (reuse detection / refresh token family).
 * If a REVOKED token is reused, ALL tokens for this user are revoked (compromise signal).
 *
 * @param oldToken - The token being rotated
 * @returns The new refresh token or null if invalid/fraud detected
 */
export async function rotateRefreshToken(oldToken: string) {
  if (!oldToken || typeof oldToken !== "string") return null;

  const existingToken = await prisma.refreshToken.findUnique({
    where: { token: oldToken },
    include: { user: true },
  });

  // Token doesn't exist at all
  if (!existingToken) return null;

  // Reuse detection: If trying to use a revoked token, it means the original
  // was stolen and used already. Revoke ALL tokens for this user immediately.
  if (existingToken.revoked) {
    await prisma.refreshToken.updateMany({
      where: { userId: existingToken.userId },
      data: { revoked: true }, // Revoke entire token family
    });
    return null; // Indicates a possible token theft — caller should force re-login
  }

  // Check expiry
  if (new Date() > existingToken.expiresAt) {
    await prisma.refreshToken.update({
      where: { id: existingToken.id },
      data: { revoked: true },
    });
    return null;
  }

  // Valid token: Revoke it and issue a new cryptographically secure one
  const newTokenString = generateSecureToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  // Transaction ensures atomicity — prevents a window where both old and new are valid
  const [, newToken] = await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: existingToken.id },
      data: {
        revoked: true,
        replacedByToken: newTokenString,
      },
    }),
    prisma.refreshToken.create({
      data: {
        token: newTokenString,
        userId: existingToken.userId,
        expiresAt,
      },
    }),
  ]);

  return newToken;
}

/**
 * Revoke a specific refresh token (e.g., on explicit logout).
 * Fails silently if the token doesn't exist (idempotent).
 */
export async function revokeRefreshToken(token: string): Promise<void> {
  if (!token) return;
  try {
    await prisma.refreshToken.update({
      where: { token },
      data: { revoked: true },
    });
  } catch {
    // Token may not exist (already revoked or never created) — this is acceptable
  }
}
