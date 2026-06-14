import prisma from "@/lib/db";
import { CampaignStatus, Prisma, UserType } from "@prisma/client";

import {
  checkVerificationTierForAmount,
  tierErrorResponse,
} from "@/lib/verification-tiers";
import { logger } from "@/lib/logger";
import { generateContractTerms } from "@/lib/contract-engine";
import { calculateTotalAmount } from "@/lib/razorpay";
import { resolveBrandPlatformFee } from "@/lib/platform-fees";
import { checkAndAwardBadges } from "@/lib/gamification-engine";
import { processReferralReward } from "@/lib/referral-engine";
import { checkTrustGate } from "@/lib/trust-engine";

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function assertAccountCanTransact(status: string | null | undefined) {
  if (status === "SUSPENDED" || status === "BANNED") {
    throw new Error("Account suspended. Cannot perform this action.");
  }
}

function calculateProductHandlingFee(productValue: number | null, requiresProduct: boolean) {
  if (!requiresProduct || !productValue) return 0;
  return Math.max(0, Math.round(productValue * 0.02));
}

export class CampaignService {
  static async listCampaigns(
    userId: string | undefined,
    userType: string | undefined,
    params: {
      page: number;
      limit: number;
      status?: string;
      category?: string;
      city?: string;
      minBudget?: number;
      maxBudget?: number;
      sortBy?: string;
      sortOrder?: "asc" | "desc";
      ownerOnly?: boolean;
      search?: string;
    },
  ) {
    try {
      const page = Math.max(1, params.page || 1);
      const limit = Math.min(50, Math.max(1, params.limit || 10));

      const validSortFields = [
        "createdAt",
        "totalBudget",
        "perInfluencerBudget",
        "applicationDeadline",
      ] as const;
      const sortBy = validSortFields.includes(
        (params.sortBy || "") as (typeof validSortFields)[number],
      )
        ? (params.sortBy as (typeof validSortFields)[number])
        : "createdAt";
      const sortOrder = params.sortOrder === "asc" ? "asc" : "desc";

      const allowedStatuses: CampaignStatus[] = [
        "ACTIVE",
        "COMPLETED",
        "PAUSED",
        "DRAFT",
        "PENDING_APPROVAL",
        "CANCELLED",
      ];

      let statusFilter: CampaignStatus | undefined = "ACTIVE";
      if (
        params.status === "ALL" &&
        (userType === "ADMIN" || userType === "BRAND")
      ) {
        statusFilter = undefined;
      } else if (params.status && allowedStatuses.includes(params.status as CampaignStatus)) {
        statusFilter = params.status as CampaignStatus;
      }

      if (!userId) {
        statusFilter = "ACTIVE";
      }

      if (statusFilter !== "ACTIVE" && userType !== "ADMIN" && userType !== "BRAND") {
        statusFilter = "ACTIVE";
      }

      const where: Prisma.CampaignWhereInput = {
        deletedAt: null,
        ...(statusFilter ? { status: statusFilter } : {}),
      };
      const andConditions: Prisma.CampaignWhereInput[] = [];

      if (params.category) {
        const category = params.category.trim();
        if (category) {
          andConditions.push({ targetCategories: { has: category } });
        }
      }

      if (params.city) {
        const city = params.city.trim();
        if (city) {
          andConditions.push({ targetCities: { has: city } });
        }
      }

      if (params.search) {
        const search = params.search.trim();
        if (search) {
          andConditions.push({
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
            ],
          });
        }
      }

      const budgetFilter: Prisma.IntNullableFilter = {};
      if (params.minBudget) {
        budgetFilter.gte = Number(params.minBudget);
      }
      if (params.maxBudget) {
        budgetFilter.lte = Number(params.maxBudget);
      }
      if (Object.keys(budgetFilter).length > 0) {
        where.perInfluencerBudget = budgetFilter;
      }

      if (statusFilter !== "ACTIVE" && userType === "BRAND" && userId) {
        andConditions.push({
          brand: {
            is: { userId },
          },
        });
      }

      if (params.ownerOnly && userType === "BRAND" && userId) {
        andConditions.push({
          brand: {
            is: { userId },
          },
        });
      }

      if (userType === "INFLUENCER" && userId) {
        const profile = await prisma.influencerProfile.findUnique({
          where: { userId },
          select: {
            instagramHandle: true,
            youtubeHandle: true,
            instagramFollowers: true,
            youtubeSubscribers: true,
            categories: true,
            minRate: true,
          },
        });

        if (profile) {
          const hasIg = Boolean(profile.instagramHandle);
          const hasYt = Boolean(profile.youtubeHandle);

          if (!hasIg || !hasYt) {
            const platforms: string[] = [];
            if (hasIg) platforms.push("INSTAGRAM");
            if (hasYt) platforms.push("YOUTUBE");

            if (platforms.length === 0) {
              andConditions.push({ id: { in: ["no_connected_platform"] } });
            } else {
              const matches = await prisma.$queryRaw<Array<{ id: string }>>`
                SELECT id FROM "Campaign"
                WHERE status = ${statusFilter}::"CampaignStatus"
                  AND "deletedAt" IS NULL
                  AND (${Prisma.join(
                    platforms.map((p) => Prisma.sql`deliverables::text ILIKE ${`%${p}%`}`),
                    " OR "
                  )})
              `;

              andConditions.push({
                id: {
                  in:
                    matches.length > 0
                      ? matches.map((item: { id: string }) => item.id)
                      : ["no_matching_platform_campaign"],
                },
              });
            }
          }

          const igFollowers = profile.instagramFollowers || 0;
          const ytSubs = profile.youtubeSubscribers || 0;
          const maxRelevantFollowers = Math.max(igFollowers, ytSubs);

          andConditions.push({ minFollowers: { lte: maxRelevantFollowers } });
          andConditions.push({
            OR: [
              { maxFollowers: null },
              { maxFollowers: 0 },
              { maxFollowers: { gte: maxRelevantFollowers } },
            ],
          });

          if (!params.category && profile.categories) {
            const infCategories = profile.categories
              .split(",")
              .map((item: string) => item.trim())
              .filter(Boolean);

            if (infCategories.length > 0) {
              andConditions.push({
                OR: infCategories.map((category: string) => ({
                  targetCategories: { has: category },
                })),
              });
            }
          }

          if (!params.minBudget && profile.minRate) {
            andConditions.push({
              OR: [
                { perInfluencerBudget: null },
                { perInfluencerBudget: 0 },
                { perInfluencerBudget: { gte: profile.minRate } },
              ],
            });
          }
        }

        andConditions.push({ isDirectInvite: false });
      }

      if (andConditions.length > 0) {
        where.AND = andConditions;
      }

      logger.info("Listing campaigns", {
        ...(userId ? { userId } : {}),
        page,
        limit,
        filters: where,
      });

      const [campaigns, total] = await Promise.all([
        prisma.campaign.findMany({
          where,
          include: {
            brand: {
              select: {
                id: true,
                userId: true,
                companyName: true,
                logo: true,
                averageRating: true,
                isGstVerified: true,
                totalCampaigns: true,
              },
            },
            _count: {
              select: {
                applications: true,
                deals: true,
              },
            },
          },
          orderBy: { [sortBy]: sortOrder },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.campaign.count({ where }),
      ]);

      return {
        campaigns,
        total,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      logger.error("Error listing campaigns", error, {
        ...(userId ? { userId } : {}),
        params,
      });
      throw new Error("Failed to list campaigns");
    }
  }

  static async createCampaign(userId: string, userType: UserType, data: any) {
    try {
      if (userType !== "BRAND") {
        throw new Error("Only brands can create campaigns");
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new Error("User not found");
      }
      assertAccountCanTransact(user.status);

      const totalBudgetPaise = Number(data.totalBudget);
      const perInfluencerBudgetPaise =
        data.perInfluencerBudget === null || data.perInfluencerBudget === undefined
          ? null
          : Number(data.perInfluencerBudget);

      if (!Number.isInteger(totalBudgetPaise) || totalBudgetPaise <= 0) {
        throw new Error("totalBudget must be a positive integer in paise");
      }

      if (
        perInfluencerBudgetPaise !== null &&
        (!Number.isInteger(perInfluencerBudgetPaise) || perInfluencerBudgetPaise <= 0)
      ) {
        throw new Error("perInfluencerBudget must be a positive integer in paise");
      }

      if (
        perInfluencerBudgetPaise !== null &&
        perInfluencerBudgetPaise > totalBudgetPaise
      ) {
        throw new Error("perInfluencerBudget cannot exceed totalBudget");
      }

      const title = String(data.title || "").trim();
      const description = String(data.description || "").trim();
      const requirements = String(data.requirements || "").trim();
      const guidelines = data.guidelines ? String(data.guidelines).trim() : null;

      if (!title || !description || !requirements) {
        throw new Error("Missing required fields: title, description, requirements");
      }

      const contentDeadline = new Date(data.contentDeadline);
      const postingDeadline = new Date(data.postingDeadline);
      if (Number.isNaN(contentDeadline.getTime()) || Number.isNaN(postingDeadline.getTime())) {
        throw new Error("Invalid campaign deadlines");
      }
      if (postingDeadline < contentDeadline) {
        throw new Error("Posting deadline must be after content deadline");
      }

      const now = new Date();
      const applicationDeadline = data.applicationDeadline
        ? new Date(data.applicationDeadline)
        : null;

      if (applicationDeadline && Number.isNaN(applicationDeadline.getTime())) {
        throw new Error("Invalid application deadline");
      }
      if (applicationDeadline && applicationDeadline < now) {
        throw new Error("Application deadline cannot be in the past");
      }
      if (applicationDeadline && applicationDeadline > contentDeadline) {
        throw new Error("Application deadline must be before content deadline");
      }

      const targetCategories = normalizeStringArray(data.targetCategories);
      const targetCities = normalizeStringArray(data.targetCities);
      const targetLanguages = normalizeStringArray(data.targetLanguages);

      if (targetCategories.length === 0) {
        throw new Error("At least one target category is required");
      }

      if (!Array.isArray(data.deliverables) || data.deliverables.length === 0) {
        throw new Error("At least one deliverable is required");
      }

      const normalizedDeliverables = data.deliverables
        .map((item: any) => ({
          type: String(item?.type || "").trim(),
          count: Math.max(1, Number(item?.count || 1)),
          ...(item?.specs ? { specs: String(item.specs).trim() } : {}),
        }))
        .filter((item: { type: string }) => Boolean(item.type));

      if (normalizedDeliverables.length === 0) {
        throw new Error("Deliverables are invalid");
      }

      const minFollowers = Math.max(0, Number(data.minFollowers || 0));
      const maxFollowers = Number(data.maxFollowers || 0);

      if (maxFollowers > 0 && maxFollowers < minFollowers) {
        throw new Error("maxFollowers must be greater than or equal to minFollowers");
      }

      const minEngagementRate =
        data.minEngagementRate === null || data.minEngagementRate === undefined
          ? null
          : Math.max(0, Number(data.minEngagementRate));

      const requiresProduct = Boolean(data.requiresProduct);
      const productValuePaise =
        data.productValue === null || data.productValue === undefined
          ? null
          : Math.max(0, Number(data.productValue));
      if (requiresProduct) {
        if (!data.productName || !String(data.productName).trim()) {
          throw new Error("Product name is required when product shipping is enabled");
        }
        if (!productValuePaise || productValuePaise <= 0) {
          throw new Error("Product value is required when product shipping is enabled");
        }
      }
      const productName = data.productName ? String(data.productName).trim() : null;
      const productDescription = data.productDescription
        ? String(data.productDescription).trim()
        : null;
      const productHandlingFee = calculateProductHandlingFee(
        productValuePaise,
        requiresProduct,
      );

      const tierCheck = await checkVerificationTierForAmount(
        userId,
        "BRAND",
        totalBudgetPaise,
      );
      if (!tierCheck.allowed) {
        const err: any = new Error(tierCheck.reason || "Verification required");
        err.tierError = tierErrorResponse(tierCheck);
        throw err;
      }

      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const profile = await tx.brandProfile.findUnique({ where: { userId } });
        if (!profile) {
          throw new Error("Profile not found. Please complete your profile first.");
        }

        await tx.brandProfile.update({
          where: { id: profile.id },
          data: { companyName: profile.companyName },
        });

        const isDraft = data.status === "DRAFT";
        const wallet = await tx.wallet.findUnique({ where: { userId } });

        if (!isDraft) {
          if (!wallet || wallet.balance < totalBudgetPaise) {
            throw new Error("Insufficient wallet balance for this campaign budget");
          }

          const updateResult = await tx.wallet.updateMany({
            where: { id: wallet.id, balance: { gte: totalBudgetPaise } },
            data: {
              balance: { decrement: totalBudgetPaise },
              pendingBalance: { increment: totalBudgetPaise },
            },
          });

          if (updateResult.count === 0) {
            throw new Error(
              "Insufficient wallet balance or concurrent transaction detected",
            );
          }
        }

        const newCampaign = await tx.campaign.create({
          data: {
            brandId: profile.id,
            title,
            description,
            requirements,
            guidelines,
            totalBudget: totalBudgetPaise,
            perInfluencerBudget: perInfluencerBudgetPaise,
            maxInfluencers: data.maxInfluencers ? Number(data.maxInfluencers) : null,
            targetCategories,
            targetCities,
            targetLanguages,
            targetGender: data.targetGender || null,
            targetAgeMin:
              data.targetAgeMin === null || data.targetAgeMin === undefined
                ? null
                : Number(data.targetAgeMin),
            targetAgeMax:
              data.targetAgeMax === null || data.targetAgeMax === undefined
                ? null
                : Number(data.targetAgeMax),
            minFollowers,
            maxFollowers: maxFollowers > 0 ? maxFollowers : null,
            minEngagementRate,
            deliverables: normalizedDeliverables,
            applicationDeadline,
            contentDeadline,
            postingDeadline,
            status: isDraft ? "DRAFT" : "ACTIVE",
            requiresProduct,
            productName,
            productValue: productValuePaise,
            productDescription,
            isDirectInvite: Boolean(data.invitedInfluencerId),
          },
        });

        if (data.invitedInfluencerId) {
          const invitedInfluencer = await tx.influencerProfile.findUnique({
            where: { id: data.invitedInfluencerId },
            select: {
              id: true,
              userId: true,
              user: { select: { status: true } },
            },
          });

          if (invitedInfluencer) {
            assertAccountCanTransact(invitedInfluencer.user.status);
            const existingInviteDeal = await tx.deal.findFirst({
              where: {
                campaignId: newCampaign.id,
                influencerId: invitedInfluencer.id,
                deletedAt: null,
                status: { not: "CANCELLED" },
              },
              select: { id: true },
            });
            if (existingInviteDeal) {
              throw new Error("A deal already exists for this influencer");
            }

            const dealAmount = perInfluencerBudgetPaise || totalBudgetPaise;
            const inviteTrustGate = await checkTrustGate(
              invitedInfluencer.userId,
              dealAmount,
            );
            if (!inviteTrustGate.allowed) {
              throw new Error(
                inviteTrustGate.reason || "Influencer trust score too low for this invite",
              );
            }

            const brandFee = await resolveBrandPlatformFee(userId);
            const paymentAmounts = calculateTotalAmount(
              dealAmount,
              brandFee.effectivePlatformFee,
              productHandlingFee,
            );

            const draftContractTerms = generateContractTerms(
              "pending",
              {
                totalBudget: totalBudgetPaise,
                perInfluencerBudget: dealAmount,
                deliverables: normalizedDeliverables,
                requirements,
                contentDeadline,
                postingDeadline,
                requiresProduct,
                productName,
                productValue: productValuePaise,
                productDescription,
              },
              {
                rate: dealAmount,
                platformFee: paymentAmounts.platformFee,
                gatewayFee: paymentAmounts.gatewayFee,
                totalAmount: paymentAmounts.totalAmount,
                platformFeePercent: paymentAmounts.platformFeePercent,
                influencerPayout: paymentAmounts.influencerReceives,
                productHandlingFee,
              },
            );

            const reserveResult = await tx.wallet.updateMany({
              where: { userId, pendingBalance: { gte: dealAmount } },
              data: { pendingBalance: { decrement: dealAmount } },
            });

            if (reserveResult.count === 0) {
              throw new Error("Insufficient held campaign funds.");
            }

            const createdDeal = await tx.deal.create({
              data: {
                campaignId: newCampaign.id,
                influencerId: invitedInfluencer.id,
                brandId: profile.id,
                amount: dealAmount,
                platformFee: paymentAmounts.platformFee,
                gatewayFee: paymentAmounts.gatewayFee,
                totalAmount: paymentAmounts.totalAmount,
                influencerPayout: paymentAmounts.influencerReceives,
                reservedFromWallet: true,
                requiresProduct,
                productName,
                productValue: productValuePaise,
                productHandlingFee,
                productFulfillmentStatus: requiresProduct
                  ? "ADDRESS_PENDING"
                  : "NOT_REQUIRED",
                submissionDeadline: contentDeadline,
                postingDeadline,
                contractTerms:
                  draftContractTerms as unknown as Prisma.InputJsonValue,
                status: "PENDING_SIGNATURE",
              },
            });

            await tx.deal.update({
              where: { id: createdDeal.id },
              data: {
                contractTerms: {
                  ...draftContractTerms,
                  dealId: createdDeal.id,
                } as unknown as Prisma.InputJsonValue,
              },
            });

            await tx.notification.create({
              data: {
                userId: invitedInfluencer.userId,
                type: "deal_update",
                title: `You have an invite from ${profile.companyName}`,
                message: `You have been invited for campaign: ${title}. Please review the contract.`,
                data: { campaignId: newCampaign.id, dealId: createdDeal.id },
              },
            });
          }
        }

        const profileUpdateData: Prisma.BrandProfileUpdateInput = {
          totalCampaigns: { increment: 1 },
          ...(isDraft ? {} : { activeCampaigns: { increment: 1 } }),
        };

        await tx.brandProfile.update({
          where: { id: profile.id },
          data: profileUpdateData,
        });

        await checkAndAwardBadges(userId, "CAMPAIGN_CREATED", tx);

        if (!isDraft && wallet) {
          await tx.transaction.create({
            data: {
              walletId: wallet.id,
              type: "DEBIT",
              amount: totalBudgetPaise,
              status: "COMPLETED",
              description: `Funds held for campaign creation: ${title}`,
            },
          });

          await processReferralReward(userId, totalBudgetPaise, tx);
        }

        await tx.activityLog.create({
          data: {
            userId,
            action: "CREATE_CAMPAIGN",
            entityType: "Campaign",
            entityId: newCampaign.id,
          },
        });

        return newCampaign;
      });

      logger.info("Campaign created successfully", {
        userId,
        campaignId: result.id,
      });
      return result;
    } catch (error) {
      logger.error("Error creating campaign", error, { userId });
      throw error;
    }
  }

