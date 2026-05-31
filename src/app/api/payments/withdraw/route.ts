import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { PaymentService } from "@/services/payment.service";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkPaymentFraud } from "@/lib/fraud-detection";

const withdrawalSchema = z
  .object({
    amount: z.preprocess(
      (value) => Number(value),
      z.number().int().positive().min(50000, "Minimum withdrawal is INR 500"),
    ),
    bankAccountId: z.string().optional(),
    bankAccountName: z.string().min(2, "Invalid name").optional(),
    bankAccountNumber: z
      .string()
      .regex(/^\d{9,18}$/, "Invalid account number")
      .optional(),
    ifscCode: z
      .string()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC code")
      .optional(),
    upiId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.bankAccountId) {
      if (!data.bankAccountName || !data.bankAccountNumber || !data.ifscCode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Provide either bankAccountId or full bank account details for withdrawal",
        });
      }
    }
  });

function getWithdrawalIdempotencyKey(request: Request, userId: string) {
  const headerKey = request.headers.get("Idempotency-Key")?.trim();
  return `withdraw:${userId}:${headerKey}`;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 },
      );
    }
    if (session.user.userType !== "INFLUENCER") {
      return NextResponse.json(
        { success: false, message: "Only influencers can withdraw" },
        { status: 403 },
      );
    }

    const idempotencyHeader = request.headers.get("Idempotency-Key")?.trim();
    if (!idempotencyHeader || !/^[A-Za-z0-9:_-]{16,128}$/.test(idempotencyHeader)) {
      return NextResponse.json(
        { success: false, message: "Idempotency-Key header is required and must be 16-128 characters (alphanumeric, -, _, :)" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = withdrawalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid payload",
          data: parsed.error.format(),
        },
        { status: 400 },
      );
    }

    const taxCompliance = await prisma.indiaTaxCompliance.findUnique({
      where: { userId: session.user.id },
      select: { panLast4: true },
    });

    if (!taxCompliance?.panLast4) {
      return NextResponse.json(
        {
          success: false,
          message:
            "PAN tax compliance is required before withdrawals. Add it in India Tax Compliance settings.",
          code: "TAX_COMPLIANCE_REQUIRED",
          upgradeUrl: "/dashboard/settings?tab=tax",
        },
        { status: 403 },
      );
    }

    const limit = await checkRateLimit(session.user.id, "WITHDRAWAL");
    if (!limit.success) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(limit.reset - Date.now() / 1000),
      );
      return NextResponse.json(
        {
          success: false,
          message: "Daily withdrawal limit reached. Please try again later.",
        },
        {
          status: 429,
          headers: { "Retry-After": retryAfterSeconds.toString() },
        },
      );
    }

    const fraudCheck = await checkPaymentFraud({
      userId: session.user.id,
      amount: parsed.data.amount,
      ...(parsed.data.bankAccountNumber
        ? { bankAccount: parsed.data.bankAccountNumber }
        : {}),
      ...(parsed.data.upiId ? { upiId: parsed.data.upiId } : {}),
    });

    if (fraudCheck.action === "BLOCK" || fraudCheck.action === "REVIEW") {
      logger.warn("Withdrawal blocked by fraud check", {
        userId: session.user.id,
        amount: parsed.data.amount,
        action: fraudCheck.action,
        flags: fraudCheck.flags.map((flag) => flag.rule),
      });
      return NextResponse.json(
        {
          success: false,
          message:
            fraudCheck.action === "REVIEW"
              ? "Withdrawal requires manual review. Please contact support."
              : "Withdrawal blocked by risk checks.",
          code: `WITHDRAWAL_${fraudCheck.action}`,
        },
        { status: 403 },
      );
    }

    let payoutDetails: {
      bankAccountName: string;
      bankAccountNumber: string;
      ifscCode: string;
      upiId?: string;
    };

    if (parsed.data.bankAccountId) {
      const bankAccount = await prisma.bankAccount.findFirst({
        where: {
          id: parsed.data.bankAccountId,
          userId: session.user.id,
        },
      });

      if (!bankAccount) {
        return NextResponse.json(
          { success: false, message: "Bank account not found" },
          { status: 404 },
        );
      }

      let accountNumber = bankAccount.accountNumber;
      try {
        accountNumber = decrypt(bankAccount.accountNumber);
      } catch {
        // Support old plain-text records if they still exist.
      }

      if (!/^\d{9,18}$/.test(accountNumber)) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Stored bank account is invalid or masked. Please re-add this account before withdrawing.",
          },
          { status: 400 },
        );
      }

      payoutDetails = {
        bankAccountName: bankAccount.accountName,
        bankAccountNumber: accountNumber,
        ifscCode: bankAccount.ifscCode,
      };
      if (bankAccount.upiId) {
        payoutDetails.upiId = bankAccount.upiId;
      }
    } else {
      payoutDetails = {
        bankAccountName: parsed.data.bankAccountName!,
        bankAccountNumber: parsed.data.bankAccountNumber!,
        ifscCode: parsed.data.ifscCode!,
      };
      if (parsed.data.upiId) {
        payoutDetails.upiId = parsed.data.upiId;
      }
    }

    const idempotencyKey = getWithdrawalIdempotencyKey(request, session.user.id);

    const withdrawal = await PaymentService.initiateWithdrawal(
      session.user.id,
      {
        amount: parsed.data.amount,
        ...payoutDetails,
      },
      idempotencyKey,
    );

    return NextResponse.json(
      {
        success: true,
        message: "Withdrawal initiated successfully",
        data: withdrawal,
      },
      { status: 200 },
    );
  } catch (error: any) {
    logger.error("POST /api/payments/withdraw error", { error: error.message });

    if (
      error.message?.includes("Insufficient funds") ||
      error.message?.includes("INSUFFICIENT_FUNDS_OR_FROZEN") ||
      error.message?.includes("Payout failed") ||
      error.message?.includes("Rate limit")
    ) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: false, message: "Failed to process withdrawal" },
      { status: 500 },
    );
  }
}
