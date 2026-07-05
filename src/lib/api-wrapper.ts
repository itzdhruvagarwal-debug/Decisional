import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { logger } from "./logger";
import { rateLimit } from "./rate-limit";
import { auth } from "./auth";
import { requireActiveAdmin } from "./admin-auth";
import {
  httpRequestDurationMs,
  httpRequestsTotal,
  systemErrorsTotal,
} from "./metrics";
import { AppError } from "./errors";

import type { RATE_LIMIT_CONFIGS } from "./rate-limit";

// Next.js 15+ compatible context type (params is a Promise)
type ApiContext = {
  params: Promise<Record<string, string | string[]>>;
};

export interface ValidatedNextRequest<
  TBody = unknown,
  TQuery = unknown,
  TParams = unknown
> extends NextRequest {
  validBody?: TBody;
  validQuery?: TQuery;
  validParams?: TParams;
  session?: unknown;
}

type ApiHandler = (
  req: ValidatedNextRequest,
  context: ApiContext,
) => Promise<Response> | Response;

interface ApiWrapperOptions {
  rateLimit?: {
    limit: number;
    window: number; // in seconds
  };
  requireAuth?: boolean; // Can be extended with session checks
  requireAdmin?: boolean; // Require active admin access
  adminErrorMessage?: string; // Custom error message for admin check failure
  requireBrand?: boolean; // Require brand account
  brandErrorMessage?: string; // Custom error message for brand check failure
  requireInfluencer?: boolean; // Require influencer account
  influencerErrorMessage?: string; // Custom error message for influencer check failure
  userRateLimit?: {
    bucket: keyof typeof RATE_LIMIT_CONFIGS;
    errorMessage?: string;
  };
  validate?: {
    body?: z.ZodSchema;
    query?: z.ZodSchema;
    params?: z.ZodSchema;
  };
}

// Sanitization is expected to be handled by Zod schemas or the handler directly.

/**
 * Standardized API Response Utility
 * Provides consistent response format across all API routes
 */
export const ApiResponse = {
  success: (data: unknown, message = "Success", status = 200) =>
    NextResponse.json({ success: true, message, data }, { status }),
  error: (message: string, status = 400, errors?: unknown) =>
    NextResponse.json(
      { success: false, message, ...(errors && typeof errors === "object" ? { errors } : {}) },
      { status },
    ),
  forbidden: (message = "Forbidden") =>
    NextResponse.json({ success: false, message }, { status: 403 }),
  unauthorized: () =>
    NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }),
  notFound: (message = "Resource not found") =>
    NextResponse.json({ success: false, message }, { status: 404 }),
  conflict: (message = "Resource already exists") =>
    NextResponse.json({ success: false, message }, { status: 409 }),
  tooManyRequests: (message = "Too Many Requests", retryAfter?: number) =>
    NextResponse.json(
      { success: false, message },
      {
        status: 429,
        ...(retryAfter && { headers: { "Retry-After": retryAfter.toString() } }),
      },
    ),
};

/**
 * Enterprise-grade API Wrapper
 * - Standardized Error Handling  (instanceof-based, not string-matching)
 * - Request Logging
 * - Rate Limiting (Redis-backed)
 * - Performance Monitoring
 *
 * Error classification priority:
 *   1. AppError         → typed statusCode + errorCode, thrown by route handlers
 *   2. ZodError         → 400 Validation Error
 *   3. Prisma P2002     → 409 Conflict
 *   4. Prisma P2025     → 404 Not Found
 *   5. Prisma P2003     → 400 Bad Request
 *   6. Anything else    → 500 Internal Server Error (never leaks internals)
 */
