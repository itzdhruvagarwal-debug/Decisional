import { AppError } from "@/lib/errors";
import "server-only";

import { PrismaClient, Prisma } from "@prisma/client";
import { encrypt, decrypt } from "./encryption";
import { randomBytes } from "node:crypto";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const ENCRYPTED_FIELDS = [
  "panNumber",
  "gstNumber",
  "cinNumber",
  "bankAccountNumber",
  "accountNumber", // BankAccount model field
  "upiId",
  "twoFactorSecret",
  "twoFactorRecoveryCodes", // encrypted at rest — contains hashed recovery codes
  "gstin",
  "itrAcknowledgementNumber",
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

function stripSoftDeletedRecords<T>(data: T): T {
  if (!data || typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data
      .filter((item) => {
        if (!item || typeof item !== "object") return true;
        const record = item as Record<string, unknown>;
        return record.deletedAt === null || record.deletedAt === undefined;
      })
      .map((item) => stripSoftDeletedRecords(item)) as T;
  }

  const record = data as Record<string, unknown>;

  // If the root object itself has a deletedAt that is not null (and not undefined)
  if (record.deletedAt !== null && record.deletedAt !== undefined) {
    return null as T;
  }

  // Otherwise, traverse keys
  for (const key of Object.keys(record)) {
    const val = record[key];
    if (val && typeof val === "object") {
      if (Array.isArray(val)) {
        record[key] = val
          .filter((item) => {
            if (!item || typeof item !== "object") return true;
            const itemRecord = item as Record<string, unknown>;
            return itemRecord.deletedAt === null || itemRecord.deletedAt === undefined;
          })
          .map((item) => stripSoftDeletedRecords(item));
      } else {
        const valRecord = val as Record<string, unknown>;
        if (valRecord.deletedAt !== null && valRecord.deletedAt !== undefined) {
          record[key] = null;
        } else {
          record[key] = stripSoftDeletedRecords(val);
        }
      }
    }
  }
  return data;
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
  });

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
      throw AppError.internal(message);
    }
  }

  return baseClient.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const startTime = performance.now();

          // --- 1. Soft Delete Implementation (Security & Compliance) ---
          const MODELS_WITH_SOFT_DELETE = [
            "User",
            "Campaign",
            "Application",
            "Deal",
            "BankAccount",
            "Transaction",
            "Dispute",
            "DisputeEvidence",
            "Review",
            "Message",
          ];
          const isSoftDeleteModel = MODELS_WITH_SOFT_DELETE.includes(model || "");

          if (isSoftDeleteModel) {
            // Prevent hard deletes for compliance
            if (operation === "delete") {
              operation = "update";
              (args as Record<string, unknown>)["data"] = { deletedAt: new Date() };
            } else if (operation === "deleteMany") {
              operation = "updateMany";
              (args as Record<string, unknown>)["data"] = { deletedAt: new Date() };
            }

            // Prevent reading soft-deleted rows implicitly
            if (
              [
                "findFirst",
                "findMany",
                "count",
                "aggregate",
                "groupBy",
              ].includes(operation as string)
            ) {
              args = args || ({} as Record<string, unknown>);
              const typedArgs = args as Record<string, unknown>;
              typedArgs["where"] = { ...(typedArgs["where"] as object), deletedAt: null };
            }
          }

          // --- 2. Data Pre-processing (Encryption) ---
          if (
            ["create", "update", "upsert", "createMany", "updateMany"].includes(
              operation as string,
            )
          ) {
            args = args || ({} as Record<string, unknown>);
            const typedArgs2 = args as Record<string, unknown>;
            if (typedArgs2["data"]) {
              processData(typedArgs2["data"] as Record<string, unknown>, (val) => {
                // Only encrypt if not already encrypted
                return isLikelyEncrypted(val) ? val : encrypt(val);
              });
            }
          }

          // --- Execute Query ---
          let result = await query(args);

          // --- Prevent Soft-deleted reads via findUnique ---
          if (
            isSoftDeleteModel &&
            (operation === "findUnique" || operation === "findUniqueOrThrow") &&
            result
          ) {
            if (result && typeof result === "object" && "deletedAt" in result && (result as Record<string, unknown>).deletedAt) {
              if (operation === "findUniqueOrThrow") {
                throw AppError.notFound(`${model} not found (soft deleted)`);
              }
              result = null;
            }
          }

          // --- Clean soft deleted relation records recursively ---
          if (result) {
            result = stripSoftDeletedRecords(result);
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
  globalForPrisma.prisma ??
  (createPrismaClient() as unknown as PrismaClient);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Ensures that the PLATFORM_TREASURY user and wallet exist in the database.
 * If not, they are created dynamically to prevent transaction failures.
 */
export async function ensurePlatformTreasury(tx?: Prisma.TransactionClient) {
  const client = tx || prisma;
  
  let user = await client.user.findUnique({
    where: { id: "PLATFORM_TREASURY" },
  });
  
  if (!user) {
    await client.user.create({
      data: {
        id: "PLATFORM_TREASURY",
        email: "treasury@platform.local",
        phone: "+919999999999",
        // Cryptographically random — not a valid bcrypt hash, so this account can never be logged into.
        passwordHash: `sys:${randomBytes(32).toString("hex")}`,
        userType: "BRAND",
        status: "ACTIVE",
        verificationLevel: "FULL",
        emailVerified: true,
        phoneVerified: true,
      },
    });
  }
  
  let wallet = await client.wallet.findUnique({
    where: { userId: "PLATFORM_TREASURY" },
  });
  
  if (!wallet) {
    wallet = await client.wallet.create({
      data: {
        userId: "PLATFORM_TREASURY",
        balance: 0,
        pendingBalance: 0,
      },
    });
  }

  // Install database-level triggers to prevent deletion of PLATFORM_TREASURY user/wallet (defense-in-depth)
  try {
    await client.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION protect_platform_treasury() RETURNS TRIGGER AS $$
      BEGIN
          IF OLD.id = 'PLATFORM_TREASURY' THEN
              RAISE EXCEPTION 'TREASURY SECURITY: Deletion of the virtual user PLATFORM_TREASURY is prohibited.';
          END IF;
          RETURN OLD;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION protect_platform_treasury_wallet() RETURNS TRIGGER AS $$
      BEGIN
          IF OLD."userId" = 'PLATFORM_TREASURY' THEN
              RAISE EXCEPTION 'TREASURY SECURITY: Deletion of the PLATFORM_TREASURY wallet is prohibited.';
          END IF;
          RETURN OLD;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.$executeRawUnsafe(`
      DO $$ 
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_treasury') THEN
              CREATE TRIGGER trg_protect_treasury
              BEFORE DELETE ON "User"
              FOR EACH ROW EXECUTE FUNCTION protect_platform_treasury();
          END IF;
      END $$;
    `);

    await client.$executeRawUnsafe(`
      DO $$ 
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_treasury_wallet') THEN
              CREATE TRIGGER trg_protect_treasury_wallet
              BEFORE DELETE ON "Wallet"
              FOR EACH ROW EXECUTE FUNCTION protect_platform_treasury_wallet();
          END IF;
      END $$;
    `);
  } catch (triggerError) {
    logger.warn("Failed to ensure PLATFORM_TREASURY DB-level delete protection triggers", { error: triggerError });
  }
  
  return wallet;
}

export default prisma;
