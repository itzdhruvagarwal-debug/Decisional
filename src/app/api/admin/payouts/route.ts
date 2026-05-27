import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireActiveAdmin } from "@/lib/admin-auth";
import { decrypt, maskAccountNumber } from "@/lib/encryption";

const querySchema = z.object({
  status: z
    .enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED", "ALL"])
    .default("PENDING"),
  page: z.preprocess(
    (val) => (val === undefined ? undefined : Number(val)),
    z.number().int().min(1).default(1),
  ),
  limit: z.preprocess(
    (val) => (val === undefined ? undefined : Number(val)),
    z.number().int().min(1).max(100).default(50),
  ),
});

function tryDecrypt(value?: string | null) {
  if (!value) return null;
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

function maskUpi(value?: string | null) {
  const plain = tryDecrypt(value);
  if (!plain) return null;
  const [local, domain] = plain.split("@");
  if (!local || !domain) return "Configured";
  return `${local.slice(0, 2)}***@${domain}`;
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    try {
      await requireActiveAdmin(session?.user);
    } catch {
      return NextResponse.json(
        { success: false, message: "Forbidden. Admin access required." },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      status: searchParams.get("status") || undefined,
      page: searchParams.get("page") || undefined,
      limit: searchParams.get("limit") || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid parameters",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { status, page, limit } = parsed.data;
    const where = status === "ALL" ? {} : { status };

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where,
        include: {
          wallet: {
            select: {
              user: {
                select: {
                  id: true,
                  email: true,
                  userType: true,
                  influencerProfile: { select: { displayName: true } },
                  brandProfile: { select: { companyName: true } },
                  taxCompliance: {
                    select: {
                      panLast4: true,
                      status: true,
                      itrAcknowledgementLast4: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.withdrawal.count({ where }),
    ]);

    const safeWithdrawals = withdrawals.map((withdrawal: (typeof withdrawals)[number]) => ({
      ...withdrawal,
      bankAccountNumber: maskAccountNumber(withdrawal.bankAccountNumber),
      upiId: maskUpi(withdrawal.upiId),
    }));

    return NextResponse.json(
      {
        success: true,
        message: "Payouts retrieved",
        withdrawals: safeWithdrawals,
        total,
        page,
        limit,
        data: { withdrawals: safeWithdrawals, total, page, limit },
      },
      { status: 200 },
    );
  } catch (error: any) {
    logger.error("GET /api/admin/payouts error", { error: error.message });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 },
    );
  }
}
