import { AppError } from "@/lib/errors";
import { Prisma } from "@prisma/client";
import { invalidate } from "@/lib/cache";

export async function invalidateDealCache(dealId: string) {
  await invalidate(`deal:${dealId}`);
}

export async function lockAndFetchDealForAction(tx: Prisma.TransactionClient, dealId: string) {
  // Execute row-level write lock in PostgreSQL
  await tx.$queryRaw`SELECT id FROM "Deal" WHERE id = ${dealId} FOR UPDATE`;

  const deal = await tx.deal.findUnique({
    where: { id: dealId },
    include: {
      influencer: {
        select: { id: true, userId: true, displayName: true },
      },
      brand: {
        select: { id: true, userId: true, companyName: true },
      },
      campaign: {
        select: {
          id: true,
          title: true,
          isDirectInvite: true,
          totalBudget: true,
          status: true,
          brandId: true,
        },
      },
      contentSubmissions: {
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });
  if (!deal) throw AppError.notFound("Deal not found");
  return deal;
}


export type DealWithRelations = Prisma.PromiseReturnType<typeof lockAndFetchDealForAction>;

export interface ExpiredDealCandidate {
  id: string;
  submittedAt: Date | null;
  reviewPeriodHours: number;
  requiresPostVerification: boolean;
  campaign: { title: string };
  brand: { userId: string } | null;
  influencer: { userId: string };
  contentSubmissions: Array<{ id: string; status: string }>;
}

export async function releaseWalletHold(
  tx: Prisma.TransactionClient,
  brandUserId: string,
  dealId: string,
  amount: number,
  description: string,
  metadata?: Record<string, unknown>,
  mode?: "INCREMENT_PENDING" | "INCREMENT_BALANCE" | "SHIFT_PENDING_TO_BALANCE"
) {
  const wallet = await tx.wallet.findUnique({
    where: { userId: brandUserId },
    select: { id: true, pendingBalance: true },
  });

  if (!wallet) return;

  let finalAmount = amount;
  if (mode === "SHIFT_PENDING_TO_BALANCE") {
    finalAmount = Math.min(wallet.pendingBalance, amount);
  }

  if (finalAmount <= 0) return;

  let updateData = {};
  if (mode === "INCREMENT_PENDING") {
    updateData = { pendingBalance: { increment: finalAmount } };
  } else if (mode === "INCREMENT_BALANCE") {
    updateData = { balance: { increment: finalAmount } };
  } else {
    updateData = {
      pendingBalance: { decrement: finalAmount },
      balance: { increment: finalAmount },
    };
  }

  await tx.wallet.update({
    where: { id: wallet.id },
    data: updateData,
  });

  await tx.transaction.create({
    data: {
      walletId: wallet.id,
      dealId: dealId,
      type: "REFUND",
      amount: finalAmount,
      status: "COMPLETED",
      description,
      ...(metadata ? { metadata: metadata as Prisma.InputJsonValue } : {}),
    },
  });
}

export function normalizeMandatoryElements(
  terms: { mandatoryElements?: unknown; mandatoryTags?: unknown } | null,
) {
  const elements = Array.isArray(terms?.mandatoryElements)
    ? terms.mandatoryElements
    : terms?.mandatoryTags;

  if (!Array.isArray(elements)) return [];

  return elements
    .map((element) => String(element).trim())
    .filter(Boolean);
}

export function formatFraudFlags(flags: { description?: string; rule?: string }[]) {
  return flags
    .map((flag) => flag.description || flag.rule || "Verification failed")
    .join(", ");
}

export function validateShippingAddress(value: unknown): Prisma.InputJsonValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw AppError.badRequest("Shipping address is required");
  }

  const input = value as Record<string, unknown>;
  const getSafeStr = (v: unknown, fallback = ""): string => {
    return typeof v === "string" || typeof v === "number" || typeof v === "boolean"
      ? String(v).trim()
      : fallback;
  };

  const address = {
    fullName: getSafeStr(input.fullName),
    phone: getSafeStr(input.phone),
    line1: getSafeStr(input.line1),
    line2: input.line2 ? getSafeStr(input.line2) : null,
    city: getSafeStr(input.city),
    state: getSafeStr(input.state),
    pinCode: getSafeStr(input.pinCode),
    country: getSafeStr(input.country, "India"),
  };

  if (
    !address.fullName ||
    !/^[6-9]\d{9}$/.test(address.phone) ||
    !address.line1 ||
    !address.city ||
    !address.state ||
    !/^\d{6}$/.test(address.pinCode)
  ) {
    throw AppError.badRequest("Complete Indian shipping address with valid phone and PIN is required");
  }

  return address as Prisma.InputJsonValue;
}

