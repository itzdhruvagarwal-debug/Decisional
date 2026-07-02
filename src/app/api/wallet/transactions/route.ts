import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TransactionStatus, TransactionType } from "@prisma/client";
import { apiWrapper } from "@/lib/api-wrapper";
import { WalletService } from "@/services/wallet.service";
import { auth } from "@/lib/auth";
import { toCsv, csvResponse, paiseToRupees } from "@/lib/csv-export";
import { format } from "date-fns";

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

export const GET = apiWrapper(async (req: NextRequest) => {
  const session = await auth();
  const userId = session!.user!.id;

  const { searchParams } = req.nextUrl;
  const parsed = querySchema.parse({
    page: searchParams.get("page") || undefined,
    limit: searchParams.get("limit") || undefined,
    type: searchParams.get("type") || undefined,
    status: searchParams.get("status") || undefined,
    startDate: searchParams.get("startDate") || undefined,
    endDate: searchParams.get("endDate") || undefined,
  });

  const startDate = parsed.startDate
    ? new Date(parsed.startDate)
    : undefined;

  const endDate = parsed.endDate ? new Date(parsed.endDate) : undefined;
  if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.endDate || "")) {
    endDate.setHours(23, 59, 59, 999);
  }

  const walletFilters = {
    ...(parsed.type ? { type: parsed.type } : {}),
    ...(parsed.status ? { status: parsed.status } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
  };

  // CSV export - fetch all transactions without pagination
  if (searchParams.get("format") === "csv") {
    const allResult = await WalletService.getWallet(userId, 1, 10000, walletFilters);
    const txns = allResult.wallet?.transactions ?? [];
    
    const rows = txns.map((t) => ({
      "Date":        format(new Date(t.createdAt), "dd/MM/yyyy HH:mm"),
      "Type":        t.type,
      "Amount (₹)":  paiseToRupees(t.amount),
      "Status":      t.status,
      "Description": t.description ?? "",
    }));
    
    return csvResponse(toCsv(rows), `decisional-transactions-${userId}-${Date.now()}.csv`);
  }

  const result = await WalletService.getWallet(
    userId,
    parsed.page,
    parsed.limit,
    walletFilters,
  );

  return NextResponse.json(
    {
      success: true,
      message: "Transactions retrieved",
      transactions: result.wallet?.transactions ?? [],
      pagination: {
        totalTransactions: result.totalTransactions,
        totalPages: result.totalPages,
        page: parsed.page,
        limit: parsed.limit,
      },
      data: {
        transactions: result.wallet?.transactions ?? [],
        totalTransactions: result.totalTransactions,
        totalPages: result.totalPages,
      },
    },
    { status: 200 }
  );
}, { requireAuth: true });
