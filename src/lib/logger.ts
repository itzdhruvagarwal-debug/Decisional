import {
  createLogger,
  format,
  transports,
  Logger as WinstonLogger,
} from "winston";

const { combine, timestamp, json, printf, colorize, errors, metadata } = format;

// Custom format for local development
const prettyPrint = printf(({ level, message, timestamp, stack, ...meta }) => {
  // Clean up metadata to avoid duplicate timestamp/level inside meta
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { service, ...restMeta } = meta;
  const metaStr = Object.keys(restMeta).length ? JSON.stringify(restMeta) : "";
  return `${timestamp} [${level}]: ${stack || message} ${metaStr}`;
});

const isDevelopment = process.env.NODE_ENV === "development";

/**
 * PII Masking utility for Enterprise-grade logging
 * Automatically redacts sensitive patterns before they reach the storage
 */
function maskPII(data: any): any {
  if (typeof data !== "object" || data === null) {
    if (typeof data === "string") {
      // Mask Email
      if (data.includes("@") && data.includes(".")) {
        return data.replace(/^(.{2})(.*)(@.*)$/, "$1***$3");
      }
      // Mask Phone (approximate)
      if (/^\+?(?:91)?[6-9]\d{9}$/.test(data.replace(/[\s-]/g, ""))) {
        return data.slice(0, 3) + "***" + data.slice(-2);
      }
    }
    return data;
  }

  const masked: any = Array.isArray(data) ? [] : {};
  const sensitiveKeys = [
    "password",
    "token",
    "secret",
    "cvv",
    "card",
    "pin",
    "otp",
    "pan",
    "aadhaar",
    "accountNumber",
  ];

  for (const key in data) {
    const value = data[key];

    if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
      masked[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      masked[key] = maskPII(value);
    } else if (typeof value === "string") {
      masked[key] = maskPII(value);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

const winstonLogger: WinstonLogger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    errors({ stack: true }), // Include stack trace
    metadata({ fillExcept: ["timestamp", "level", "message", "stack"] }),
    format((info) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { metadata, ...rest } = info;
      if (metadata) {
        info.metadata = maskPII(metadata);
      }
      return info;
    })(),
    json(),
  ),
  defaultMeta: { service: "influencer-marketplace" },
  transports: [
    new transports.Console({
      format: isDevelopment
        ? combine(colorize(), timestamp({ format: "HH:mm:ss" }), prettyPrint)
        : json(),
    }),
  ],
});

export type LogLevel = "debug" | "info" | "warn" | "error" | "critical";

interface LogContext {
  userId?: string;
  requestId?: string;
  dealId?: string;
  action?: string;
  [key: string]: unknown;
}

// Wrapper to match existing interface
export const logger = {
  debug(message: string, data?: Record<string, unknown>, context?: LogContext) {
    winstonLogger.debug(message, { ...data, ...context });
  },

  info(message: string, data?: Record<string, unknown>, context?: LogContext) {
    winstonLogger.info(message, { ...data, ...context });
  },

  warn(message: string, data?: Record<string, unknown>, context?: LogContext) {
    winstonLogger.warn(message, { ...data, ...context });
  },

  error(message: string, error?: unknown, context?: LogContext) {
    const meta: Record<string, unknown> = { ...context };
    if (error instanceof Error) {
      meta.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (error) {
      meta.error = error;
    }
    winstonLogger.error(message, meta);
  },

  critical(message: string, error?: unknown, context?: LogContext) {
    const meta: Record<string, unknown> = { ...context, level: "crit" }; // tag it
    if (error instanceof Error) {
      meta.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (error) {
      meta.error = error;
    }
    // Log as error but with critical tag (Winston default levels don't have crit)
    winstonLogger.error(`[CRITICAL] ${message}`, meta);
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

// Stream for external tools if needed
export const stream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};