export function apiWrapper(handler: ApiHandler, options?: ApiWrapperOptions) {
  return async (req: NextRequest, context: ApiContext) => {
    const start = Date.now();
    const requestId = crypto.randomUUID();
    const method = req.method;
    const url = req.nextUrl.pathname;
    const ip =
      (req as NextRequest & { ip?: string }).ip ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";

    // Request body size protection: reject bodies > 2MB
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > 2 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Payload Too Large", requestId },
        { status: 413 },
      );
    }

    // Sanitize URL to avoid high cardinality in metrics (e.g., removing UUIDs or IDs)
    const sanitizedUrl = url
      .replace(/\/[a-f0-9-]{36}/g, "/:id")
      .replace(/\/\d+/g, "/:id");

    // Timer for prometheus metric
    const endTimer = httpRequestDurationMs.startTimer({
      method,
      route: sanitizedUrl,
    });

    // 1. Logging Request
    logger.info(`[API] ${method} ${url} - Started`, { requestId, ip });

    try {
      // Enterprise WAF: Check if IP is dynamically blacklisted
      const { isIpBanned, banIp } = await import("./blacklist");
      if (await isIpBanned(ip)) {
        logger.warn(`[WAF] Blocked request from blacklisted IP: ${ip}`, {
          requestId,
          url,
        });
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Enterprise WAF: Advanced Threat Detection (Heuristics)
      let decodedUrl = req.url.toLowerCase();
      try {
        decodedUrl = decodeURIComponent(req.url).toLowerCase();
      } catch {
        logger.warn(`[WAF] Malformed URL encoding on ${url}`, { requestId });
      }
      const sqlInjectionPattern =
        /(?:^|[^a-zA-Z])(?:union\s+select|drop\s+table|insert\s+into|delete\s+from|alter\s+table|;\s*--)|(?:\/\*|\*\/)/i;
      const pathTraversalPattern = /(?:\.\.\/|\.\.\\|etc\/passwd|boot\.ini)/i;
      const cmdInjectionPattern = /[;|&`] (?:[{}]|eval|exec|system)/i;
      const scannerPattern = /(?:\/wp-admin|\.env|\.git|phpinfo)/i;

      if (
        sqlInjectionPattern.test(decodedUrl) ||
        pathTraversalPattern.test(decodedUrl) ||
        cmdInjectionPattern.test(decodedUrl) ||
        scannerPattern.test(decodedUrl)
      ) {
        // Instantly ban scanner IPs for 24 hours
        await banIp(
          ip,
          `WAF Trigger: Malicious URL Pattern matched on ${url}`,
          86400,
        );
        return NextResponse.json(
          { error: "Malicious payload detected" },
          { status: 403 },
        );
      }
      let rateLimitHeaders: Record<string, string> | undefined = undefined;

      // 2. Rate Limiting (if enabled)
      if (options?.rateLimit) {
        // Use IP + Route for rate limiting key
        const limitConfig = {
          uniqueToken: `api:${ip}:${url}`,
          limit: options.rateLimit.limit,
          window: options.rateLimit.window,
        };

        const { success, limit, remaining, reset } =
          await rateLimit(limitConfig);

        rateLimitHeaders = {
          "x-ratelimit-limit": limit.toString(),
          "x-ratelimit-remaining": remaining.toString(),
          "x-ratelimit-reset": reset.toString(),
        };

        if (!success) {
          logger.warn(`[API] Rate limit exceeded for ${ip} on ${url}`, {
            requestId,
          });

          const retryAfter = Math.max(0, Math.ceil(reset - Date.now() / 1000));

          return NextResponse.json(
            {
              error: "Too Many Requests",
              message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
            },
            {
              status: 429,
              headers: {
                "X-RateLimit-Limit": limit.toString(),
                "X-RateLimit-Remaining": remaining.toString(),
                "X-RateLimit-Reset": reset.toString(),
                "Retry-After": retryAfter.toString(),
              },
            },
          );
        }
      }

      const shouldRequireAuth =
        options?.requireAuth ||
        options?.requireAdmin ||
        options?.requireBrand ||
        options?.requireInfluencer ||
        options?.userRateLimit;

      if (shouldRequireAuth) {
        const session = await auth();
        if (!session?.user?.id) {
          return NextResponse.json(
            { error: "Unauthorized", message: "Authentication required." },
            { status: 401 },
          );
        }
        // Attach session to request for handlers that need it
        (req as NextRequest & { session: typeof session }).session = session;

        // Admin check (requires auth first)
        if (options?.requireAdmin) {
          try {
            await requireActiveAdmin(session.user);
          } catch {
            return NextResponse.json(
              { error: "Forbidden", message: options.adminErrorMessage || "Admin access required." },
              { status: 403 },
            );
          }
        }

        // Brand check
        if (options?.requireBrand && session.user.userType !== "BRAND") {
          return NextResponse.json(
            { success: false, message: options.brandErrorMessage || "Brand authorization required." },
            { status: 403 },
          );
        }

        // Influencer check
        if (options?.requireInfluencer && session.user.userType !== "INFLUENCER") {
          return NextResponse.json(
            { success: false, message: options.influencerErrorMessage || "Influencer authorization required." },
            { status: 403 },
          );
        }

        // User Rate Limit check
        if (options?.userRateLimit) {
          const { checkRateLimit } = await import("./rate-limit");
          const limit = await checkRateLimit(session.user.id, options.userRateLimit.bucket);
          if (!limit.success) {
            return NextResponse.json(
              {
                success: false,
                message:
                  options.userRateLimit.errorMessage ||
                  `Too many requests for ${options.userRateLimit.bucket.toLowerCase()}`,
              },
              { status: 429 },
            );
          }
        }
      }

      // 3. Declarative Schema Validation
      if (options?.validate) {
        const validatedReq = req as ValidatedNextRequest;

        // Validate Body if defined
        if (options.validate.body) {
          let bodyObj: unknown;
          if (method !== "GET" && method !== "HEAD") {
            try {
              bodyObj = await req.json();
            } catch {
              bodyObj = {};
            }
          } else {
            bodyObj = {};
          }
          const parsedBody = options.validate.body.parse(bodyObj);
          validatedReq.validBody = parsedBody;
          // Override req.json() so that subsequent calls in route handlers do not fail with "stream already read"
          validatedReq.json = async () => parsedBody;
        }

        // Validate Params if defined
        if (options.validate.params) {
          const resolvedParams = await context.params;
          validatedReq.validParams = options.validate.params.parse(resolvedParams);
        }

        // Validate Query if defined
        if (options.validate.query) {
          const { searchParams } = req.nextUrl;
          const queryObj = Object.fromEntries(searchParams.entries());
          validatedReq.validQuery = options.validate.query.parse(queryObj);
        }
      }

      // Global body sanitization is handled by Zod schemas in each handler.
      // The api-wrapper validates Content-Length and runs WAF checks above.

      const response = await handler(req, context);

      // 4. Logging Response
      const duration = Date.now() - start;
      logger.info(`[API] ${method} ${url} - Completed in ${duration}ms`, {
        requestId,
        status: response.status,
      });

      // Observe prometheus metrics
      endTimer({ status_code: response.status.toString() });
      httpRequestsTotal
        .labels({
          method,
          route: sanitizedUrl,
          status_code: response.status.toString(),
        })
        .inc();

      // Inject Request ID into every response for support traceability
      response.headers.set("x-request-id", requestId);
      if (rateLimitHeaders) {
        for (const [key, value] of Object.entries(rateLimitHeaders)) {
          response.headers.set(key, value);
        }
      }

      return response;
    } catch (error: unknown) {
      const duration = Date.now() - start;

      // ── 1. Typed AppError ──────────────────────────────────────────────────
      // Primary error path. Route handlers throw `AppError` (or its factory
      // helpers) for all business-rule violations. Classification is purely
      // type-based — no string-matching on error messages required.
      if (error instanceof AppError) {
        const { statusCode, message: appMessage, errorCode } = error;
        logger.warn(
          `[API] AppError (${errorCode}) on ${url} → ${statusCode}: ${appMessage}`,
          { requestId },
        );
        endTimer({ status_code: statusCode.toString() });
        httpRequestsTotal
          .labels({ method, route: sanitizedUrl, status_code: statusCode.toString() })
          .inc();
        return NextResponse.json(
          { error: errorCode, message: appMessage, requestId },
          { status: statusCode },
        );
      }

      // ── 2. Zod Validation Error ────────────────────────────────────────────
      if (error instanceof ZodError) {
        logger.warn(`[API] Validation Error on ${url}`, {
          requestId,
          errors: error.issues,
        });
        endTimer({ status_code: "400" });
        httpRequestsTotal
          .labels({ method, route: sanitizedUrl, status_code: "400" })
          .inc();
        return NextResponse.json(
          { error: "Validation Error", details: error.flatten(), requestId },
          { status: 400 },
        );
      }

      // ── 3. Prisma Known Request Errors (matched on error.code, not message) ─
      const errCode = (error as { code?: string }).code;
      if (errCode) {
        // P2002: Unique constraint violation → 409 Conflict
        if (errCode === "P2002") {
          logger.warn(`[API] Conflict (Unique Constraint) on ${url}`, { requestId, error });
          endTimer({ status_code: "409" });
          httpRequestsTotal.labels({ method, route: sanitizedUrl, status_code: "409" }).inc();
          return NextResponse.json(
            { error: "Conflict", message: "Resource already exists.", requestId },
            { status: 409 },
          );
        }
        // P2025: Record not found → 404 Not Found
        if (errCode === "P2025") {
          logger.warn(`[API] Not Found (Prisma) on ${url}`, { requestId, error });
          endTimer({ status_code: "404" });
          httpRequestsTotal.labels({ method, route: sanitizedUrl, status_code: "404" }).inc();
          return NextResponse.json(
            { error: "Not Found", message: "Resource not found.", requestId },
            { status: 404 },
          );
        }
        // P2003: Foreign key constraint failed → 400 Bad Request
        if (errCode === "P2003") {
          logger.warn(`[API] Bad Request (Foreign Key) on ${url}`, { requestId, error });
          endTimer({ status_code: "400" });
          httpRequestsTotal.labels({ method, route: sanitizedUrl, status_code: "400" }).inc();
          return NextResponse.json(
            { error: "Bad Request", message: "Invalid reference to related resource.", requestId },
            { status: 400 },
          );
        }
      }

      // ── 4. Unhandled / Unexpected Error → 500 ─────────────────────────────
      // Never leaks internals to the client. Full error + stack logged server-side.
      logger.error(`[API] Unhandled Error on ${url}`, error, {
        requestId,
        duration,
      });
      systemErrorsTotal
        .labels({ error_type: "unhandled_api_error", route: sanitizedUrl })
        .inc();
      endTimer({ status_code: "500" });
      httpRequestsTotal
        .labels({ method, route: sanitizedUrl, status_code: "500" })
        .inc();

      return NextResponse.json(
        {
          error: "Internal Server Error",
          message: `An unexpected error occurred. Reference ID: ${requestId}`,
          requestId,
        },
        { status: 500 },
      );
    }
  };
}

// Re-export getErrorMessage to avoid breaking existing import paths
export { getErrorMessage } from "./utils";
