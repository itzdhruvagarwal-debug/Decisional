import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { encrypt, maskAccountNumber } from "@/lib/encryption";

const bankAccountSchema = z.object({
  accountName: z.string().min(2, "Name must be at least 2 characters").max(100),
  // 9-18 digit account numbers only
  accountNumber: z
    .string()
    .regex(/^\d{9,18}$/, "Invalid account number (9-18 digits)"),
  ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC Code"),
  bankName: z.string().min(2, "Bank name is required").max(100),
  upiId: z.string().max(50).optional(),
  isDefault: z.boolean().optional(),
});

export async function GET(_req: NextRequest) {
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

export async function POST(req: NextRequest) {
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

    const encryptedAccountNumber = encrypt(accountNumber);

    const account = await prisma.bankAccount.create({
      data: {
        userId: session.user.id,
        accountName,
        accountNumber: encryptedAccountNumber,
        ifscCode,
        bankName,
        upiId,
        isDefault: isDefault || false,
      },
    });

    return NextResponse.json({
      success: true,
      account: {
        ...account,
        accountNumber: maskAccountNumber(account.accountNumber),
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

export async function DELETE(req: NextRequest) {
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
