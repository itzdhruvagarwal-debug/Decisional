import * as Sentry from "@sentry/nextjs";

export type LogLevel = "debug" | "info" | "warn" | "error" | "critical";

interface LogContext {
  userId?: string;
  requestId?: string;
  dealId?: string;
  action?: string;
  [key: string]: unknown;
}

type StringablePrimitive = string | number | boolean | bigint | symbol;

function safeString(message: unknown): string {
  if (typeof message === "string") return message;
  if (message === null) return "null";
  if (message === undefined) return "undefined";
  if (message instanceof Error) return message.stack || message.message;
  if (typeof message !== "object") {
    return String(message as StringablePrimitive);
  }
  try {
    return JSON.stringify(message);
  } catch {
    return "[Complex Object]";
  }
}

export const logger = {
  debug(message: unknown, data?: Record<string, unknown>, context?: LogContext) {
    const msg = safeString(message);
    console.debug(`[Decisional] [DEBUG] ${msg}`, { ...data, ...context });
  },

  info(message: unknown, data?: Record<string, unknown>, context?: LogContext) {
    const msg = safeString(message);
    console.info(`[Decisional] [INFO] ${msg}`, { ...data, ...context });
  },

  warn(message: unknown, data?: Record<string, unknown>, context?: LogContext) {
    const msg = safeString(message);
    console.warn(`[Decisional] [WARN] ${msg}`, { ...data, ...context });
    
    // Capture warning in Sentry
    Sentry.captureMessage(msg, {
      level: "warning",
      extra: { ...data, ...context },
    });
  },

  error(message: unknown, error?: unknown, context?: LogContext) {
    const msg = safeString(message);
    const meta: Record<string, unknown> = { ...context };
    
    if (error instanceof Error) {
      meta.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (error !== undefined && error !== null) {
      meta.error = safeString(error);
    }
    
    console.error(`[Decisional] [ERROR] ${msg}`, meta);

    // Capture exception or message in Sentry
    if (error instanceof Error) {
      Sentry.captureException(error, {
        extra: { message: msg, ...meta },
      });
    } else {
      Sentry.captureMessage(`${msg} - Error detail: ${safeString(error)}`, {
        level: "error",
        extra: meta,
      });
    }
  },

  critical(message: unknown, error?: unknown, context?: LogContext) {
    const msg = safeString(message);
    const meta: Record<string, unknown> = { ...context, level: "crit" };
    
    if (error instanceof Error) {
      meta.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (error !== undefined && error !== null) {
      meta.error = safeString(error);
    }
    
    console.error(`[Decisional] [CRITICAL] ${msg}`, meta);

    // Capture critical issue in Sentry
    if (error instanceof Error) {
      Sentry.captureException(error, {
        level: "fatal",
        extra: { message: msg, ...meta },
      });
    } else {
      Sentry.captureMessage(`[CRITICAL] ${msg} - Error detail: ${safeString(error)}`, {
        level: "fatal",
        extra: meta,
      });
    }
  },

  withContext(baseContext: LogContext) {
    return {
      debug: (msg: string, data?: Record<string, unknown>) =>
        logger.debug(msg, data, baseContext),
      info: (msg: string, data?: Record<string, unknown>) =>
        logger.info(msg, data, baseContext),
      warn: (msg: string, data?: Record<string, unknown>) =>
        logger.warn(msg, data, baseContext),
      error: (msg: string, err?: unknown) =>
        logger.error(msg, err, baseContext),
      critical: (msg: string, err?: unknown) =>
        logger.critical(msg, err, baseContext),
    };
  },
};
