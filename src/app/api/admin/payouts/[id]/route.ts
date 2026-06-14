import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { apiWrapper } from "@/lib/api-wrapper";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { z } from "zod";
import {
  requireActiveAdmin,
  type ActiveAdminIdentity,
} from "@/lib/admin-auth";
import { decrypt } from "@/lib/encryption";
import { createPayout } from "@/lib/razorpay";

const payoutActionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  failureReason: z.string().max(500).optional(),
  razorpayPayoutId: z.string().max(200).optional(),
});

export const PUT = apiWrapper(async (req, { params }) => {
  const session = await auth();

  let admin: ActiveAdminIdentity;
  try {
    admin = await requireActiveAdmin(session?.user);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const withdrawalId = (await params).id as string;

  if (!withdrawalId || typeof withdrawalId !== "string") {
    return NextResponse.json({ error: "Invalid withdrawal ID" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = payoutActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { action, failureReason, razorpayPayoutId } = parsed.data;

  // Require a failure reason when rejecting a withdrawal
  if (action === "REJECT" && !failureReason?.trim()) {
    return NextResponse.json(
      { error: "A failure reason is required when rejecting a withdrawal" },
      { status: 400 },
    );
  }

  try {
    if (action === "REJECT") {
      const result = await prisma.$transaction(async (tx: any) => {
        const lockResult = await tx.withdrawal.updateMany({
          where: { id: withdrawalId, status: { in: ["PENDING", "PENDING_REVIEW"] } },
          data: { updatedAt: new Date() }
        });
        if (lockResult.count === 0) throw new Error("WITHDRAWAL_ALREADY_PROCESSED");
        const withdrawal = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
        if (!withdrawal) throw new Error("WITHDRAWAL_NOT_FOUND");

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
            description: `Withdrawal refunded: ${failureReason || "Admin Action"}`,
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
            adminNotes: failureReason,
            // failureReason shown to the user — keep it generic and safe
            failureReason: "Your withdrawal request could not be processed at this time. Please contact support if you need assistance.",
            processedAt: new Date(),
          },
        });
      });

      logger.info(`Admin ${action} payout`, {
        withdrawalId,
        action,
        adminId: admin.id,
      });
      return NextResponse.json(result);
    } else {
      // APPROVE: Trigger Razorpay payout
      const withdrawal = await prisma.$transaction(async (tx: any) => {
        const lockResult = await tx.withdrawal.updateMany({
          where: { id: withdrawalId, status: { in: ["PENDING", "PENDING_REVIEW"] } },
          data: { status: "PROCESSING", updatedAt: new Date() }
        });
        if (lockResult.count === 0) throw new Error("WITHDRAWAL_ALREADY_PROCESSED");
        const w = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
        if (!w) throw new Error("WITHDRAWAL_NOT_FOUND");
        return w;
      });

      try {
        const decryptedAccountNumber = decrypt(withdrawal.bankAccountNumber);
        const payout = await createPayout({
          accountNumber: decryptedAccountNumber,
          ifscCode: withdrawal.ifscCode,
          beneficiaryName: withdrawal.bankAccountName,
          amount: withdrawal.amount,
          referenceId: withdrawal.id,
        });

        const finalResult = await prisma.$transaction(async (tx: any) => {
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
            await tx.wallet.update({
              where: { id: withdrawal.walletId },
              data: { balance: { increment: withdrawal.amount } }
            });
            await tx.transaction.create({
              data: {
                walletId: withdrawal.walletId,
                withdrawalId,
                type: "REFUND",
                amount: withdrawal.amount,
                status: "COMPLETED",
                description: `Payout rejected/failed immediately with status ${payout.status}`,
              },
            });
            await tx.transaction.updateMany({
              where: { withdrawalId, type: "WITHDRAWAL", status: "PENDING" },
              data: { status: "FAILED" }
            });
            return await tx.withdrawal.update({
              where: { id: withdrawalId },
              data: { status: "FAILED", failureReason: `Payout rejected/failed immediately with status ${payout.status}`, razorpayPayoutId: payout.payoutId, processedAt: new Date() }
            });
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
        return NextResponse.json(finalResult);
      } catch (error: any) {
        logger.error("Admin approval payout creation failed", { withdrawalId, error });
        const errorMsg = error?.message || "";
        const isTimeoutOrNetworkError =
          errorMsg.includes("timeout") ||
          errorMsg.includes("fetch") ||
          errorMsg.includes("network") ||
          errorMsg.includes("ENOTFOUND") ||
          errorMsg.includes("ECONNREFUSED");

        if (isTimeoutOrNetworkError) {
          return NextResponse.json({
            id: withdrawalId,
            status: "PROCESSING",
            message: "Payout timed out or network error. Keeping status as PROCESSING for background reconciliation."
          });
        } else {
          await prisma.$transaction(async (tx: any) => {
            await tx.wallet.update({ where: { id: withdrawal.walletId }, data: { balance: { increment: withdrawal.amount } } });
            await tx.transaction.create({
              data: {
                walletId: withdrawal.walletId,
                withdrawalId,
                type: "REFUND",
                amount: withdrawal.amount,
                status: "COMPLETED",
                description: `Payout failed: ${errorMsg || "Gateway error"}`
              },
            });
            await tx.transaction.updateMany({
              where: { withdrawalId, type: "WITHDRAWAL", status: "PENDING" },
              data: { status: "FAILED" }
            });
            await tx.withdrawal.update({
              where: { id: withdrawalId },
              data: { status: "FAILED", failureReason: errorMsg || "Gateway creation failed", processedAt: new Date() }
            });
          });
          return NextResponse.json({ error: `Payout failed: ${errorMsg}` }, { status: 400 });
        }
      }
    }
  } catch (error: unknown) {
    logger.error("Failed to process payout", error, { withdrawalId, action });

    // Handle known error messages with appropriate status codes
    const msg = error instanceof Error ? error.message : "";
    if (msg === "WITHDRAWAL_NOT_FOUND") {
      return NextResponse.json({ error: "Withdrawal not found" }, { status: 404 });
    }
    if (msg === "WITHDRAWAL_ALREADY_PROCESSED") {
      return NextResponse.json(
        { error: "Withdrawal has already been processed" },
        { status: 409 },
      );
    }

    // Never expose raw error.message — it may contain PII or internal details
    return NextResponse.json(
      { error: "Failed to process payout. Please try again." },
      { status: 500 },
    );
  }
});
