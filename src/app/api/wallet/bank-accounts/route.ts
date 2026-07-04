import { apiWrapper } from "@/lib/api-wrapper";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { encrypt, maskAccountNumber, maskUpiId, hashForDuplicateDetection } from "@/lib/encryption";
import { checkRateLimit } from "@/lib/rate-limit";

const bankAccountSchema = z
  .object({
    accountName: z.string().min(2, "Name must be at least 2 characters").max(100),
    accountNumber: z.string().optional(),
    ifscCode: z.string().optional(),
    bankName: z.string().optional(),
    upiId: z.string().max(50).optional(),
    isDefault: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const isUpiOnly = !!data.upiId && !data.accountNumber && !data.ifscCode && !data.bankName;
    if (isUpiOnly) {
      if (!data.upiId || !/^[\w.-]{2,256}@[a-zA-Z]{2,64}$/.test(data.upiId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["upiId"],
          message: "Invalid UPI ID format (e.g. name@bank)",
        });
      }
    } else {
      if (!data.accountNumber || !/^\d{9,18}$/.test(data.accountNumber)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["accountNumber"],
          message: "Invalid account number (9-18 digits)",
        });
      }
      if (!data.ifscCode || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(data.ifscCode)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ifscCode"],
          message: "Invalid IFSC Code",
        });
      }
      if (!data.bankName || data.bankName.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["bankName"],
          message: "Bank name is required",
        });
      }
    }
  });

async function _handler_GET(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.userType !== "INFLUENCER") {
      return NextResponse.json(
        { error: "Only influencers can manage payout bank accounts" },
        { status: 403 },
      );
    }

    const accounts = await prisma.bankAccount.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      accounts: accounts.map((account: (typeof accounts)[number]) => ({
        ...account,
        accountNumber: maskAccountNumber(account.accountNumber),
        upiId: account.upiId ? maskUpiId(account.upiId) : null,
      })),
    });
  } catch (error) {
    logger.error("Failed to fetch bank accounts", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

async function _handler_POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.userType !== "INFLUENCER") {
      return NextResponse.json(
        { error: "Only influencers can manage payout bank accounts" },
        { status: 403 },
      );
    }

    const limit = await checkRateLimit(session.user.id, "PROFILE_UPDATE");
    if (!limit.success) {
      return NextResponse.json({ error: "Too many bank account updates" }, { status: 429 });
    }

    const body = await req.json();
    const result = bankAccountSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid input", details: result.error.format() },
        { status: 400 },
      );
    }

    const { accountName, accountNumber, ifscCode, bankName, upiId, isDefault } =
      result.data;

    // Enforce maximum 5 bank accounts per user (DoS & abuse prevention)
    const existingCount = await prisma.bankAccount.count({
      where: { userId: session.user.id },
    });
    if (existingCount >= 5) {
      return NextResponse.json(
        { error: "Maximum of 5 bank accounts allowed per user" },
        { status: 400 },
      );
    }

    // If setting as default, unset others first
    if (isDefault) {
      await prisma.bankAccount.updateMany({
        where: { userId: session.user.id },
        data: { isDefault: false },
      });
    }

    const finalAccountNumber = accountNumber || "UPI_PAYOUT";
    const finalIfscCode = ifscCode || "UPI00000000";
    const finalBankName = bankName || "UPI";
    const encryptedAccountNumber = encrypt(finalAccountNumber);
    const accountNumberHash = hashForDuplicateDetection(finalAccountNumber);

    const encryptedUpiId = upiId ? encrypt(upiId) : null;
    const upiIdHash = upiId ? hashForDuplicateDetection(upiId) : null;

    const account = await prisma.bankAccount.create({
      data: {
        userId: session.user.id,
        accountName,
        accountNumber: encryptedAccountNumber,
        accountNumberHash,
        ifscCode: finalIfscCode,
        bankName: finalBankName,
        upiId: encryptedUpiId,
        upiIdHash,
        isDefault: isDefault || false,
      },
    });

    return NextResponse.json({
      success: true,
      account: {
        ...account,
        accountNumber: maskAccountNumber(account.accountNumber),
        upiId: account.upiId ? maskUpiId(account.upiId) : null,
      },
    });
  } catch (error) {
    logger.error("Failed to add bank account", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

async function _handler_DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.userType !== "INFLUENCER") {
      return NextResponse.json(
        { error: "Only influencers can manage payout bank accounts" },
        { status: 403 },
      );
    }

    const limit = await checkRateLimit(session.user.id, "PROFILE_UPDATE");
    if (!limit.success) {
      return NextResponse.json({ error: "Too many bank account updates" }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    // Verify ownership
    const account = await prisma.bankAccount.findUnique({
      where: { id },
    });

    if (!account || account.userId !== session.user.id) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    await prisma.bankAccount.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to delete bank account", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

async function _handler_PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.userType !== "INFLUENCER") {
      return NextResponse.json(
        { error: "Only influencers can manage payout bank accounts" },
        { status: 403 },
      );
    }

    const limit = await checkRateLimit(session.user.id, "PROFILE_UPDATE");
    if (!limit.success) {
      return NextResponse.json({ error: "Too many bank account updates" }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    // Verify ownership
    const account = await prisma.bankAccount.findUnique({ where: { id } });
    if (!account || account.userId !== session.user.id) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // Clear all defaults for this user, then set the chosen one
    await prisma.$transaction([
      prisma.bankAccount.updateMany({
        where: { userId: session.user.id },
        data: { isDefault: false },
      }),
      prisma.bankAccount.update({
        where: { id },
        data: { isDefault: true },
      }),
    ]);

    logger.info("Bank account set as default", { userId: session.user.id, accountId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to set default bank account", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}



// Wrapped handlers via apiWrapper
export const GET = apiWrapper(_handler_GET);
export const POST = apiWrapper(_handler_POST);
export const PUT = apiWrapper(_handler_PUT);
export const DELETE = apiWrapper(_handler_DELETE);
