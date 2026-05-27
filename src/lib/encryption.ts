/**
 * Encryption utilities for sensitive data (bank account numbers, etc.)
 * Uses AES-256-GCM with per-record random IVs.
 * 
 * Support for key rotation:
 * - Encryption always uses the LATEST version.
 * - Decryption checks the version prefix (e.g., "v1:") and selects the appropriate key.
 * 
 * Required env: ENCRYPTION_KEYS (map of version:key, e.g., "v1:64hex,v2:64hex")
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard

/**
 * Get all available keys from environment.
 * Format: "v1:hex,v2:hex"
 */
function getAllKeys(): Map<string, Buffer> {
  const keysStr = process.env.ENCRYPTION_KEYS;
  if (!keysStr) {
    // Fallback if only single key exists for backward compatibility
    const singleKey = process.env.ENCRYPTION_KEY;
    if (singleKey && singleKey.length === 64) {
      return new Map([["v1", Buffer.from(singleKey, "hex")]]);
    }
    throw new Error("ENCRYPTION_KEYS or ENCRYPTION_KEY env var is required.");
  }

  const keysMap = new Map<string, Buffer>();
  keysStr.split(",").forEach((pair) => {
    const [ver, keyHex] = pair.split(":");
    if (ver && keyHex && keyHex.length === 64) {
      keysMap.set(ver, Buffer.from(keyHex, "hex"));
    }
  });

  if (keysMap.size === 0) {
    throw new Error("No valid keys found in ENCRYPTION_KEYS.");
  }

  return keysMap;
}

/**
 * Get the latest key version and its buffer.
 */
function getLatestKey(): { version: string; key: Buffer } {
  const keys = getAllKeys();
  const versions = Array.from(keys.keys()).sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' })
  );

  const latestVersion = versions[0];
  if (!latestVersion) {
    throw new Error("CRITICAL: No versioned encryption keys found in ENCRYPTION_KEYS mapping.");
  }

  const key = keys.get(latestVersion);
  if (!key) {
    throw new Error(`CRITICAL: Key buffer missing for version ${latestVersion}`);
  }

  return { version: latestVersion, key };
}

/**
 * Encrypt a plaintext value.
 * Returns format: {version}:{iv}:{authTag}:{ciphertext}
 */
export function encrypt(plaintext: string): string {
  const { version, key } = getLatestKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // New persistent format: version:iv:authTag:ciphertext
  return `${version}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt a value previously encrypted.
 * Detects version from prefix or attempts legacy v1 if no prefix.
 */
export function decrypt(encryptedData: string): string {
  const parts = encryptedData.split(":");
  let version = "v1";
  let ivHex: string, authTagHex: string, ciphertext: string;

  if (parts.length === 4) {
    // Current versioned format: vN:iv:authTag:ciphertext
    version = parts[0]!;
    ivHex = parts[1]!;
    authTagHex = parts[2]!;
    ciphertext = parts[3]!;
  } else if (parts.length === 3) {
    // Legacy format (no version prefix, assume v1)
    ivHex = parts[0]!;
    authTagHex = parts[1]!;
    ciphertext = parts[2]!;
  } else {
    throw new Error("Invalid encrypted data format.");
  }

  const keys = getAllKeys();
  const key = keys.get(version);

  if (!key) {
    throw new Error(`Encryption key version ${version} not found in environment.`);
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Re-encrypt data to the latest key version if it's using an old one.
 * Used for background rotation without taking the app down.
 */
export function rotateEncryption(encryptedData: string): { data: string; rotated: boolean } {
  const parts = encryptedData.split(":");
  const currentVersion = parts.length === 4 ? parts[0] : "v1";
  const { version: latestVersion } = getLatestKey();

  if (currentVersion === latestVersion) {
    return { data: encryptedData, rotated: false };
  }

  // Decrypt with old key, re-encrypt with newest
  const plaintext = decrypt(encryptedData);
  return { data: encrypt(plaintext), rotated: true };
}


/**
 * Mask a bank account number, showing only the last 4 digits.
 * Works on both plain and encrypted values (decrypts first if encrypted).
 */
export function maskAccountNumber(value: string): string {
  let plaintext: string;

  const parts = value.split(":");
  const looksEncrypted =
    (parts.length === 4 && /^v\d+$/i.test(parts[0] || "")) ||
    parts.length === 3;

  if (looksEncrypted) {
    try {
      plaintext = decrypt(value);
    } catch {
      // If decryption fails, treat as plain text
      plaintext = value;
    }
  } else {
    plaintext = value;
  }

  if (plaintext.length <= 4) return plaintext;
  return "X".repeat(plaintext.length - 4) + plaintext.slice(-4);
}
