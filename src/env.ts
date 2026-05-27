import { z } from "zod";

const isBuildTime =
  typeof process !== "undefined" &&
  (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build" ||
    process.argv.join(" ").includes("next build")
  );

const envSchema = z.object({
  // Server-side
  DATABASE_URL: z.string().min(1),
  PGBOUNCER_URL: z.string().min(1).optional(),
  PRISMA_ACCELERATE_URL: z.string().min(1).optional(),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  NEXTAUTH_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  APP_BASE_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(32),

  // Redis: required in production for rate limiting, idempotency, and queues.
  REDIS_URL: z.string().min(1).optional(),

  // Third-party APIs
  RAZORPAY_KEY_ID: z.string().min(1),
  RAZORPAY_KEY_SECRET: z.string().min(1),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1),
  RAZORPAY_ACCOUNT_NUMBER: z.string().min(1).optional(),

  // Logging and monitoring
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  PROMETHEUS_AUTH_TOKEN: z.string().min(32).optional(),

  // Security
  CRON_SECRET: z.string().min(32).optional(),
  ENCRYPTION_KEYS: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32).optional(),

  // Feature flags and limits
  PLATFORM_FEE_PERCENTAGE: z.coerce.number().default(10),
  GATEWAY_FEE_PERCENTAGE: z.coerce.number().default(2),
  MIN_WITHDRAWAL_AMOUNT: z.coerce.number().default(50000),
  MAX_WALLET_BALANCE: z.coerce.number().default(1000000000),
  ADMIN_EMAILS: z.string().min(1).optional(),

  // Storage
  STORAGE_PROVIDER: z
    .enum(["local", "s3", "r2"])
    .default("local"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  STORAGE_PUBLIC_URL: z.string().optional(),
  R2_PUBLIC_URL: z.string().optional(),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV !== "production") return;

  const isVercel = process.env.VERCEL === "1";

  if (!env.CRON_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["CRON_SECRET"],
      message: "CRON_SECRET is required in production for Vercel Cron routes.",
    });
  }

  if (!env.REDIS_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["REDIS_URL"],
      message: "REDIS_URL is required in production. Use Upstash rediss:// on Vercel.",
    });
  } else if (isVercel && !env.REDIS_URL.startsWith("rediss://")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["REDIS_URL"],
      message: "Use a TLS rediss:// Redis URL for Upstash/Vercel production.",
    });
  }

  if (isVercel && !env.PGBOUNCER_URL && !env.PRISMA_ACCELERATE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["PGBOUNCER_URL"],
      message:
        "PGBOUNCER_URL or PRISMA_ACCELERATE_URL is required on Vercel to avoid exhausting Supabase Postgres connections.",
    });
  }

  if (env.PGBOUNCER_URL && !env.PGBOUNCER_URL.includes("pgbouncer=true")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["PGBOUNCER_URL"],
      message: "PGBOUNCER_URL should include pgbouncer=true for Prisma transaction pooling.",
    });
  }

  if (!env.NEXT_PUBLIC_APP_URL && !env.APP_BASE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["NEXT_PUBLIC_APP_URL"],
      message: "NEXT_PUBLIC_APP_URL or APP_BASE_URL is required for production links and callbacks.",
    });
  }

  if (!env.RAZORPAY_ACCOUNT_NUMBER) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["RAZORPAY_ACCOUNT_NUMBER"],
      message: "RAZORPAY_ACCOUNT_NUMBER is required in production for RazorpayX payouts.",
    });
  }

  if (!env.PROMETHEUS_AUTH_TOKEN) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["PROMETHEUS_AUTH_TOKEN"],
      message: "PROMETHEUS_AUTH_TOKEN is required in production to protect /api/metrics.",
    });
  }

  if (env.STORAGE_PROVIDER === "local") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["STORAGE_PROVIDER"],
      message: "Use STORAGE_PROVIDER=r2 or s3 in production; local uploads are not durable on Vercel.",
    });
  }

  if (env.STORAGE_PROVIDER === "r2" || env.STORAGE_PROVIDER === "s3") {
    const requiredStorageVars = ["S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"] as const;
    for (const key of requiredStorageVars) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when STORAGE_PROVIDER=${env.STORAGE_PROVIDER}.`,
        });
      }
    }

    if (!env.STORAGE_PUBLIC_URL && !env.R2_PUBLIC_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["STORAGE_PUBLIC_URL"],
        message:
          "STORAGE_PUBLIC_URL or R2_PUBLIC_URL is required so uploaded files resolve from a durable public domain.",
      });
    }

    if (env.STORAGE_PROVIDER === "r2" && !env.S3_ENDPOINT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["S3_ENDPOINT"],
        message: "S3_ENDPOINT is required for Cloudflare R2.",
      });
    }
  }
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  const errorMessage = `Invalid environment variables:\n${JSON.stringify(
    _env.error.format(),
    null,
    2,
  )}`;

  if (!isBuildTime) {
    console.error(errorMessage);
    throw new Error(
      "Application cannot start: missing or invalid environment variables. Check server logs.",
    );
  } else {
    // During build, log but don't throw. Vercel injects runtime secrets separately.
    console.warn("[BUILD] Environment variable warning:", errorMessage);
  }
}

// Security: in production runtime, never fall back to raw process.env.
if (
  !_env.success &&
  !isBuildTime &&
  typeof window === "undefined" &&
  process.env.NODE_ENV === "production"
) {
  throw new Error(
    `[FATAL] Environment validation failed in production. Fix .env before deploying.\n${_env.error?.message ?? "Unknown validation error"}`,
  );
}

export const env = _env.success
  ? _env.data
  : (process.env as unknown as z.infer<typeof envSchema>);
