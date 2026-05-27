/**
 * Enterprise Input Sanitization
 * Protects against XSS, NoSQL Injection, and Prototype Pollution.
 *
 * Design: Defense-in-depth layer. Zod schemas are the primary validation.
 * This module provides an additional sanitization pass to catch anything
 * that slips through, and to handle raw string processing in non-Zod contexts.
 */

import DOMPurify from "isomorphic-dompurify";
import { logger } from "./logger";

// Comprehensive list of dangerous protocols that can execute JavaScript
const DANGEROUS_PROTOCOLS = [
  "javascript:",
  "vbscript:",
  "data:text/html",
  "data:application/xhtml",
  "data:text/javascript",
  "data:application/javascript",
];

function replaceCaseInsensitive(
  value: string,
  needle: string,
  replacement: string,
): string {
  let result = value;
  let lower = result.toLowerCase();
  const normalizedNeedle = needle.toLowerCase();
  let index = lower.indexOf(normalizedNeedle);

  while (index !== -1) {
    result =
      result.slice(0, index) +
      replacement +
      result.slice(index + needle.length);
    lower = result.toLowerCase();
    index = lower.indexOf(normalizedNeedle, index + replacement.length);
  }

  return result;
}

/**
 * Strips all HTML tags and removes dangerous script patterns.
 * Uses a comprehensive allowlist-approach for protocol removal.
 */
export function stripHtml(dirty: string): string {
  if (typeof dirty !== "string") return String(dirty ?? "");

  let sanitized = DOMPurify.sanitize(dirty.replaceAll("\0", ""), {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });

  if (typeof sanitized !== "string") {
    sanitized = String(sanitized);
  }

  // Remove dangerous protocols from plain text contexts without dynamic regexes.
  for (const protocol of DANGEROUS_PROTOCOLS) {
    sanitized = replaceCaseInsensitive(sanitized, protocol, "[removed]");
  }

  sanitized = replaceCaseInsensitive(sanitized, "expression(", "[removed](");

  return sanitized;
}

/**
 * Prevents NoSQL injection by removing operators used in MongoDB-style queries.
 * Only applies to strings — objects should go through sanitizeInput.
 */
export function sanitizeNoSql(input: unknown): unknown {
  if (typeof input === "string") {
    // Remove MongoDB-style operators ($) from string values
    // This is a last-resort guard; proper schema validation is preferred
    return input.replace(/[$]/g, "");
  }
  return input;
}

/**
 * Deep sanitization for request bodies.
 * Recursively cleans all string fields and prevents prototype pollution.
 *
 * Note: This is a defense-in-depth measure. Zod schema validation is the
 * primary line of defense and should always be used in route handlers.
 */
export function sanitizeInput(input: unknown): unknown {
  if (input === null || input === undefined) return input;

  // Handle primitive types
  if (typeof input === "string") {
    return stripHtml(input).trim();
  }

  // Numbers, booleans pass through unchanged
  if (typeof input !== "object") {
    return input;
  }

  // Handle Arrays
  if (Array.isArray(input)) {
    // Limit array size to prevent DoS via oversized arrays
    const MAX_ARRAY_LENGTH = 1000;
    return input.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeInput(item));
  }

  // Handle Objects — prevent prototype pollution
  const sanitized: Record<string, unknown> = {};

  // Limit object key count to prevent DoS via key-count attacks
  const MAX_KEYS = 100;
  let keyCount = 0;

  for (const key in input as Record<string, unknown>) {
    if (keyCount >= MAX_KEYS) {
      logger.warn("[Sanitize] Object with excessive key count truncated", {
        keyCount: Object.keys(input as object).length,
      });
      break;
    }

    // Prevent Prototype Pollution attacks
    if (
      key === "__proto__" ||
      key === "constructor" ||
      key === "prototype" ||
      key === "toString" ||
      key === "valueOf" ||
      key === "__defineGetter__" ||
      key === "__defineSetter__"
    ) {
      logger.warn("[Security] Blocked prototype pollution attempt", { key });
      continue;
    }

    // Only process own properties to avoid inherited junk
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      sanitized[sanitizeNoSql(key) as string] = sanitizeInput(
        (input as Record<string, unknown>)[key],
      );
      keyCount++;
    }
  }

  return sanitized;
}
