import prisma from "./db";
import { Prisma } from "@prisma/client";
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
  CREATE_CAMPAIGN = "CREATE_CAMPAIGN",
  CAMPAIGN_UPDATE = "CAMPAIGN_UPDATE",
  ACTIVATE_CAMPAIGN = "ACTIVATE_CAMPAIGN",
  CAMPAIGN_PAUSE = "CAMPAIGN_PAUSE",
  CAMPAIGN_CANCEL = "CAMPAIGN_CANCEL",
  CANCEL_CAMPAIGN = "CANCEL_CAMPAIGN",
  // Application Events
  APPLICATION_SUBMIT = "APPLICATION_SUBMIT",
  SUBMIT_APPLICATION = "SUBMIT_APPLICATION",
  APPLICATION_ACCEPT = "APPLICATION_ACCEPT",
  ACCEPT_APPLICATION = "ACCEPT_APPLICATION",
  APPLICATION_REJECT = "APPLICATION_REJECT",
  REJECT_APPLICATION = "REJECT_APPLICATION",
  // Deal Events
  DEAL_CREATE = "DEAL_CREATE",
  DEAL_UPDATE = "DEAL_UPDATE",
  DEAL_SIGN = "DEAL_SIGN",
  CONTRACT_SIGNED = "CONTRACT_SIGNED",
  DEAL_CANCEL = "DEAL_CANCEL",
  CANCEL_DEAL = "CANCEL_DEAL",
  REJECT_DEAL_INVITE = "REJECT_DEAL_INVITE",
  DEAL_COMPLETE = "DEAL_COMPLETE",
  POST_STATUS_CHANGE = "POST_STATUS_CHANGE",
  // Payment Events
  PAYMENT_INITIATED = "PAYMENT_INITIATED",
  PAYMENT_COMPLETED = "PAYMENT_COMPLETED",
  PAYMENT_REFUNDED = "PAYMENT_REFUNDED",
  WITHDRAWAL_REQUESTED = "WITHDRAWAL_REQUESTED",
  PAYOUT_HELD_DUE_TO_VIOLATION = "PAYOUT_HELD_DUE_TO_VIOLATION",
  // Dispute Events
  DISPUTE_RAISED = "DISPUTE_RAISED",
  DISPUTE_RESOLVED = "DISPUTE_RESOLVED",
  DISPUTE_RESOLUTION = "DISPUTE_RESOLUTION",
  // Review Events
  REVIEW_SUBMITTED = "REVIEW_SUBMITTED",
  // Profile Events
  PROFILE_UPDATE = "PROFILE_UPDATE",
  CONTACT_CHANGED = "CONTACT_CHANGED",
  ACCOUNT_DELETION = "ACCOUNT_DELETION",
  UPDATE_INDIA_TAX_COMPLIANCE = "UPDATE_INDIA_TAX_COMPLIANCE",
  KYC_SUBMITTED = "KYC_SUBMITTED",
  KYC_APPROVED = "KYC_APPROVED",
  KYC_REJECTED = "KYC_REJECTED",
  DRS_UPDATE = "DRS_UPDATE",
  // Security Events
  SECURITY_ALERT = "SECURITY_ALERT",
  SECURITY_LEDGER_ALERT = "SECURITY_LEDGER_ALERT",
  SECURITY_LEDGER_AUTO_CORRECTED = "SECURITY_LEDGER_AUTO_CORRECTED",
  ACCOUNT_SUSPENDED = "ACCOUNT_SUSPENDED",
  ACCOUNT_BANNED = "ACCOUNT_BANNED",
  TEMP_SUSPENSION = "TEMP_SUSPENSION",
  PERMANENT_BAN = "PERMANENT_BAN",
  XP_AWARDED = "XP_AWARDED",
  CHALLENGE_COMPLETED = "CHALLENGE_COMPLETED",
}

interface ActivityLogParams {
  userId: string;
  action: ActivityAction | string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

export async function createActivityLog(
  params: ActivityLogParams,
  tx?: Prisma.TransactionClient
) {
  const client = tx || prisma;
  
  if (!params.userId || !params.action) {
    logger.warn("[Audit] createActivityLog called with missing required fields", { params });
    return;
  }

  const data: Prisma.ActivityLogUncheckedCreateInput = {
    userId: params.userId,
    action: params.action.toString(),
    metadata: (params.metadata as Prisma.InputJsonValue | undefined) ?? {},
  };

  if (params.entityType !== undefined) data.entityType = params.entityType;
  if (params.entityId !== undefined) data.entityId = params.entityId;
  if (params.ipAddress !== undefined) data.ipAddress = params.ipAddress;

  return client.activityLog.create({ data });
}