  static async getCampaignById(
    campaignId: string,
    viewerUserId?: string,
    viewerUserType?: string,
  ) {
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        deletedAt: null,
      },
      include: {
        brand: {
          select: {
            id: true,
            userId: true,
            companyName: true,
            logo: true,
            averageRating: true,
            isGstVerified: true,
            totalCampaigns: true,
          },
        },
        _count: {
          select: {
            applications: true,
            deals: true,
          },
        },
      },
    });

    if (!campaign) {
      return null;
    }

    const isOwner = Boolean(viewerUserId && campaign.brand?.userId === viewerUserId);
    const isAdmin = viewerUserType === "ADMIN";

    if (campaign.status !== "ACTIVE" && !isOwner && !isAdmin) {
      return null;
    }

    if (campaign.isDirectInvite && !isOwner && !isAdmin) {
      if (!viewerUserId || viewerUserType !== "INFLUENCER") {
        return null;
      }

      const influencerProfile = await prisma.influencerProfile.findUnique({
        where: { userId: viewerUserId },
        select: { id: true },
      });

      if (!influencerProfile) {
        return null;
      }

      const invitedDeal = await prisma.deal.findFirst({
        where: {
          campaignId: campaign.id,
          influencerId: influencerProfile.id,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!invitedDeal) {
        return null;
      }
    }

    return campaign;
  }

  static async activateDraftCampaign(userId: string, campaignId: string) {
    try {
      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const campaign = await tx.campaign.findUnique({
          where: { id: campaignId },
          include: { brand: true },
        });

        if (!campaign || campaign.deletedAt || campaign.brand?.userId !== userId) {
          throw new Error("Campaign not found or unauthorized");
        }
        if (campaign.status !== "DRAFT") {
          throw new Error("Campaign is not in DRAFT status");
        }

        const amountPaise = campaign.totalBudget;
        const wallet = await tx.wallet.findUnique({ where: { userId } });

        if (!wallet || wallet.balance < amountPaise) {
          throw new Error("Insufficient wallet balance. Please add funds first.");
        }

        const updateResult = await tx.wallet.updateMany({
          where: { id: wallet.id, balance: { gte: amountPaise } },
          data: {
            balance: { decrement: amountPaise },
            pendingBalance: { increment: amountPaise },
          },
        });

        if (updateResult.count === 0) {
          throw new Error(
            "Insufficient wallet balance or concurrent transaction detected",
          );
        }

        await tx.transaction.create({
          data: {
            walletId: wallet.id,
            type: "DEBIT",
            amount: amountPaise,
            status: "COMPLETED",
            description: `Funds held for campaign activation: ${campaign.title}`,
          },
        });

        if (campaign.brandId) {
          await tx.brandProfile.updateMany({
            where: { id: campaign.brandId },
            data: { activeCampaigns: { increment: 1 } },
          });
        }

        const updatedCampaign = await tx.campaign.update({
          where: { id: campaignId },
          data: { status: "ACTIVE" },
        });

        await tx.activityLog.create({
          data: {
            userId,
            action: "ACTIVATE_CAMPAIGN",
            entityType: "Campaign",
            entityId: campaignId,
          },
        });

        return updatedCampaign;
      });

      logger.info("Campaign activated successfully", { userId, campaignId });
      return result;
    } catch (error) {
      logger.error("Error activating campaign", error, { userId, campaignId });
      throw error;
    }
  }

  static async cancelCampaign(userId: string, campaignId: string) {
    try {
      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const campaign = await tx.campaign.findUnique({
          where: { id: campaignId },
          include: { brand: true },
        });

        if (!campaign || campaign.deletedAt || campaign.brand?.userId !== userId) {
          throw new Error("Campaign not found or unauthorized");
        }

        if (campaign.status === "CANCELLED") {
          throw new Error("Campaign is already cancelled");
        }

        if (campaign.status === "COMPLETED") {
          throw new Error("Completed campaigns cannot be cancelled");
        }

        const openDealCount = await tx.deal.count({
          where: {
            campaignId,
            deletedAt: null,
            status: {
              notIn: ["CANCELLED", "COMPLETED"],
            },
          },
        });

        if (openDealCount > 0) {
          throw new Error("Cannot cancel campaign while active deals exist for this campaign");
        }

        const wallet = await tx.wallet.findUnique({ where: { userId } });
        const shouldRefundHeldBudget = campaign.status !== "DRAFT";

        if (shouldRefundHeldBudget && wallet) {
          const refundableAmount = Math.min(wallet.pendingBalance, campaign.totalBudget);

          if (refundableAmount > 0) {
            await tx.wallet.update({
              where: { id: wallet.id },
              data: {
                pendingBalance: { decrement: refundableAmount },
                balance: { increment: refundableAmount },
              },
            });

            await tx.transaction.create({
              data: {
                walletId: wallet.id,
                type: "CREDIT",
                amount: refundableAmount,
                status: "COMPLETED",
                description: `Refund for cancelled campaign: ${campaign.title}`,
              },
            });
          }
        }

        await tx.application.updateMany({
          where: {
            campaignId,
            status: { in: ["PENDING", "SHORTLISTED"] },
          },
          data: {
            status: "REJECTED",
            rejectionReason: "Campaign cancelled by brand",
          },
        });

        if (campaign.brandId && campaign.status === "ACTIVE") {
          await tx.brandProfile.updateMany({
            where: {
              id: campaign.brandId,
              activeCampaigns: { gt: 0 },
            },
            data: {
              activeCampaigns: { decrement: 1 },
            },
          });
        }

        const updatedCampaign = await tx.campaign.update({
          where: { id: campaignId },
          data: {
            status: "CANCELLED",
            deletedAt: new Date(),
          },
        });

        await tx.activityLog.create({
          data: {
            userId,
            action: "CANCEL_CAMPAIGN",
            entityType: "Campaign",
            entityId: campaignId,
          },
        });

        return updatedCampaign;
      });

      logger.info("Campaign cancelled successfully", { userId, campaignId });
      return result;
    } catch (error) {
      logger.error("Error cancelling campaign", error, { userId, campaignId });
      throw error;
    }
  }
}
