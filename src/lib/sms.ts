/**
 * SMS Service (MSG91)
 * Handles OTP sending and verification via MSG91.
 * Requires MSG91_AUTH_KEY.
 */

import { logger } from "./logger";

function getMSG91AuthKey() {
  return process.env.MSG91_AUTH_KEY || "";
}
function getMSG91TemplateId() {
  return process.env.MSG91_TEMPLATE_ID || "";
}

interface SendOTPResult {
  success: boolean;
  requestId?: string;
  error?: string;
}

interface VerifyOTPResult {
  success: boolean;
  error?: string;
}

/**
 * Send OTP to a phone number via MSG91.
 * Phone must be in format: 919876543210 (country code + number)
 */
export async function sendOTP(phone: string): Promise<SendOTPResult> {
  if (!getMSG91AuthKey() || !getMSG91TemplateId()) {
    logger.error(
      "CRITICAL: MSG91_AUTH_KEY or TITLE not set. Real SMS cannot be delivered.",
    );
    return {
      success: false,
      error: "SMS service configuration missing (Enterprise requirement)",
    };
  }

  try {
    const formattedPhone = phone.startsWith("91") ? phone : `91${phone}`;

    const res = await fetch(
      `https://control.msg91.com/api/v5/otp?template_id=${getMSG91TemplateId()}&mobile=${formattedPhone}`,
      {
        method: "POST",
        headers: {
          authkey: getMSG91AuthKey(),
          "Content-Type": "application/json",
        },
      },
    );

    const data = await res.json();

    if (data.type === "success") {
      logger.info("OTP sent", { phone: formattedPhone });
      return { success: true, requestId: data.request_id };
    }

    logger.error("MSG91 OTP send error", { response: data });
    return { success: false, error: data.message || "Failed to send OTP" };
  } catch (error) {
    logger.error("Failed to send OTP", error, { phone });
    return { success: false, error: "SMS service unavailable" };
  }
}

/**
 * Verify OTP entered by user via MSG91.
 */
export async function verifyOTP(
  phone: string,
  otp: string,
): Promise<VerifyOTPResult> {
  if (!getMSG91AuthKey()) {
    logger.error("CRITICAL: MSG91_AUTH_KEY not set.");
    return {
      success: false,
      error: "Verification service configuration missing",
    };
  }

  try {
    const formattedPhone = phone.startsWith("91") ? phone : `91${phone}`;

    const res = await fetch(
      `https://control.msg91.com/api/v5/otp/verify?mobile=${formattedPhone}&otp=${otp}`,
      {
        method: "POST",
        headers: {
          authkey: getMSG91AuthKey(),
          "Content-Type": "application/json",
        },
      },
    );

    const data = await res.json();

    if (data.type === "success") {
      logger.info("OTP verified", { phone: formattedPhone });
      return { success: true };
    }

    return { success: false, error: data.message || "Invalid OTP" };
  } catch (error) {
    logger.error("OTP verification failed", error, { phone });
    return { success: false, error: "Verification service unavailable" };
  }
}

/**
 * Resend OTP via MSG91.
 */
export async function resendOTP(
  phone: string,
  retryType: "text" | "voice" = "text",
): Promise<SendOTPResult> {
  if (!getMSG91AuthKey()) {
    logger.error("CRITICAL: MSG91_AUTH_KEY not set.");
    return { success: false, error: "SMS service configuration missing" };
  }

  try {
    const formattedPhone = phone.startsWith("91") ? phone : `91${phone}`;

    const res = await fetch(
      `https://control.msg91.com/api/v5/otp/retry?mobile=${formattedPhone}&retrytype=${retryType}`,
      {
        method: "POST",
        headers: {
          authkey: getMSG91AuthKey(),
          "Content-Type": "application/json",
        },
      },
    );

    const data = await res.json();

    if (data.type === "success") {
      return { success: true, requestId: data.request_id };
    }

    return { success: false, error: data.message || "Failed to resend OTP" };
  } catch (error) {
    logger.error("OTP resend failed", error, { phone });
    return { success: false, error: "SMS service unavailable" };
  }
}
