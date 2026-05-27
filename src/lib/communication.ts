/**
 * Unified Communication Layer — Decisional
 * ─────────────────────────────────────────────────────────
 * Single entry point for all transactional email + SMS delivery.
 * Used by API routes for ad-hoc emails (password reset, verification link, etc.)
 *
 * ARCHITECTURE NOTE:
 *  - `@/lib/email.ts` → Structured template emails (OTP, welcome, deal updates)
 *  - `@/lib/communication.ts` (THIS FILE) → Raw email/SMS sending for custom content
 *  - `@/lib/sms.ts` → MSG91 OTP service (dedicated OTP flow)
 *
 * ENTERPRISE FEATURES:
 *  ✅ Retry with exponential backoff (email: 3 attempts, SMS: 2 attempts)
 *  ✅ Request timeout via AbortController
 *  ✅ Input validation (email format, phone format)
 *  ✅ Structured error logging with correlation IDs
 *  ✅ Dev-mode fallback (logs instead of sending)
 *  ✅ Reply-To header
 *  ✅ Plain-text auto-generation from HTML
 *
 * Email Provider: Resend (3K/month free)
 */

import { logger } from "./logger";
import { randomUUID } from "crypto";

// ==================== CONFIG ====================

const APP_NAME = "Decisional";
const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@decisional.in";
const REPLY_TO_EMAIL = process.env.REPLY_TO_EMAIL || "support@decisional.in";
const RESEND_API_URL = "https://api.resend.com/emails";

const EMAIL_MAX_RETRIES = 3;
const SMS_MAX_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 15_000;

// ==================== HELPERS ====================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Basic email format validation */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Strip HTML tags to produce plain-text fallback */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ==================== EMAIL ====================

/**
 * Send a raw transactional email via Resend.
 * Includes retry logic, timeout, plain-text fallback, and dev-mode logging.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  const correlationId = randomUUID().slice(0, 8);
  const log = logger.withContext({ correlationId, service: "email" });

  // Input validation
  if (!to || !isValidEmail(to)) {
    log.error("Invalid email recipient address: " + to);
    return false;
  }

  if (!subject || !html) {
    log.error("Email subject and body are required");
    return false;
  }

  const apiKey = process.env.RESEND_API_KEY;

  // ── Dev fallback ──
  if (!apiKey) {
    if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
      log.info("DEV EMAIL — no API key set, logging instead", {
        to,
        subject,
      });
      log.debug("Email body (truncated)", {
        bodyPreview: html.slice(0, 200),
      });
      return true;
    }
    log.error("CRITICAL: No email API key configured in production. Emails cannot be delivered.");
    return false;
  }

  // ── Build Resend payload ──
  const plainText = htmlToPlainText(html);
  const payload = {
    from: `${APP_NAME} <${FROM_EMAIL}>`,
    to: [to],
    reply_to: REPLY_TO_EMAIL,
    subject,
    html,
    text: plainText,
  };

  // ── Retry loop ──
  for (let attempt = 1; attempt <= EMAIL_MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const res = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Resend returns 200 on success
      if (res.ok) {
        log.info("Email sent via Resend", { to, subject, attempt });
        return true;
      }

      // Handle rate limiting
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("retry-after") || "5", 10);
        log.warn(`Resend rate limit (429). Waiting ${retryAfter}s`, { attempt });
        await sleep(retryAfter * 1000);
        continue;
      }

      // Client error (4xx except 429) — don't retry
      if (res.status >= 400 && res.status < 500) {
        const errorBody = await res.json().catch(() => ({})) as { message?: string };
        log.error("Resend rejected email (4xx)", {
          status: res.status,
          error: errorBody.message || "Unknown error",
          to,
        });
        return false;
      }

      // Server error (5xx) — retry
      const errorText = await res.text();
      log.warn(`Resend server error (${res.status}). Attempt ${attempt}/${EMAIL_MAX_RETRIES}`, {
        error: errorText,
      });
    } catch (err: any) {
      if (err.name === "AbortError") {
        log.warn(`Email send timed out (${REQUEST_TIMEOUT_MS}ms). Attempt ${attempt}/${EMAIL_MAX_RETRIES}`);
      } else {
        log.error(`Network error sending email. Attempt ${attempt}/${EMAIL_MAX_RETRIES}`, err);
      }
    }

    // Exponential backoff
    if (attempt < EMAIL_MAX_RETRIES) {
      await sleep(BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1));
    }
  }

  log.error("Email delivery FAILED after all retries", { to, subject });
  return false;
}

// ==================== SMS ====================

/**
 * Send an SMS message via MSG91 Flow API.
 * Includes retry, timeout, and Indian phone number validation.
 */
export async function sendSMS(
  phone: string,
  message: string,
): Promise<boolean> {
  const correlationId = randomUUID().slice(0, 8);
  const log = logger.withContext({ correlationId, service: "sms" });

  // Input validation
  if (!phone || !/^[6-9]\d{9}$/.test(phone.replace(/^\+?91/, ""))) {
    log.error("Invalid Indian phone number: " + phone);
    return false;
  }

  if (!message) {
    log.error("SMS message body is required");
    return false;
  }

  const apiKey = process.env.MSG91_AUTH_KEY || process.env.SMS_API_KEY;
  const senderId =
    process.env.MSG91_SENDER_ID || process.env.SMS_SENDER_ID || "DCSNL";

  // ── Dev fallback ──
  if (!apiKey) {
    if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
      log.info("DEV SMS — no API key set, logging instead", {
        phone,
        message: message.slice(0, 50),
      });
      return true;
    }
    log.error("CRITICAL: MSG91_AUTH_KEY not configured in production. SMS cannot be delivered.");
    return false;
  }

  // ── Retry loop ──
  for (let attempt = 1; attempt <= SMS_MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const res = await fetch("https://api.msg91.com/api/v5/flow/", {
        method: "POST",
        headers: {
          authkey: apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          template_id: process.env.MSG91_TEMPLATE_ID || "",
          recipients: [{ mobiles: phone.replace(/^\+/, ""), message }],
          sender: senderId,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        log.info("SMS sent via MSG91", { phone, attempt });
        return true;
      }

      const errorText = await res.text();
      log.warn(`MSG91 error (${res.status}). Attempt ${attempt}/${SMS_MAX_RETRIES}`, {
        error: errorText,
      });
    } catch (err: any) {
      if (err.name === "AbortError") {
        log.warn(`SMS send timed out. Attempt ${attempt}/${SMS_MAX_RETRIES}`);
      } else {
        log.error(`Network error sending SMS. Attempt ${attempt}/${SMS_MAX_RETRIES}`, err);
      }
    }

    if (attempt < SMS_MAX_RETRIES) {
      await sleep(BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1));
    }
  }

  log.error("SMS delivery FAILED after all retries", { phone });
  return false;
}
