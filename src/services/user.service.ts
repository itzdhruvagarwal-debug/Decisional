import { AppError } from "@/lib/errors";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { WalletService } from "./wallet.service";
import { logger } from "@/lib/logger";

export class UserService {
  static async getProfile(userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          phone: true,
          userType: true,
          status: true,
          verificationLevel: true,
          emailVerified: true,
          phoneVerified: true,
          trustScore: true,
          xp: true,
          level: true,
          referralCode: true,
          createdAt: true,
          influencerProfile: true,
          brandProfile: true,
          wallet: {
            select: {
              balance: true,
              pendingBalance: true,
              totalEarned: true,
            },
          },
          badges: {
            select: {
              badge: true,
              earnedAt: true,
            },
          },
        },
      });

      if (!user) {
        throw AppError.notFound("User not found");
      }

      return user;
    } catch (error) {
      logger.error("Error fetching profile", error, { userId });
      throw error;
    }
  }

  static async listInfluencers(params: {
    category?: string;
    minFollowers?: number;
    city?: string;
    minEngagementRate?: number; // In basis points
    minRate?: number; // In paise
    maxRate?: number; // In paise
    platform?: string;
    page: number;
    limit: number;
    searchTerm?: string;
    brandUserId?: string;
  }) {
    try {
      const where: Prisma.InfluencerProfileWhereInput = {};

      if (params.category) {
        where.categories = { contains: params.category, mode: "insensitive" };
      }

      if (params.city) {
        where.city = { contains: params.city, mode: "insensitive" };
      }

      if (params.minFollowers) {
        where.instagramFollowers = { gte: params.minFollowers };
      }

      if (params.minEngagementRate !== undefined) {
        if (params.platform === "instagram") {
          where.instagramEngagementRate = { gte: params.minEngagementRate };
        } else if (params.platform === "youtube") {
          where.youtubeEngagementRate = { gte: params.minEngagementRate };
        } else {
          where.AND = [
            ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
            {
              OR: [
                { instagramEngagementRate: { gte: params.minEngagementRate } },
                { youtubeEngagementRate: { gte: params.minEngagementRate } },
              ],
            }
          ];
        }
      }

      if (params.minRate !== undefined || params.maxRate !== undefined) {
        where.minRate = {
          ...(params.minRate !== undefined ? { gte: params.minRate } : {}),
          ...(params.maxRate !== undefined ? { lte: params.maxRate } : {}),
        };
      }

      if (params.platform) {
        if (params.platform === "instagram") {
          where.instagramHandle = { not: null, notIn: [""] };
        } else if (params.platform === "youtube") {
          where.youtubeHandle = { not: null, notIn: [""] };
        }
      }

      if (params.searchTerm) {
        where.OR = [
          { displayName: { contains: params.searchTerm, mode: "insensitive" } },
          { bio: { contains: params.searchTerm, mode: "insensitive" } },
          {
            instagramHandle: {
              contains: params.searchTerm,
              mode: "insensitive",
            },
          },
        ];
      }

      if (params.brandUserId) {
        const brandWallet = await WalletService.getWalletBasic(params.brandUserId);
        if (brandWallet) {
          // Balance is in paise, minRate is in paise
          const maxAllowedRate = brandWallet.balance;

          // Show creators whose minRate is <= brand's available balance
          // Also gracefully handle cases where minRate is null or 0 if they haven't set it yet
          where.OR = where.OR || [];
          if (where.OR.length > 0) {
            // if there's already an OR condition (like searchTerm), we need to COMBINE it with an AND
            where.AND = [
              { OR: where.OR },
              {
                OR: [
                  { minRate: { lte: maxAllowedRate } },
                  { minRate: null },
                  { minRate: 0 },
                ],
              },
            ];
            delete where.OR;
          } else {
            where.OR = [
              { minRate: { lte: maxAllowedRate } },
              { minRate: null },
              { minRate: 0 },
            ];
          }
        }
      }

      // Ensure they have at least one social handle
      const hasSocialHandleCondition = {
        OR: [
          { AND: [{ instagramHandle: { not: null } }, { instagramHandle: { not: "" } }] },
          { AND: [{ youtubeHandle: { not: null } }, { youtubeHandle: { not: "" } }] },
        ]
      };
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        hasSocialHandleCondition,
      ];

      logger.info("Listing influencers", { params });

      const [influencers, total] = await Promise.all([
        prisma.influencerProfile.findMany({
          where,
          include: {
            user: {
              select: {
                trustScore: true,
                level: true,
                badges: {
                  select: {
                    badge: true,
                  },
                },
              },
            },
          },
          orderBy: { totalDeals: "desc" }, // Default sorting by activity
          skip: (params.page - 1) * params.limit,
          take: params.limit,
        }),
        prisma.influencerProfile.count({ where }),
      ]);

      return { influencers, total };
    } catch (error) {
      logger.error("Error listing influencers", error, { params });
      throw AppError.badRequest("Failed to list influencers");
    }
  }
}
