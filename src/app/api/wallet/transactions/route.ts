import { NextResponse } from "next/server";
import { z } from "zod";
import { TransactionStatus, TransactionType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { WalletService } from "@/services/wallet.service";
import { logger } from "@/lib/logger";

const querySchema = z.object({
  page: z.preprocess((val) => Number(val), z.number().int().min(1).default(1)),
  limit: z.preprocess((val) => Number(val), z.number().int().min(1).max(100).default(20)),
  type: z.nativeEnum(TransactionType).optional(),
  status: z.nativeEnum(TransactionStatus).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
}).superRefine((data, ctx) => {
  const startTs = data.startDate ? Date.parse(data.startDate) : NaN;
  const endTs = data.endDate ? Date.parse(data.endDate) : NaN;

  if (data.startDate && Number.isNaN(startTs)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["startDate"],
      message: "Invalid startDate",
    });
  }

  if (data.endDate && Number.isNaN(endTs)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "Invalid endDate",
    });
  }

  if (!Number.isNaN(startTs) && !Number.isNaN(endTs) && startTs > endTs) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "endDate must be greater than or equal to startDate",
    });
  }
});

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      page: searchParams.get("page") || undefined,
      limit: searchParams.get("limit") || undefined,
      type: searchParams.get("type") || undefined,
      status: searchParams.get("status") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: "Invalid query parameters", data: parsed.error.format() },
        { status: 400 }
      );
    }

    const startDate = parsed.data.startDate
      ? new Date(parsed.data.startDate)
      : undefined;

    const endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : undefined;
    // For date-only values, include the full day window.
    if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.data.endDate || "")) {
      endDate.setHours(23, 59, 59, 999);
    }

    // WalletService.getWallet returns wallet + transactions (with pagination)
    const walletFilters = {
      ...(parsed.data.type ? { type: parsed.data.type } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    };

    const result = await WalletService.getWallet(
      session.user.id,
      parsed.data.page,
      parsed.data.limit,
      walletFilters,
      session.user.userType,
    );

    return NextResponse.json(
      {
        success: true,
        message: "Transactions retrieved",
        transactions: result.wallet?.transactions ?? [],
        pagination: {
          totalTransactions: result.totalTransactions,
          totalPages: result.totalPages,
          page: parsed.data.page,
          limit: parsed.data.limit,
        },
        data: {
          transactions: result.wallet?.transactions ?? [],
          totalTransactions: result.totalTransactions,
          totalPages: result.totalPages,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    logger.error("GET /api/wallet/transactions error", { error: error.message });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
