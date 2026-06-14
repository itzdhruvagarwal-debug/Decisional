import prisma from "@/lib/db";
import { influencerProfileSchema, brandProfileSchema } from "@/lib/validations";
import { logger } from "@/lib/logger";
import { addUserXp, checkAndAwardBadges } from "@/lib/gamification-engine";

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
        throw new Error("User not found");
      }

      return user;
    } catch (error) {
      logger.error("Error fetching profile", error, { userId });
      throw error;
    }
  }

  static async updateProfile(userId: string, userType: string, data: any) {
    try {
      if (userType === "INFLUENCER") {
        const parsed = influencerProfileSchema.parse(data);

        const updatedProfile = await prisma.influencerProfile.update({
          where: { userId },
          data: {
            displayName: parsed.displayName,
            bio: parsed.bio,
            city: parsed.city,
            state: parsed.state,
            instagramHandle: parsed.instagramHandle,
            youtubeHandle: parsed.youtubeHandle,
            categories: Array.isArray(parsed.categories)
              ? parsed.categories.join(",")
              : parsed.categories || "",
            languages: Array.isArray(parsed.languages)
              ? parsed.languages.join(",")
              : parsed.languages || "",
            minRate: parsed.minRate,
            maxRate: parsed.maxRate,
            instagramFollowers: parsed.instagramFollowers,
            youtubeSubscribers: parsed.youtubeSubscribers,
            instagramEngagementRate: parsed.instagramEngagementRate,
            youtubeEngagementRate: parsed.youtubeEngagementRate,
          },
        });

        // XP Award Logic
        // XP Award Logic (Atomic)
        if (
          updatedProfile.bio &&
          updatedProfile.categories &&
          updatedProfile.categories.length > 0
        ) {
          await prisma.$transaction(async (tx: any) => {
            // Double-check inside transaction to prevent race conditions
            const alreadyAwarded = await tx.activityLog.findFirst({
              where: { userId, action: "PROFILE_COMPLETION_XP" },
            });

            if (!alreadyAwarded) {
              await addUserXp(userId, 25, "PROFILE_COMPLETION", tx);
              await checkAndAwardBadges(userId, "VERIFICATION", tx);
              await tx.activityLog.create({
                data: {
                  userId,
                  action: "PROFILE_COMPLETION_XP",
                  metadata: { xpAwarded: 25 },
                },
              });
            }
          });
        }

        logger.info("Influencer profile updated", { userId });
        return updatedProfile;
      } else if (userType === "BRAND") {
        const parsed = brandProfileSchema.parse(data);

        const updatedProfile = await prisma.brandProfile.update({
          where: { userId },
          data: {
            companyName: parsed.companyName,
            logo: parsed.logo,
            website: parsed.website,
            description: parsed.description,
            industry: parsed.industry,
            gstNumber: parsed.gstNumber,
            panNumber: parsed.panNumber,
            cinNumber: parsed.cinNumber,
          },
        });

        logger.info("Brand profile updated", { userId });
        return updatedProfile;
      } else {
        throw new Error("Invalid user type");
      }
    } catch (error) {
      logger.error("Error updating profile", error, { userId, userType });
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
      const where: any = {};

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
          where.AND = where.AND || [];
          where.AND.push({
            OR: [
              { instagramEngagementRate: { gte: params.minEngagementRate } },
              { youtubeEngagementRate: { gte: params.minEngagementRate } },
            ],
          });
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
        const brandWallet = await prisma.wallet.findUnique({
          where: { userId: params.brandUserId },
        });
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
      where.AND = where.AND || [];
      where.AND.push(hasSocialHandleCondition);

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
      throw new Error("Failed to list influencers");
    }
  }
}
