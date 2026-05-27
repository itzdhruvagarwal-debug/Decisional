import prisma from "./db";
import { logger } from "./logger";

export enum ActivityAction {
  // Auth Events
  LOGIN = "LOGIN",
  LOGOUT = "LOGOUT",
  REGISTER = "REGISTER",
  PASSWORD_RESET = "PASSWORD_RESET",
  TWO_FACTOR_ENABLED = "TWO_FACTOR_ENABLED",
  TWO_FACTOR_DISABLED = "TWO_FACTOR_DISABLED",
  // Campaign Events
  CAMPAIGN_CREATE = "CAMPAIGN_CREATE",
  CAMPAIGN_UPDATE = "CAMPAIGN_UPDATE",
  CAMPAIGN_PAUSE = "CAMPAIGN_PAUSE",
  CAMPAIGN_CANCEL = "CAMPAIGN_CANCEL",
  // Application Events
  APPLICATION_SUBMIT = "APPLICATION_SUBMIT",
  APPLICATION_ACCEPT = "APPLICATION_ACCEPT",
  APPLICATION_REJECT = "APPLICATION_REJECT",
  // Deal Events
  DEAL_CREATE = "DEAL_CREATE",
  DEAL_UPDATE = "DEAL_UPDATE",
  DEAL_SIGN = "DEAL_SIGN",
  DEAL_CANCEL = "DEAL_CANCEL",
  DEAL_COMPLETE = "DEAL_COMPLETE",
  // Payment Events
  PAYMENT_INITIATED = "PAYMENT_INITIATED",
  PAYMENT_COMPLETED = "PAYMENT_COMPLETED",
  PAYMENT_REFUNDED = "PAYMENT_REFUNDED",
  WITHDRAWAL_REQUESTED = "WITHDRAWAL_REQUESTED",
  // Dispute Events
  DISPUTE_RAISED = "DISPUTE_RAISED",
  DISPUTE_RESOLVED = "DISPUTE_RESOLVED",
  // Review Events
  REVIEW_SUBMITTED = "REVIEW_SUBMITTED",
  // Profile Events
  PROFILE_UPDATE = "PROFILE_UPDATE",
  KYC_SUBMITTED = "KYC_SUBMITTED",
  KYC_APPROVED = "KYC_APPROVED",
  KYC_REJECTED = "KYC_REJECTED",
  // Security Events
  SECURITY_ALERT = "SECURITY_ALERT",
  ACCOUNT_SUSPENDED = "ACCOUNT_SUSPENDED",
  ACCOUNT_BANNED = "ACCOUNT_BANNED",
}

interface ActivityLogParams {
  userId: string;
  action: ActivityAction | string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Non-blocking Audit Logger
 *
 * Logs user activities to the database asynchronously for compliance and support.
 * This function is intentionally fire-and-forget — it MUST NOT block the main
 * request flow. Failures are caught and logged to the application logger only.
 *
 * IMPORTANT: Never `await` this function in critical paths. Call it as:
 *   void logActivity({ ... });
 * or simply:
 *   logActivity({ ... });
 */
export function logActivity(params: ActivityLogParams): void {
  // Fire-and-forget: deliberately not awaited
  // Using void to explicitly indicate we are ignoring the Promise
  void (async () => {
    try {
      // Validate required fields before writing
      if (!params.userId || !params.action) {
        logger.warn("[Audit] logActivity called with missing required fields", {
          params,
        });
        return;
      }

      await prisma.activityLog.create({
        data: {
          userId: params.userId,
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId,
          metadata: (params.metadata as object) || {},
          ipAddress: params.ipAddress,
        },
      });
    } catch (error) {
      // Fallback to file logger if DB fails — never throw from an audit log
      logger.error("Failed to write activity log to DB", error, {
        userId: params.userId,
        action: params.action,
      });
    }
  })();
}
