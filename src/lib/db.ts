import { PrismaClient } from "@prisma/client";
import { encrypt, decrypt } from "./encryption";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | ReturnType<typeof createPrismaClient> | undefined;
};

const ENCRYPTED_FIELDS = [
  "panNumber",
  "gstNumber",
  "cinNumber",
  "bankAccountNumber",
  "upiId",
];

function isLikelyEncrypted(val: string): boolean {
  // Check if it matches our vN:iv:authTag:ciphertext (4 parts) or iv:authTag:ciphertext (3 parts) format
  if (typeof val !== "string" || !val.includes(":")) return false;
  const parts = val.split(":").length;
  return parts === 3 || parts === 4;
}

function processData(
  data: Record<string, unknown>,
  processFn: (val: string) => string,
  _depth: number = 0,
): void {
  // Guard: prevent infinite recursion via deeply nested objects (DoS prevention)
  if (!data || typeof data !== "object" || _depth > 10) return;

  for (const key of Object.keys(data)) {
    const value = data[key];
    if (ENCRYPTED_FIELDS.includes(key) && typeof value === "string") {
      try {
        data[key] = processFn(value);
      } catch (e) {
        // Log encryption/decryption failures — silent failures hide data security issues
        logger.warn(
          `[DB Security] Failed to process encrypted field "${key}". Data may be stored unprocessed.`,
          { field: key, error: e instanceof Error ? e.message : String(e) },
        );
        // Retain original value to avoid data corruption, but the warning is raised
      }
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      processData(value as Record<string, unknown>, processFn, _depth + 1);
    }
  }
}

import { logger } from "./logger";

function isBuildTime(): boolean {
  return (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build" ||
    process.argv.join(" ").includes("next build")
  );
}

function isLocalDatabaseUrl(url?: string): boolean {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function hasDatabaseSsl(url?: string): boolean {
  if (!url) return false;
  return url.includes("sslmode=require") || url.includes("ssl=true");
}

function createPrismaClient() {
  const isProd = process.env.NODE_ENV === "production";

  // ── Connection Pool Configuration ────────────────────────────────────────
  // Enterprise scaling requires a pooler (PgBouncer or Prisma Accelerate)
  const poolUrl = process.env.PRISMA_ACCELERATE_URL || process.env.PGBOUNCER_URL;
  const datasourceUrl = poolUrl || process.env.DATABASE_URL;

  const baseClient = new PrismaClient({
    log: !isProd ? ["error", "warn"] : ["error"],
    errorFormat: "minimal",
    ...(poolUrl && datasourceUrl ? { datasourceUrl } : {}),
  } as any);

  const usesManagedPrismaTransport = Boolean(process.env.PRISMA_ACCELERATE_URL);
  const allowInsecureDatabase =
    process.env.ALLOW_INSECURE_DATABASE === "true" ||
    isLocalDatabaseUrl(datasourceUrl);

  if (
    isProd &&
    !usesManagedPrismaTransport &&
    !hasDatabaseSsl(datasourceUrl) &&
    !allowInsecureDatabase
  ) {
    const message =
      "DATABASE_URL must include sslmode=require for remote production databases.";
    if (isBuildTime()) {
      logger.warn(`[BUILD] ${message}`);
    } else {
      logger.error(`[SECURITY] ${message}`);
      throw new Error(message);
    }
  }

  return baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const startTime = performance.now();

          // --- 1. Soft Delete Implementation (Security & Compliance) ---
          if (model === "User") {
            // Prevent hard deletes for compliance
            if (operation === "delete") {
              operation = "update" as any;
              args = {
                ...(args || {}),
                data: { deletedAt: new Date() },
              } as any;
            } else if (operation === "deleteMany") {
              operation = "updateMany" as any;
              args = {
                ...(args || {}),
                data: { deletedAt: new Date() },
              } as any;
            }

            // Prevent reading soft-deleted users implicitly
            if (
              [
                "findFirst",
                "findMany",
                "count",
                "aggregate",
                "groupBy",
              ].includes(operation as string)
            ) {
              args = args || ({} as any);
              const anyArgs = args as any;
              anyArgs.where = { ...(anyArgs.where || {}), deletedAt: null };
            }
          }

          // --- 2. Data Pre-processing (Encryption) ---
          if (
            ["create", "update", "upsert", "createMany", "updateMany"].includes(
              operation as string,
            )
          ) {
            args = args || ({} as any);
            const anyArgs = args as any;
            if (anyArgs.data) {
              processData(anyArgs.data, (val) => {
                // Only encrypt if not already encrypted
                return isLikelyEncrypted(val) ? val : encrypt(val);
              });
            }
          }

          // --- Execute Query ---
          let result = await query(args);

          // --- Prevent Soft-deleted user reads via findUnique ---
          if (
            model === "User" &&
            (operation === "findUnique" || operation === "findUniqueOrThrow") &&
            result
          ) {
            if ((result as any).deletedAt) {
              if (operation === "findUniqueOrThrow") {
                throw new Error("User not found (soft deleted)");
              }
              result = null;
            }
          }

          // --- 3. Data Post-processing (Decryption) ---
          if (result && typeof result === "object") {
            if (Array.isArray(result)) {
              result.forEach((row) => {
                if (row && typeof row === "object") {
                  processData(row as Record<string, unknown>, (val) => {
                    return isLikelyEncrypted(val) ? decrypt(val) : val;
                  });
                }
              });
            } else {
              processData(result as Record<string, unknown>, (val) => {
                return isLikelyEncrypted(val) ? decrypt(val) : val;
              });
            }
          }

          // --- 4. Query Profiling & Slow Query Alerting ---
          const duration = performance.now() - startTime;
          if (duration > 500) {
            // Log slow queries (potential DoS/performance issue) without dumping raw PII data
            logger.warn(
              `[DB SECURITY] SLOW QUERY DETECTED: ${model}.${operation} took ${duration.toFixed(2)}ms`,
            );
          }

          // --- 5. Enterprise Audit Trail (CDC simulation for sensitive financial models) ---
          if (
            model &&
            ["Wallet", "Deal", "Withdrawal", "BankAccount"].includes(model) &&
            ["create", "update", "delete", "upsert", "updateMany", "deleteMany"].includes(operation as string)
          ) {
            const auditMessage = `[ENTERPRISE DB AUDIT] Operation: ${String(operation).toUpperCase()} on Entity: ${model} executed at ${new Date().toISOString()}`;
            logger.info(auditMessage, {
              // We omit raw args since they might contain plaintext fields right before encryption, 
              // but we record the event for tracing data lifecycle changes.
              duration_ms: duration.toFixed(2)
            });
          }

          return result;
        },
      },
    },
  });
}

export const prisma =
  (globalForPrisma.prisma as ReturnType<typeof createPrismaClient>) ??
  createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma as any;
