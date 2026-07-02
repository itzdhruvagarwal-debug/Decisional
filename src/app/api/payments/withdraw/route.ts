import { apiWrapper, ApiResponse } from "@/lib/api-wrapper";
import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { PaymentService } from "@/services/payment.service";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";

const withdrawalSchema = z
  .object({
    amount: z.preprocess(
      (value) => Number(value),
      z.number().int().positive().min(50000, "Minimum withdrawal is INR 500"),
    ),
    bankAccountId: z.string().optional(),
    bankAccountName: z.string().min(2, "Invalid name").optional(),
    bankAccountNumber: z.string().optional(),
    ifscCode: z.string().optional(),
    upiId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.bankAccountId) {
      const isUpiInline = !!data.upiId && !data.bankAccountNumber && !data.ifscCode;
      if (!isUpiInline) {
        if (!data.bankAccountName || !data.bankAccountNumber || !data.ifscCode) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "Provide either bankAccountId, full bank account details, or a UPI ID for withdrawal",
          });
        } else {
          if (!/^\d{9,18}$/.test(data.bankAccountNumber)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["bankAccountNumber"],
              message: "Invalid account number",
            });
          }
          if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(data.ifscCode)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["ifscCode"],
              message: "Invalid IFSC code",
            });
          }
        }
      } else {
        if (!/^[\w.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(data.upiId!)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["upiId"],
            message: "Invalid UPI ID format (e.g. name@bank)",
          });
        }
      }
    }
  });

function getWithdrawalIdempotencyKey(request: NextRequest, userId: string) {
  const headerKey = request.headers.get("Idempotency-Key")?.trim();
  return `withdraw:${userId}:${headerKey}`;
}

function checkIdempotencyHeader(request: NextRequest) {
  const idempotencyHeader = request.headers.get("Idempotency-Key")?.trim();
  if (!idempotencyHeader || !/^[A-Za-z0-9:_-]{16,128}$/.test(idempotencyHeader)) {
    throw AppError.badRequest("Invalid Idempotency-Key");
  }
}

async function verifyTaxCompliance(userId: string) {
  const taxCompliance = await prisma.indiaTaxCompliance.findUnique({
    where: { userId },
    select: { panLast4: true },
  });

  if (!taxCompliance?.panLast4) {
    throw AppError.badRequest("PAN tax compliance is required before withdrawals");
  }
}

async function getPayoutDetailsFromDb(userId: string, bankAccountId: string) {
  const bankAccount = await prisma.bankAccount.findFirst({
    where: {
      id: bankAccountId,
      userId,
    },
  });

  if (!bankAccount) {
    throw AppError.notFound("Bank account not found");
  }

  let accountNumber = bankAccount.accountNumber;
  try {
    accountNumber = decrypt(bankAccount.accountNumber);
  } catch {
    // Support old plain-text records if they still exist.
  }

  const isUpiPayout = accountNumber === "UPI_PAYOUT" && bankAccount.ifscCode === "UPI00000000";

  if (!isUpiPayout && !/^\d{9,18}$/.test(accountNumber)) {
    throw AppError.badRequest(
      "Stored bank account is invalid or masked. Please re-add this account before withdrawing."
    );
  }

  let upiId = bankAccount.upiId;
  if (upiId) {
    try {
      upiId = decrypt(upiId);
    } catch {
      // Support old plain-text records if they still exist.
    }
  }

  const details: {
    bankAccountName: string;
    bankAccountNumber: string;
    ifscCode: string;
    upiId?: string;
  } = {
    bankAccountName: bankAccount.accountName,
    bankAccountNumber: accountNumber,
    ifscCode: bankAccount.ifscCode,
  };
  if (upiId) {
    details.upiId = upiId;
  }
  return details;
}

function getPayoutDetailsFromInput(data: z.infer<typeof withdrawalSchema>) {
  const isUpiInline = !!data.upiId && !data.bankAccountNumber && !data.ifscCode;
  const details: {
    bankAccountName: string;
    bankAccountNumber: string;
    ifscCode: string;
    upiId?: string;
  } = {
    bankAccountName: data.bankAccountName || "UPI Payout",
    bankAccountNumber: isUpiInline ? "UPI_PAYOUT" : data.bankAccountNumber!,
    ifscCode: isUpiInline ? "UPI00000000" : data.ifscCode!,
  };
  if (data.upiId) {
    details.upiId = data.upiId;
  }
  return details;
}

async function getPayoutDetails(userId: string, data: z.infer<typeof withdrawalSchema>) {
  if (data.bankAccountId) {
    return getPayoutDetailsFromDb(userId, data.bankAccountId);
  }
  return getPayoutDetailsFromInput(data);
}

function handleWithdrawalPostError(error: unknown) {
  const errMsg = error instanceof Error ? error.message : String(error);
  logger.error("POST /api/payments/withdraw error", { error: errMsg });

  if (errMsg === "WITHDRAWAL_BLOCK") {
    return ApiResponse.forbidden("Withdrawal is currently blocked. Please contact support.");
  }

  if (errMsg.includes("Insufficient funds") || errMsg.includes("INSUFFICIENT_FUNDS_OR_FROZEN")) {
    return ApiResponse.error("Insufficient funds or frozen balance. Please check your wallet.", 400);
  }

  if (errMsg.includes("Payout failed")) {
    return ApiResponse.error("Payout could not be processed. Please try again later.", 400);
  }

  if (errMsg.includes("Rate limit")) {
    return ApiResponse.error("Too many requests. Please wait before trying again.", 429);
  }

  return ApiResponse.error("Withdrawal failed. Please try again later.", 500);
}

async function _handler_POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return ApiResponse.unauthorized();
    }
    if (session.user.userType !== "INFLUENCER") {
      return ApiResponse.forbidden("Only influencers can withdraw");
    }

    checkIdempotencyHeader(request);

    const body = await request.json();
    const parsed = withdrawalSchema.safeParse(body);

    if (!parsed.success) {
      return ApiResponse.error("Invalid payload");
    }

    await verifyTaxCompliance(session.user.id);

    const limit = await checkRateLimit(session.user.id, "WITHDRAWAL");
    if (!limit.success) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(limit.reset - Date.now() / 1000),
      );
      return ApiResponse.tooManyRequests(
        "Daily withdrawal limit reached. Please try again later.",
        retryAfterSeconds
      );
    }

    const payoutDetails = await getPayoutDetails(session.user.id, parsed.data);

    const idempotencyKey = getWithdrawalIdempotencyKey(request, session.user.id);

    const withdrawal = await PaymentService.initiateWithdrawal(
      session.user.id,
      {
        amount: parsed.data.amount,
        ...payoutDetails,
      },
      idempotencyKey,
    );

    const responseMessage = withdrawal.status === "PENDING_REVIEW"
      ? "Withdrawal requires manual review. It will be reviewed by our team."
      : "Withdrawal initiated successfully";

    return ApiResponse.success(withdrawal, responseMessage);
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return ApiResponse.error(error.message, error.statusCode);
    }
    return handleWithdrawalPostError(error);
  }
}

// Wrapped handlers via apiWrapper
export const POST = apiWrapper(_handler_POST);
