import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "./logger";
import { rateLimit } from "./rate-limit";
import { logActivity, ActivityAction } from "./audit";
import { auth } from "./auth";
import {
  httpRequestDurationMs,
  httpRequestsTotal,
  systemErrorsTotal,
} from "./metrics";

// Next.js 15+ compatible context type (params is a Promise)
type ApiContext = {
  params: Promise<Record<string, string | string[]>>;
};

type ApiHandler = (
  req: NextRequest,
  context: ApiContext,
) => Promise<NextResponse> | NextResponse;

interface ApiWrapperOptions {
  rateLimit?: {
    limit: number;
    window: number; // in seconds
  };
  requireAuth?: boolean; // Can be extended with session checks
  audit?: {
    action: ActivityAction | string;
    entityType?: string;
    getEntityId?: (responseBody: any) => string;
  };
}

// Sanitization is expected to be handled by Zod schemas or the handler directly.

/**
 * Enterprise-grade API Wrapper
 * - Standardized Error Handling
 * - Request Logging
 * - Rate Limiting (Redis-backed)
 * - Performance Monitoring
 */
export function apiWrapper(handler: ApiHandler, options?: ApiWrapperOptions) {
  return async (req: NextRequest, context: ApiContext) => {
    const start = Date.now();
    const requestId = crypto.randomUUID();
    const method = req.method;
    const url = req.nextUrl.pathname;
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

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
      const cmdInjectionPattern = /(?:;|\||&|`)\$(?:{|}|eval|exec|system)/i;
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

      if (options?.requireAuth) {
        const session = await auth();
        if (!session?.user?.id) {
          return NextResponse.json(
            { error: "Unauthorized", message: "Authentication required." },
            { status: 401 },
          );
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

      // 5. Automatic Audit Logging (if configured and successful)
      if (options?.audit && response.ok) {
        // Non-blocking
        (async () => {
          try {
            const session = await auth();
            if (session?.user?.id) {
              let entityId = undefined;
              if (options?.audit && options.audit.getEntityId) {
                // Clone response to read body without consuming stream
                const clone = response.clone();
                const body = await clone.json();
                entityId = options.audit.getEntityId(body);
              }

              if (options?.audit) {
                await logActivity({
                  userId: session.user.id,
                  action: options.audit.action,
                  ...(options.audit.entityType ? { entityType: options.audit.entityType } : {}),
                  ...(entityId ? { entityId } : {}),
                  ipAddress: ip,
                  metadata: { method, url, duration },
                });
              }
            }
          } catch (e: any) {
            logger.warn("Failed to audit log API action", {
              error: e.message || e,
            });
          }
        })();
      }

      return response;
    } catch (error: any) {
      const duration = Date.now() - start;

      // 5. Error Handling
      if (error instanceof ZodError) {
        logger.warn(`[API] Validation Error on ${url}`, {
          requestId,
          errors: error.issues,
        });
        return NextResponse.json(
          { error: "Validation Error", details: error.flatten() },
          { status: 400 },
        );
      }

      // Prisma Error Handling (Common Codes)
      if (error.code) {
        // P2002: Unique constraint violation
        if (error.code === "P2002") {
          logger.warn(`[API] Conflict (Unique Constraint) on ${url}`, {
            requestId,
            error,
          });
          return NextResponse.json(
            { error: "Conflict", message: "Resource already exists." },
            { status: 409 },
          );
        }
        // P2025: Record not found
        if (error.code === "P2025") {
          logger.warn(`[API] Not Found (Prisma) on ${url}`, {
            requestId,
            error,
          });
          return NextResponse.json(
            { error: "Not Found", message: "Resource not found." },
            { status: 404 },
          );
        }
        // P2003: Foreign key constraint failed
        if (error.code === "P2003") {
          logger.warn(`[API] Bad Request (Foreign Key) on ${url}`, {
            requestId,
            error,
          });
          return NextResponse.json(
            {
              error: "Bad Request",
              message: "Invalid reference to related resource.",
            },
            { status: 400 },
          );
        }
      }

      // Handle specific known error messages or types
      const rawMessage = error.message || error?.error?.description || "";
      const message = rawMessage.toLowerCase();
      let status = 500;
      let errorTitle = "Internal Server Error";
      let userMessage: string | undefined;

      if (
        message.includes("unauthorized") ||
        message.includes("unauthenticated") ||
        message.includes("token")
      ) {
        status = 401;
        errorTitle = "Unauthorized";
        userMessage = "Authentication required.";
      } else if (message.includes("authentication failed")) {
        // Razorpay / Gateway auth error -> This is a server configuration issue, not a user auth issue
        status = 500;
        errorTitle = "Gateway Configuration Error";
        userMessage = "Payment gateway authentication failed across the server.";
      } else if (
        message.includes("forbidden") ||
        message.includes("permission denied") ||
        message.includes("access denied")
      ) {
        status = 403;
        errorTitle = "Forbidden";
        userMessage = "You do not have permission to perform this action.";
      } else if (message.includes("not found")) {
        status = 404;
        errorTitle = "Not Found";
        userMessage = "The requested resource was not found.";
      } else if (
        message.includes("rate limit") ||
        message.includes("too many requests")
      ) {
        status = 429;
        errorTitle = "Too Many Requests";
        userMessage = rawMessage; // Safe to expose
      } else if (
        message.includes("invalid") ||
        message.includes("bad request") ||
        message.includes("already exists") ||
        message.includes("required") ||
        message.includes("minimum") ||
        message.includes("maximum") ||
        message.includes("must be") ||
        message.includes("cannot") ||
        message.includes("verification required") ||
        message.includes("trust score") ||
        message.includes("budget cap") ||
        message.includes("deadline") ||
        message.includes("blocked") ||
        message.includes("lock") ||
        message.includes("failed")
      ) {
        status = 400;
        errorTitle = "Bad Request";
        userMessage = rawMessage; // Business rule violations are safe to show
      }

      // Only log full stack for 500s or unexpected errors
      if (status === 500) {
        logger.error(`[API] Unhandled Error on ${url}`, error, {
          requestId,
          duration,
        });
        systemErrorsTotal
          .labels({ error_type: "unhandled_api_error", route: sanitizedUrl })
          .inc();
      } else {
        logger.warn(
          `[API] Client Error on ${url} (${status}): ${error.message}`,
          { requestId },
        );
        // We track 4xx errors as well but under normal HTTP requests total metric.
      }

      // Observe prometheus metrics for errors
      endTimer({ status_code: status.toString() });
      httpRequestsTotal
        .labels({ method, route: sanitizedUrl, status_code: status.toString() })
        .inc();

      return NextResponse.json(
        {
          error: errorTitle,
          // On 500: never leak internals. On 4xx: expose safe business messages.
          message:
            status === 500
              ? `An unexpected error occurred. Reference ID: ${requestId}`
              : userMessage || "Request could not be processed.",
          requestId,
        },
        { status },
      );
    }
  };
}
