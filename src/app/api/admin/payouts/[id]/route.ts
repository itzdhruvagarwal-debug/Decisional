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
    const result = await prisma.$transaction(async (tx: any) => {
      // ATOMIC LOCK: Prevent double-click race conditions that refund the wallet multiple times
      const validStatuses = ["PENDING", "PENDING_REVIEW"];
      const lockResult = await tx.withdrawal.updateMany({
        where: {
          id: withdrawalId,
          status: { in: validStatuses }
        },
        data: { updatedAt: new Date() }
      });

      if (lockResult.count === 0) {
        throw new Error("WITHDRAWAL_ALREADY_PROCESSED");
      }

      const withdrawal = await tx.withdrawal.findUnique({
        where: { id: withdrawalId },
      });

      if (!withdrawal) {
        throw new Error("WITHDRAWAL_NOT_FOUND");
      }

      if (action === "APPROVE") {
        const updated = await tx.withdrawal.update({
          where: { id: withdrawalId },
          data: {
            status: "COMPLETED",
            razorpayPayoutId,
            processedAt: new Date(),
          },
        });

        await tx.transaction.updateMany({
          where: {
            withdrawalId,
            type: "WITHDRAWAL",
            status: "PENDING",
          },
          data: { status: "COMPLETED" },
        });

        await tx.wallet.update({
          where: { id: withdrawal.walletId },
          data: { totalWithdrawn: { increment: withdrawal.amount } },
        });

        return updated;
      } else {
        // REJECT: Refund the wallet
        await tx.wallet.update({
          where: { id: withdrawal.walletId },
          data: {
            balance: { increment: withdrawal.amount },
          },
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
          where: {
            withdrawalId,
            type: "WITHDRAWAL",
            status: "PENDING",
          },
          data: { status: "FAILED" },
        });

        const updated = await tx.withdrawal.update({
          where: { id: withdrawalId },
          data: {
            status: "FAILED",
            failureReason,
            processedAt: new Date(),
          },
        });
        return updated;
      }
    });

    logger.info(`Admin ${action} payout`, {
      withdrawalId,
      action,
      adminId: admin.id,
    });
    return NextResponse.json(result);
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
