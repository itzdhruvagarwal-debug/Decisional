/**
 * Push Notification Service
 * Supports Firebase Cloud Messaging (FCM) and OneSignal.
 * Add FCM_SERVER_KEY or ONESIGNAL_APP_ID to .env to activate.
 *
 * Current: Falls back to in-app DB notifications (always works).
 */

import prisma from "./db";
import { logger } from "./logger";

// Read push provider keys at call-time, not import-time
function getFCMServerKey() {
  return process.env.FCM_SERVER_KEY || "";
}
function getOneSignalAppId() {
  return process.env.ONESIGNAL_APP_ID || "";
}
function getOneSignalApiKey() {
  return process.env.ONESIGNAL_API_KEY || "";
}

// ==================== TYPES ====================

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  data?: Record<string, string>;
}

interface PushResult {
  success: boolean;
  provider: "fcm" | "onesignal" | "in-app";
  error?: string;
}

// ==================== MAIN SEND FUNCTION ====================

/**
 * Send a push notification to a user.
 * Tries FCM → OneSignal → falls back to in-app notification.
 */
export async function sendPushNotification(
  userId: string,
  payload: PushPayload,
): Promise<PushResult> {
  // Always create in-app notification as baseline
  await createInAppNotification(userId, payload);

  // Try FCM first
  if (getFCMServerKey()) {
    const fcmToken = await getUserFCMToken(userId);
    if (fcmToken) {
      return await sendViaFCM(fcmToken, payload);
    }
  }

  // Try OneSignal
  if (getOneSignalAppId() && getOneSignalApiKey()) {
    return await sendViaOneSignal(userId, payload);
  }

  // Fallback: in-app only
  return { success: true, provider: "in-app" };
}

/**
 * Send push notification to multiple users.
 */
export async function sendBulkPush(
  userIds: string[],
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  // Create in-app notifications in bulk (single batch insert)
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type: "push",
      title: payload.title,
      message: payload.body,
      data: payload.data || {},
    })),
  });

  // Send external push notifications only (skip in-app since already created above)
  for (const userId of userIds) {
    try {
      // Try FCM
      if (getFCMServerKey()) {
        const fcmToken = await getUserFCMToken(userId);
        if (fcmToken) {
          const result = await sendViaFCM(fcmToken, payload);
          if (result.success) {
            sent++;
            continue;
          }
        }
      }
      // Try OneSignal
      if (getOneSignalAppId() && getOneSignalApiKey()) {
        const result = await sendViaOneSignal(userId, payload);
        if (result.success) {
          sent++;
          continue;
        }
      }
      // Fallback: in-app already created
      sent++;
    } catch {
      failed++;
    }
  }

  return { sent, failed };
}

// ==================== FCM ====================

async function sendViaFCM(
  token: string,
  payload: PushPayload,
): Promise<PushResult> {
  try {
    const res = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        Authorization: `key=${getFCMServerKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: token,
        notification: {
          title: payload.title,
          body: payload.body,
          icon: payload.icon || "/icon-192.png",
          click_action: payload.url || "/",
        },
        data: payload.data || {},
      }),
    });

    const data = await res.json();

    if (data.success === 1) {
      return { success: true, provider: "fcm" };
    }

    logger.error("FCM send error", { error: data.results?.[0]?.error });
    return {
      success: false,
      provider: "fcm",
      error: data.results?.[0]?.error || "FCM send failed",
    };
  } catch (error) {
    logger.error("FCM service error", error);
    return {
      success: false,
      provider: "fcm",
      error: "FCM service unavailable",
    };
  }
}

// ==================== ONESIGNAL ====================

async function sendViaOneSignal(
  userId: string,
  payload: PushPayload,
): Promise<PushResult> {
  try {
    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        Authorization: `Basic ${getOneSignalApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        app_id: getOneSignalAppId(),
        include_external_user_ids: [userId],
        headings: { en: payload.title },
        contents: { en: payload.body },
        url: payload.url,
        data: payload.data || {},
        small_icon: payload.icon,
      }),
    });

    const data = await res.json();

    if (data.id) {
      return { success: true, provider: "onesignal" };
    }

    logger.error("OneSignal send error", { errors: data.errors });
    return {
      success: false,
      provider: "onesignal",
      error: data.errors?.[0] || "OneSignal failed",
    };
  } catch (error) {
    logger.error("OneSignal service error", error);
    return {
      success: false,
      provider: "onesignal",
      error: "OneSignal unavailable",
    };
  }
}

// ==================== IN-APP NOTIFICATION ====================

async function createInAppNotification(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId,
        type: "push",
        title: payload.title,
        message: payload.body,
        data: payload.data || {},
      },
    });
  } catch (error) {
    logger.error("In-app notification creation failed", error, { userId });
  }
}

// ==================== FCM TOKEN MANAGEMENT ====================

/**
 * Save/update a user's FCM token (called from frontend).
 */
export async function saveFCMToken(
  userId: string,
  token: string,
): Promise<void> {
  // Store FCM token as a dedicated DeviceFingerprint record with a "fcm:" prefix
  // NOTE: In production, add a dedicated PushToken model to the schema
  const FCM_PREFIX = "fcm:";
  try {
    // Find existing FCM record for this user
    const existing = await prisma.deviceFingerprint.findFirst({
      where: {
        userId,
        fingerprint: { startsWith: FCM_PREFIX },
      },
    });

    if (existing) {
      await prisma.deviceFingerprint.update({
        where: { id: existing.id },
        data: {
          fingerprint: `${FCM_PREFIX}${token}`,
          lastSeenAt: new Date(),
        },
      });
    } else {
      await prisma.deviceFingerprint.create({
        data: {
          userId,
          fingerprint: `${FCM_PREFIX}${token}`,
          userAgent: "FCM Push Token",
          lastIp: "0.0.0.0",
          lastSeenAt: new Date(),
        },
      });
    }
    logger.debug("FCM token saved", { userId });
  } catch (error) {
    logger.error("Failed to save FCM token", error, { userId });
  }
}

async function getUserFCMToken(userId: string): Promise<string | null> {
  const FCM_PREFIX = "fcm:";
  try {
    const device = await prisma.deviceFingerprint.findFirst({
      where: {
        userId,
        fingerprint: { startsWith: FCM_PREFIX },
      },
      orderBy: { lastSeenAt: "desc" },
      select: { fingerprint: true },
    });

    if (device?.fingerprint) {
      const token = device.fingerprint.slice(FCM_PREFIX.length);
      if (token.length > 100 && token.includes(":")) {
        return token;
      }
    }

    return null;
  } catch {
    return null;
  }
}
