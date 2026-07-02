import { NextRequest } from "next/server";
import { apiWrapper, ApiResponse } from "@/lib/api-wrapper";
import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { type ActiveAdminIdentity } from "@/lib/admin-auth";
import { decrypt } from "@/lib/encryption";
import { createPayout, getPayout } from "@/lib/razorpay";
import { PaymentService } from "@/services/payment.service";
import { AppError } from "@/lib/errors";

const sanitizeRejectionReason = (reason?: string): string => {
  if (!reason) return "Admin Action";
  const sensitiveTerms = ["fraud", "scam", "suspicious", "abuse", "fake"];
  const lower = reason.toLowerCase();
  if (sensitiveTerms.some((term) => lower.includes(term))) {
    return "Your payout was rejected due to policy compliance review. Please contact support.";
  }
  return reason;
};

const payoutActionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  failureReason: z.string().max(500).optional(),
});

export const PUT = apiWrapper(async (req, { params }) => {
  const session = (req as NextRequest & { session: { user: ActiveAdminIdentity } }).session;
  const admin = session?.user as ActiveAdminIdentity;

  const withdrawalId = (await params).id as string;

  if (!withdrawalId || typeof withdrawalId !== "string") {
    return ApiResponse.error("Invalid withdrawal ID");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return ApiResponse.error("Invalid request body");
  }

  const parsed = payoutActionSchema.safeParse(body);
  if (!parsed.success) {
    return ApiResponse.error("Validation failed");
  }

  const { action, failureReason } = parsed.data;

  // Require a failure reason when rejecting a withdrawal
  if (action === "REJECT" && !failureReason?.trim()) {
    return ApiResponse.error("A failure reason is required when rejecting a withdrawal");
  }

  try {
    if (action === "REJECT") {
      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Use status:"PROCESSING" as the atomic write-lock — same pattern as APPROVE.
        // Without this, two concurrent REJECT clicks both see PENDING → both refund.
        const lockResult = await tx.withdrawal.updateMany({
          where: { id: withdrawalId, status: { in: ["PENDING", "PENDING_REVIEW"] } },
          data: { status: "PROCESSING", updatedAt: new Date() }
        });
        if (lockResult.count === 0) throw AppError.conflict("WITHDRAWAL_ALREADY_PROCESSED");
        const withdrawal = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
        if (!withdrawal) throw AppError.notFound("WITHDRAWAL_NOT_FOUND");

        // Sanitize the reason shown to the user
        const userFacingReason = sanitizeRejectionReason(failureReason);

        // Refund the wallet
        await tx.wallet.update({
          where: { id: withdrawal.walletId },
          data: { balance: { increment: withdrawal.amount } },
        });

        await tx.transaction.create({
          data: {
            walletId: withdrawal.walletId,
            withdrawalId,
            type: "REFUND",
            amount: withdrawal.amount,
            status: "COMPLETED",
            description: `Withdrawal refunded: ${userFacingReason}`,
          },
        });

        await tx.transaction.updateMany({
          where: { withdrawalId, type: "WITHDRAWAL", status: "PENDING" },
          data: { status: "FAILED" },
        });

        return await tx.withdrawal.update({
          where: { id: withdrawalId },
          data: {
            status: "FAILED",
            // adminNotes stores the verbatim reason (visible only to admins)
            adminNotes: failureReason ?? null,
            // failureReason shown to the user — keep it generic and safe
            failureReason: userFacingReason,
            processedAt: new Date(),
          },
        });
      });

      logger.info(`Admin ${action} payout`, {
        withdrawalId,
        action,
        adminId: admin.id,
      });
      return ApiResponse.success(result, "Payout rejected successfully");
    } else {
      // APPROVE: Trigger Razorpay payout
      const withdrawal = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const lockResult = await tx.withdrawal.updateMany({
          // Only claim PENDING/PENDING_REVIEW — never re-claim PROCESSING.
          // If already PROCESSING (e.g. prior timeout), count=0 → 409 WITHDRAWAL_ALREADY_PROCESSED.
          // This prevents double-createPayout() on concurrent admin clicks or timeout reconciliation.
          where: { id: withdrawalId, status: { in: ["PENDING", "PENDING_REVIEW"] } },
          data: { status: "PROCESSING", updatedAt: new Date() }
        });
        if (lockResult.count === 0) throw AppError.conflict("WITHDRAWAL_ALREADY_PROCESSED");
        const w = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
        if (!w) throw AppError.notFound("WITHDRAWAL_NOT_FOUND");
        return w;
      });

      try {
        let payout;
        if (withdrawal.razorpayPayoutId) {
          payout = await getPayout(withdrawal.razorpayPayoutId);
        } else {
          const decryptedAccountNumber = decrypt(withdrawal.bankAccountNumber);
          // Decrypt upiId when present — required for UPI_PAYOUT mode in createPayout().
          // Without this, isUpiPayout=true but params.upiId=undefined → VPA registration fails.
          const decryptedUpiId = withdrawal.upiId ? decrypt(withdrawal.upiId) : undefined;
          payout = await createPayout({
            accountNumber: decryptedAccountNumber,
            ifscCode: withdrawal.ifscCode,
            beneficiaryName: withdrawal.bankAccountName,
            amount: withdrawal.amount,
            referenceId: withdrawal.id,
            ...(decryptedUpiId ? { upiId: decryptedUpiId } : {}),
          });
        }

        const finalResult = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          if (payout.status === "processed") {
            const updated = await tx.withdrawal.update({
              where: { id: withdrawalId },
              data: { status: "COMPLETED", processedAt: new Date(), razorpayPayoutId: payout.payoutId }
            });
            await tx.transaction.updateMany({
              where: { withdrawalId, type: "WITHDRAWAL", status: "PENDING" },
              data: { status: "COMPLETED" }
            });
            await tx.wallet.update({
              where: { id: withdrawal.walletId },
              data: { totalWithdrawn: { increment: withdrawal.amount } }
            });
            return updated;
          } else if (["rejected", "failed", "reversed"].includes(payout.status)) {
            await PaymentService.refundFailedWithdrawal(
              withdrawalId,
              tx,
              `Payout rejected/failed immediately with status ${payout.status}`,
              payout.payoutId,
              true
            );
            return await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
          } else {
            return await tx.withdrawal.update({
              where: { id: withdrawalId },
              data: { status: "PROCESSING", razorpayPayoutId: payout.payoutId }
            });
          }
        });

        logger.info(`Admin ${action} payout auto-processed`, {
          withdrawalId,
          action,
          adminId: admin.id,
          razorpayPayoutId: payout.payoutId,
        });
        return ApiResponse.success(finalResult, "Payout approved successfully");
      } catch (error: unknown) {
        logger.error("Admin approval payout creation failed", { withdrawalId, error });
        const errorMsg = (error instanceof Error ? error.message : String(error)) || "";
        const isTimeoutOrNetworkError =
          errorMsg.includes("timeout") ||
          errorMsg.includes("fetch") ||
          errorMsg.includes("network") ||
          errorMsg.includes("ENOTFOUND") ||
          errorMsg.includes("ECONNREFUSED");

        if (isTimeoutOrNetworkError) {
          return ApiResponse.success(
            {
              id: withdrawalId,
              status: "PROCESSING",
            },
            "Payout timed out or network error. Keeping status as PROCESSING for background reconciliation.",
          );
        } else {
          await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            await PaymentService.refundFailedWithdrawal(
              withdrawalId,
              tx,
              `Payout failed: ${errorMsg || "Gateway error"}`,
              undefined,
              true
            );
          });
          return ApiResponse.error(`Payout failed: ${errorMsg}`);
        }
      }
    }
  } catch (error: unknown) {
    logger.error("Failed to process payout", error, { withdrawalId, action });

    if (error instanceof AppError) throw error;

    const msg = error instanceof Error ? error.message : "";
    if (msg === "WITHDRAWAL_NOT_FOUND") {
      throw AppError.notFound("Withdrawal not found");
    }
    if (msg === "WITHDRAWAL_ALREADY_PROCESSED") {
      throw AppError.conflict("Withdrawal has already been processed");
    }

    throw error;
  }
}, { requireAuth: true, requireAdmin: true });
