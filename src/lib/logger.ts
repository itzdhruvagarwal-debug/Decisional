import "server-only";
import { inspect } from "node:util";

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
  const { service: _service, ...restMeta } = meta;
  const metaStr = Object.keys(restMeta).length ? JSON.stringify(restMeta) : "";
  return `${timestamp} [${level}]: ${stack || message} ${metaStr}`;
});

const isDevelopment = process.env.NODE_ENV === "development";

/**
 * PII Masking utility for Enterprise-grade logging
 * Automatically redacts sensitive patterns before they reach the storage
 */
function maskPIIPrimitive(data: string): string {
  // Mask Email
  if (data.includes("@") && data.includes(".")) {
    return data.replace(/^([^@]{2})[^@]*(@.*)$/, "$1***$2");
  }
  // Mask Phone (approximate)
  if (/^\+?(?:91)?[6-9]\d{9}$/.test(data.replace(/[\s-]/g, ""))) {
    return data.slice(0, 3) + "***" + data.slice(-2);
  }
  return data;
}

function maskPII(data: unknown): unknown {
  if (typeof data !== "object" || data === null) {
    if (typeof data === "string") {
      return maskPIIPrimitive(data);
    }
    return data;
  }

  const masked: Record<string, unknown> = Array.isArray(data) ? [] as unknown as Record<string, unknown> : {};
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
    const value = (data as Record<string, unknown>)[key];

    if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))) {
      masked[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      masked[key] = maskPII(value);
    } else if (typeof value === "string") {
      masked[key] = maskPIIPrimitive(value);
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
      if (info.metadata) {
        info.metadata = maskPII(info.metadata);
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
    return inspect(message);
  }
}

// Wrapper to match existing interface
export const logger = {
  debug(message: unknown, data?: Record<string, unknown>, context?: LogContext) {
    winstonLogger.debug(safeString(message), { ...data, ...context });
  },

  info(message: unknown, data?: Record<string, unknown>, context?: LogContext) {
    winstonLogger.info(safeString(message), { ...data, ...context });
  },

  warn(message: unknown, data?: Record<string, unknown>, context?: LogContext) {
    winstonLogger.warn(safeString(message), { ...data, ...context });
  },

  error(message: unknown, error?: unknown, context?: LogContext) {
    const meta: Record<string, unknown> = { ...context };
    if (error instanceof Error) {
      meta.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (error !== undefined && error !== null) {
      if (typeof error !== "object") {
        meta.error = String(error as string | number | boolean | bigint | symbol);
      } else {
        try {
          meta.error = JSON.stringify(error);
        } catch {
          meta.error = inspect(error);
        }
      }
    }
    winstonLogger.error(safeString(message), meta);
  },

  critical(message: unknown, error?: unknown, context?: LogContext) {
    const meta: Record<string, unknown> = { ...context, level: "crit" }; // tag it
    if (error instanceof Error) {
      meta.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (error !== undefined && error !== null) {
      if (typeof error !== "object") {
        meta.error = String(error as string | number | boolean | bigint | symbol);
      } else {
        try {
          meta.error = JSON.stringify(error);
        } catch {
          meta.error = inspect(error);
        }
      }
    }
    // Log as error but with critical tag (Winston default levels don't have crit)
    winstonLogger.error(`[CRITICAL] ${safeString(message)}`, meta);
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
