import { TransactionStatus, TransactionType } from "@prisma/client";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";

interface WalletTransactionFilters {
  type?: TransactionType;
  status?: TransactionStatus;
  startDate?: Date;
  endDate?: Date;
}

export class WalletService {
  static async getWallet(
    userId: string,
    page: number = 1,
    limit: number = 20,
    filters?: WalletTransactionFilters,
  ) {
    try {
      const safePage = Math.max(1, page);
      const safeLimit = Math.min(100, Math.max(1, limit));

      let walletData = await prisma.wallet.findUnique({
        where: { userId },
        include: {
          withdrawals: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
      });

      if (!walletData) {
        logger.warn("Wallet not found for user, auto-creating", { userId });
        walletData = await prisma.wallet.create({
          data: { userId },
          include: {
            withdrawals: {
              orderBy: { createdAt: "desc" },
              take: 5,
            },
          },
        });
      }

      const transactionWhere: {
        walletId: string;
        type?: TransactionType;
        status?: TransactionStatus;
        createdAt?: { gte?: Date; lte?: Date };
      } = {
        walletId: walletData.id,
      };

      if (filters?.type) {
        transactionWhere.type = filters.type;
      }

      if (filters?.status) {
        transactionWhere.status = filters.status;
      }

      if (filters?.startDate || filters?.endDate) {
        transactionWhere.createdAt = {
          ...(filters?.startDate ? { gte: filters.startDate } : {}),
          ...(filters?.endDate ? { lte: filters.endDate } : {}),
        };
      }

      const [transactions, totalTransactions] = await Promise.all([
        prisma.transaction.findMany({
          where: transactionWhere,
          orderBy: { createdAt: "desc" },
          skip: (safePage - 1) * safeLimit,
          take: safeLimit,
        }),
        prisma.transaction.count({ where: transactionWhere }),
      ]);

      let totalHeld = 0;
      const brandProfile = await prisma.brandProfile.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (brandProfile?.id) {
        const holds = await prisma.paymentHold.aggregate({
          where: {
            status: "HELD",
            deal: {
              brandId: brandProfile.id,
            },
          },
          _sum: {
            amount: true,
          },
        });
        totalHeld = holds._sum.amount || 0;
      }

      logger.info("Wallet fetched successfully", {
        userId,
        transactionCount: totalTransactions,
      });

      return {
        wallet: {
          ...walletData,
          transactions,
          totalHeld,
        },
        totalTransactions,
        totalPages: Math.ceil(totalTransactions / safeLimit),
      };
    } catch (error) {
      logger.error("Error fetching wallet", error, { userId });
      throw new Error("Failed to fetch wallet details");
    }
  }
}
