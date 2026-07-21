import prisma from "@/lib/db";
import { CampaignStatus, Prisma, UserType, UserStatus, Campaign, BrandProfile } from "@prisma/client";

import {
  checkVerificationTierForAmount,
  tierErrorResponse,
} from "@/lib/verification-tiers";
import { logger } from "@/lib/logger";
import { generateContractTerms } from "@/lib/contract-engine";
import { calculateTotalAmount } from "@/lib/razorpay";
import { resolveBrandPlatformFee, type PlatformFeeSnapshot } from "@/lib/platform-fees";
import { checkAndAwardBadges } from "@/lib/gamification-engine";
import { checkTrustGate } from "@/lib/trust-engine";
import { assertAccountCanTransact, calculateProductHandlingFee, assertSufficientBalance } from "@/lib/utils";
import { NotificationService } from "@/services/notification.service";
import { createActivityLog } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { isAdmin, isBrand, isInfluencer } from "@/lib/rbac";

// Custom error class for tier verification failures
export class TierError extends AppError {
  tierError: ReturnType<typeof tierErrorResponse>;
  constructor(message: string, tierError: ReturnType<typeof tierErrorResponse>) {
    super(message, 403); // Tier violations are 403 Forbidden
    this.name = "TierError";
    this.tierError = tierError;
  }
}

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

function safeStringCast(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "object") return "";
  if (typeof val === "symbol" || typeof val === "function") return "";
  return String(val as string | number | boolean);
}

function safeStringOrNullCast(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "object") return null;
  if (typeof val === "symbol" || typeof val === "function") return null;
  return String(val as string | number | boolean);
}

function estimateCampaignDealSlots(
  totalBudget: number,
  perInfluencerBudget: number | null,
  maxInfluencers: number | null | undefined,
) {
  // Priority 1: explicit influencer cap — use as-is.
  if (maxInfluencers && maxInfluencers > 0) return maxInfluencers;

  // Priority 2: per-influencer budget — derive a safe slot count.
  if (perInfluencerBudget && perInfluencerBudget > 0) {
    return Math.max(1, Math.floor(totalBudget / perInfluencerBudget));
  }

  // Neither constraint set — refuse to silently treat this as a 1-slot campaign.
  // Campaigns without either maxInfluencers or perInfluencerBudget are ambiguous:
  // they could be meant for 1 or 1000 influencers, and assuming 1 would silently
  // reject every applicant after the first. Throw so the caller surfaces an error.
  throw new AppError(
    "Campaign configuration error: at least one of 'maxInfluencers' or 'perInfluencerBudget' must be set so the platform can determine how many deals to allow.",
    400,
  );
}

interface DirectInviteParams {
  tx: Prisma.TransactionClient;
  newCampaign: Campaign;
  data: Record<string, unknown>;
  profile: BrandProfile;
  totalBudgetPaise: number;
  perInfluencerBudgetPaise: number | null;
  normalizedDeliverables: Prisma.InputJsonValue;
  requirements: string;
  contentDeadline: Date;
  postingDeadline: Date;
  requiresProduct: boolean;
  productName: string | null;
  productValuePaise: number | null;
  productHandlingFee: number;
}

export interface ListCampaignsParams {
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
}

export class CampaignService {
  private static resolveStatusFilter(
    params: ListCampaignsParams,
    userId: string | undefined,
    userType: string | undefined,
  ): CampaignStatus | undefined {
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
      (isAdmin(userType) || isBrand(userType))
    ) {
      statusFilter = undefined;
    } else if (params.status && allowedStatuses.includes(params.status as CampaignStatus)) {
      statusFilter = params.status as CampaignStatus;
    }

    if (!userId) {
      statusFilter = "ACTIVE";
    }

    if (statusFilter !== "ACTIVE" && !isAdmin(userType) && !isBrand(userType)) {
      statusFilter = "ACTIVE";
    }

    return statusFilter;
  }

  private static buildTextAndCategoryFilters(params: ListCampaignsParams): Prisma.CampaignWhereInput[] {
    const conditions: Prisma.CampaignWhereInput[] = [];

    if (params.category) {
      const category = params.category.trim();
      if (category) {
        conditions.push({ targetCategories: { has: category } });
      }
    }

    if (params.city) {
      const city = params.city.trim();
      if (city) {
        conditions.push({ targetCities: { has: city } });
      }
    }

    if (params.search) {
      const search = params.search.trim();
      if (search) {
        conditions.push({
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        });
      }
    }

    return conditions;
  }

  private static buildBudgetFilter(params: ListCampaignsParams): Prisma.IntNullableFilter | null {
    const budgetFilter: Prisma.IntNullableFilter = {};
    if (params.minBudget) {
      budgetFilter.gte = Number(params.minBudget);
    }
    if (params.maxBudget) {
      budgetFilter.lte = Number(params.maxBudget);
    }
    return Object.keys(budgetFilter).length > 0 ? budgetFilter : null;
  }

  private static buildOwnershipFilter(
    params: ListCampaignsParams,
    userId: string,
    userType: string | undefined,
    statusFilter: CampaignStatus | undefined,
  ): Prisma.CampaignWhereInput[] {
    const conditions: Prisma.CampaignWhereInput[] = [];

    if (statusFilter !== "ACTIVE" && isBrand(userType)) {
      conditions.push({
        brand: {
          is: { userId },
        },
      });
    }

    if (params.ownerOnly && isBrand(userType)) {
      conditions.push({
        brand: {
          is: { userId },
        },
      });
    }

    return conditions;
  }

  private static async getPlatformCompatibilityCondition(
    hasIg: boolean,
    hasYt: boolean,
    statusFilter: CampaignStatus | undefined,
  ): Promise<Prisma.CampaignWhereInput> {
    const platforms: string[] = [];
    if (hasIg) platforms.push("INSTAGRAM");
    if (hasYt) platforms.push("YOUTUBE");

    if (platforms.length === 0) {
      return { id: { in: ["no_connected_platform"] } };
    }

    const platformConditions = platforms.map((p) => ({
      deliverables: {
        path: [],
        string_contains: p,
      },
    }));

    const candidateCampaigns = await prisma.campaign.findMany({
      where: {
        ...(statusFilter ? { status: statusFilter } : {}),
        deletedAt: null,
        OR: platformConditions,
      },
      select: { id: true },
      take: 1000,
    });

    return {
      id: {
        in:
          candidateCampaigns.length > 0
            ? candidateCampaigns.map((item: { id: string }) => item.id)
            : ["no_matching_platform_campaign"],
      },
    };
  }

  private static getBudgetCondition(
    minInstagramRate: number | null,
    minYoutubeRate: number | null,
    minRate: number | null,
  ): Prisma.CampaignWhereInput | null {
    const rates = [
      minInstagramRate,
      minYoutubeRate,
      minRate
    ].filter((r): r is number => r !== null && r !== undefined && r > 0);
    const activeMinRate = rates.length > 0 ? Math.min(...rates) : 0;
    if (activeMinRate > 0) {
      return {
        OR: [
          { perInfluencerBudget: null },
          { perInfluencerBudget: 0 },
          { perInfluencerBudget: { gte: activeMinRate } },
        ],
      };
    }
    return null;
  }

  private static async buildInfluencerEligibilityFilter(
    userId: string,
    params: ListCampaignsParams,
    statusFilter: CampaignStatus | undefined,
  ): Promise<Prisma.CampaignWhereInput[]> {
    const conditions: Prisma.CampaignWhereInput[] = [];

    const profile = await prisma.influencerProfile.findUnique({
      where: { userId },
      select: {
        instagramHandle: true,
        youtubeHandle: true,
        instagramFollowers: true,
        youtubeSubscribers: true,
        categories: true,
        minRate: true,
        minInstagramRate: true,
        minYoutubeRate: true,
      },
    });

    if (profile) {
      const hasIg = Boolean(profile.instagramHandle);
      const hasYt = Boolean(profile.youtubeHandle);

      if (!hasIg || !hasYt) {
        const platCond = await this.getPlatformCompatibilityCondition(hasIg, hasYt, statusFilter);
        conditions.push(platCond);
      }

      const igFollowers = profile.instagramFollowers || 0;
      const ytSubs = profile.youtubeSubscribers || 0;
      const maxRelevantFollowers = Math.max(igFollowers, ytSubs);

      conditions.push(
        { minFollowers: { lte: maxRelevantFollowers } },
        {
          OR: [
            { maxFollowers: null },
            { maxFollowers: 0 },
            { maxFollowers: { gte: maxRelevantFollowers } },
          ],
        }
      );

      if (!params.category && profile.categories) {
        const infCategories = profile.categories
          .split(",")
          .map((item: string) => item.trim())
          .filter(Boolean);

        if (infCategories.length > 0) {
          conditions.push({
            OR: infCategories.map((category: string) => ({
              targetCategories: { has: category },
            })),
          });
        }
      }

      if (!params.minBudget) {
        const budgetCond = this.getBudgetCondition(
          profile.minInstagramRate,
          profile.minYoutubeRate,
          profile.minRate
        );
        if (budgetCond) {
          conditions.push(budgetCond);
        }
      }
    }

    conditions.push({ isDirectInvite: false });
    return conditions;
  }

  static async listCampaigns(
    userId: string | undefined,
    userType: string | undefined,
    params: ListCampaignsParams,
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

      const statusFilter = CampaignService.resolveStatusFilter(params, userId, userType);

      const where: Prisma.CampaignWhereInput = {
        deletedAt: null,
        ...(statusFilter ? { status: statusFilter } : {}),
      };

      const andConditions: Prisma.CampaignWhereInput[] = [
        ...CampaignService.buildTextAndCategoryFilters(params),
      ];

      const budgetFilter = CampaignService.buildBudgetFilter(params);
      if (budgetFilter) {
        where.perInfluencerBudget = budgetFilter;
      }

      if (userId) {
        andConditions.push(...CampaignService.buildOwnershipFilter(params, userId, userType, statusFilter));

        if (isInfluencer(userType)) {
          andConditions.push(
            ...(await CampaignService.buildInfluencerEligibilityFilter(userId, params, statusFilter)),
          );
        }
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
            applications: {
              where: { status: "SELECTED" },
              select: { id: true },
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
      throw AppError.badRequest("Failed to list campaigns");
    }
  }

  private static validateTotalBudget(
    requiresProduct: boolean,
    totalBudgetPaise: number,
    productValuePaise: number | null,
    minFollowers: number
  ) {
    if (!Number.isInteger(totalBudgetPaise)) {
      throw AppError.badRequest("totalBudget must be an integer in paise");
    }

    if (requiresProduct) {
      if (totalBudgetPaise < 0) {
        throw AppError.badRequest("totalBudget cannot be negative");
      }
      if (totalBudgetPaise === 0) {
        if (!productValuePaise || productValuePaise < 100000) {
          throw AppError.badRequest("A product-only campaign must specify a product value of at least ₹1,000");
        }
        if (minFollowers > 10000) {
          throw AppError.badRequest("A product-only campaign must target influencers with up to 10,000 followers");
        }
      }
    } else if (totalBudgetPaise <= 0) {
      throw AppError.badRequest("totalBudget must be a positive integer in paise");
    }
  }

  private static validatePerInfluencerBudget(
    requiresProduct: boolean,
    totalBudgetPaise: number,
    perInfluencerBudgetPaise: number | null
  ) {
    if (perInfluencerBudgetPaise !== null) {
      if (!Number.isInteger(perInfluencerBudgetPaise)) {
        throw AppError.badRequest("perInfluencerBudget must be an integer in paise");
      }
      if (requiresProduct) {
        if (perInfluencerBudgetPaise < 0) {
          throw AppError.badRequest("perInfluencerBudget cannot be negative");
        }
      } else if (perInfluencerBudgetPaise <= 0) {
        throw AppError.badRequest("perInfluencerBudget must be a positive integer in paise");
      }
      if (perInfluencerBudgetPaise > totalBudgetPaise) {
        throw AppError.badRequest("perInfluencerBudget cannot exceed totalBudget");
      }
    }
  }

  private static validateCampaignInputAndBudgets(
    data: Record<string, unknown>,
    requiresProduct: boolean,
    totalBudgetPaise: number,
    perInfluencerBudgetPaise: number | null,
    productValuePaise: number | null,
    minFollowers: number
  ) {
    this.validateTotalBudget(requiresProduct, totalBudgetPaise, productValuePaise, minFollowers);
    this.validatePerInfluencerBudget(requiresProduct, totalBudgetPaise, perInfluencerBudgetPaise);
  }

  private static async checkBrandVerificationTiers(
    userId: string,
    totalBudgetPaise: number,
    productValuePaise: number | null,
    campaignBrandFee: PlatformFeeSnapshot,
    fundedDealSlots: number,
    productHandlingFee: number
  ) {
    const campaignValue = totalBudgetPaise > 0
      ? totalBudgetPaise
      : (productValuePaise || 0) * fundedDealSlots;

    const tierCheck = await checkVerificationTierForAmount(userId, "BRAND", campaignValue);
    if (!tierCheck.allowed) {
      throw new TierError(tierCheck.reason || "Verification required", tierErrorResponse(tierCheck));
    }

    const campaignFundingAmounts = calculateTotalAmount(
      totalBudgetPaise,
      campaignBrandFee.effectivePlatformFee,
      productHandlingFee * fundedDealSlots
    );
    const fundingTierCheck = await checkVerificationTierForAmount(
      userId,
      "BRAND",
      campaignFundingAmounts.totalAmount
    );
    if (!fundingTierCheck.allowed) {
      throw new TierError(fundingTierCheck.reason || "Verification required", tierErrorResponse(fundingTierCheck));
    }

    return campaignFundingAmounts;
  }



  private static async handleDirectInviteInCampaign(params: DirectInviteParams) {
    const {
      tx,
      newCampaign,
      data,
      profile,
      totalBudgetPaise,
      perInfluencerBudgetPaise,
      normalizedDeliverables,
      requirements,
      contentDeadline,
      postingDeadline,
      requiresProduct,
      productName,
      productValuePaise,
      productHandlingFee,
    } = params;
    if (!data.invitedInfluencerId) return;

    const invitedInfluencer = (await tx.influencerProfile.findUnique({
      where: { id: data.invitedInfluencerId as string },
      select: {
        id: true,
        userId: true,
        followerAuthenticityScore: true,
        user: { select: { status: true } },
      },
    })) as { id: string; userId: string; followerAuthenticityScore: number; user: { status: UserStatus } } | null;

    if (!invitedInfluencer) return;

    // Enforce authenticity score check on direct invites
    if (invitedInfluencer.followerAuthenticityScore < 40) {
      throw AppError.badRequest(
        `This influencer cannot be invited because their follower authenticity score (${invitedInfluencer.followerAuthenticityScore}/100) is below the minimum required threshold of 40.`
      );
    }

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
      throw AppError.badRequest("A deal already exists for this influencer");
    }

    const dealAmount = perInfluencerBudgetPaise || totalBudgetPaise;
    const inviteTrustGate = await checkTrustGate(invitedInfluencer.userId, dealAmount);
    if (!inviteTrustGate.allowed) {
      throw AppError.badRequest(inviteTrustGate.reason || "Influencer trust score too low for this invite");
    }

    const brandFee = await resolveBrandPlatformFee(profile.userId);
    const paymentAmounts = calculateTotalAmount(dealAmount, brandFee.effectivePlatformFee, productHandlingFee);

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
        productDescription: typeof data.productDescription === "string" || typeof data.productDescription === "number" ? String(data.productDescription).trim() : null,
      },
      {
        rate: dealAmount,
        platformFee: paymentAmounts.platformFee,
        gatewayFee: paymentAmounts.gatewayFee,
        totalAmount: paymentAmounts.totalAmount,
        platformFeePercent: paymentAmounts.platformFeePercent,
        influencerPayout: paymentAmounts.influencerReceives,
        productHandlingFee,
      }
    );

    const reserveResult = await tx.wallet.updateMany({
      where: { userId: profile.userId, pendingBalance: { gte: paymentAmounts.totalAmount } },
      data: { pendingBalance: { decrement: paymentAmounts.totalAmount } },
    });

    if (reserveResult.count === 0) {
      throw AppError.badRequest("Insufficient held campaign funds.");
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
        productFulfillmentStatus: requiresProduct ? "ADDRESS_PENDING" : "NOT_REQUIRED",
        submissionDeadline: contentDeadline,
        postingDeadline,
        signDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
        contractTerms: draftContractTerms as unknown as Prisma.InputJsonValue,
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

    await tx.campaign.update({
      where: { id: newCampaign.id },
      data: {
        selectedInfluencers: { increment: 1 },
        reservedAmount: { increment: dealAmount },
        reservedTotalAmount: { increment: paymentAmounts.totalAmount },
      },
    });

    const brandWallet = await tx.wallet.findUnique({
      where: { userId: profile.userId },
      select: { id: true },
    });
    if (!brandWallet) {
      throw AppError.notFound("Brand wallet not found.");
    }

    await tx.transaction.create({
      data: {
        walletId: brandWallet.id,
        dealId: createdDeal.id,
        type: "DEBIT",
        amount: paymentAmounts.totalAmount,
        status: "COMPLETED",
        description: `Funds reserved for direct invite deal: ${createdDeal.id}`,
        metadata: {
          balanceImpact: false,
          source: "wallet_campaign_reservation_allocation",
          dealAmount,
          platformFee: paymentAmounts.platformFee,
          gatewayFee: paymentAmounts.gatewayFee,
        },
      },
    });

    await NotificationService.createNotification(
      {
        userId: invitedInfluencer.userId,
        type: "deal_update",
        title: `You have an invite from ${profile.companyName}`,
        message: `You have been invited for campaign: ${newCampaign.title}. Please review the contract.`,
        data: { campaignId: newCampaign.id, dealId: createdDeal.id },
      },
      tx
    );
  }

  private static validateDeadlines(
    contentDeadline: Date,
    postingDeadline: Date,
    applicationDeadline: Date | null,
    now: Date
  ) {
    if (Number.isNaN(contentDeadline.getTime()) || Number.isNaN(postingDeadline.getTime())) {
      throw AppError.badRequest("Invalid campaign deadlines");
    }
    if (postingDeadline < contentDeadline) {
      throw AppError.badRequest("Posting deadline must be after content deadline");
    }
    if (applicationDeadline && Number.isNaN(applicationDeadline.getTime())) {
      throw AppError.badRequest("Invalid application deadline");
    }
    if (applicationDeadline && applicationDeadline < now) {
      throw AppError.badRequest("Application deadline cannot be in the past");
    }
    if (applicationDeadline && applicationDeadline > contentDeadline) {
      throw AppError.badRequest("Application deadline must be before content deadline");
    }
  }

  private static parseDeliverables(deliverables: unknown) {
    if (!Array.isArray(deliverables) || deliverables.length === 0) {
      throw AppError.badRequest("At least one deliverable is required");
    }
    const normalized = deliverables
      .map((item: { type?: unknown; count?: unknown; rate?: unknown; specs?: unknown }) => {
        const rawType = item?.type;
        const typeStr = typeof rawType === "string" ? rawType.trim() : "";
        const specsStr = typeof item?.specs === "string" ? item.specs.trim() : undefined;
        return {
          type: typeStr,
          count: Math.max(1, Number(item?.count || 1)),
          rate: item?.rate !== undefined && item?.rate !== null ? Math.max(0, Number(item.rate)) : undefined,
          ...(specsStr ? { specs: specsStr } : {}),
        };
      })
      .filter((item: { type: string }) => Boolean(item.type));

    if (normalized.length === 0) {
      throw AppError.badRequest("Deliverables are invalid");
    }
    return normalized;
  }

  static parseAndValidateCampaignDetails(data: Record<string, unknown>) {
    const requiresProduct = Boolean(data.requiresProduct);
    const productValuePaise =
      data.productValue === null || data.productValue === undefined
        ? null
        : Math.max(0, Number(data.productValue));

    const totalBudgetPaise = Number(data.totalBudget);
    const perInfluencerBudgetPaise =
      data.perInfluencerBudget === null || data.perInfluencerBudget === undefined
        ? null
        : Number(data.perInfluencerBudget);
    const minFollowers = Math.max(0, Number(data.minFollowers || 0));

    this.validateCampaignInputAndBudgets(
      data,
      requiresProduct,
      totalBudgetPaise,
      perInfluencerBudgetPaise,
      productValuePaise,
      minFollowers
    );

    const title = safeStringCast(data.title).trim();
    const description = safeStringCast(data.description).trim();
    const requirements = safeStringCast(data.requirements).trim();
    const guidelines = safeStringOrNullCast(data.guidelines)?.trim() ?? null;

    if (!title || !description || !requirements) {
      throw AppError.badRequest("Missing required fields: title, description, requirements");
    }

    const contentDeadline = new Date(data.contentDeadline as string);
    const postingDeadline = new Date(data.postingDeadline as string);
    const applicationDeadline = data.applicationDeadline
      ? new Date(data.applicationDeadline as string)
      : null;

    this.validateDeadlines(contentDeadline, postingDeadline, applicationDeadline, new Date());

    const targetCategories = normalizeStringArray(data.targetCategories);
    const targetCities = normalizeStringArray(data.targetCities);
    const targetLanguages = normalizeStringArray(data.targetLanguages);

    if (targetCategories.length === 0) {
      throw AppError.badRequest("At least one target category is required");
    }

    const normalizedDeliverables = this.parseDeliverables(data.deliverables);

    const maxFollowers = Number(data.maxFollowers || 0);

    if (maxFollowers > 0 && maxFollowers < minFollowers) {
      throw AppError.badRequest("maxFollowers must be greater than or equal to minFollowers");
    }

    const minEngagementRate =
      data.minEngagementRate === null || data.minEngagementRate === undefined
        ? null
        : Math.max(0, Number(data.minEngagementRate));

    if (requiresProduct) {
      const pName = data.productName;
      if (typeof pName !== "string" || !pName.trim()) {
        throw AppError.badRequest("Product name is required when product shipping is enabled");
      }
      if (!productValuePaise || productValuePaise <= 0) {
        throw AppError.badRequest("Product value is required when product shipping is enabled");
      }
    }

    const productName = data.productName ? safeStringCast(data.productName).trim() : null;
    const productDescription = data.productDescription
      ? safeStringCast(data.productDescription).trim()
      : null;

    return {
      requiresProduct,
      productValuePaise,
      totalBudgetPaise,
      perInfluencerBudgetPaise,
      minFollowers,
      title,
      description,
      requirements,
      guidelines,
      contentDeadline,
      postingDeadline,
      applicationDeadline,
      targetCategories,
      targetCities,
      targetLanguages,
      normalizedDeliverables,
      maxFollowers,
      minEngagementRate,
      productName,
      productDescription,
    };
  }

  static async createCampaign(userId: string, userType: UserType, data: Record<string, unknown>) {
    try {
      if (!isBrand(userType)) {
        throw AppError.badRequest("Only brands can create campaigns");
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw AppError.notFound("User not found");
      }
      assertAccountCanTransact(user.status);

      const parsed = this.parseAndValidateCampaignDetails(data);

      const campaignBrandFee = await resolveBrandPlatformFee(userId);
      const isProductOnly = parsed.requiresProduct && parsed.totalBudgetPaise === 0;
      const productHandlingFee = calculateProductHandlingFee(
        parsed.productValuePaise,
        parsed.requiresProduct,
        isProductOnly,
        campaignBrandFee.effectivePlatformFee,
      );

      const fundedDealSlots = estimateCampaignDealSlots(
        parsed.totalBudgetPaise,
        parsed.perInfluencerBudgetPaise,
        data.maxInfluencers ? Number(data.maxInfluencers) : null,
      );

      const campaignFundingAmounts = await this.checkBrandVerificationTiers(
        userId,
        parsed.totalBudgetPaise,
        parsed.productValuePaise,
        campaignBrandFee,
        fundedDealSlots,
        productHandlingFee
      );

      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const profile = await tx.brandProfile.findUnique({ where: { userId } });
        if (!profile) {
          throw AppError.notFound("Profile not found. Please complete your profile first.");
        }

        const isDraft = data.status === "DRAFT";
        const wallet = await tx.wallet.findUnique({ where: { userId } });

        if (!isDraft) {
          assertSufficientBalance(wallet, campaignFundingAmounts.totalAmount);

          const updateResult = await tx.wallet.updateMany({
            where: { id: wallet!.id, balance: { gte: campaignFundingAmounts.totalAmount } },
            data: {
              balance: { decrement: campaignFundingAmounts.totalAmount },
              pendingBalance: { increment: campaignFundingAmounts.totalAmount },
            },
          });

          if (updateResult.count === 0) {
            throw AppError.badRequest("Insufficient wallet balance or concurrent transaction detected",);
          }
        }

        const newCampaign = await tx.campaign.create({
          data: {
            brandId: profile.id,
            title: parsed.title,
            description: parsed.description,
            requirements: parsed.requirements,
            guidelines: parsed.guidelines,
            totalBudget: parsed.totalBudgetPaise,
            perInfluencerBudget: parsed.perInfluencerBudgetPaise,
            fundedAmount: isDraft ? 0 : campaignFundingAmounts.totalAmount,
            maxInfluencers: data.maxInfluencers ? Number(data.maxInfluencers) : null,
            targetCategories: parsed.targetCategories,
            targetCities: parsed.targetCities,
            targetLanguages: parsed.targetLanguages,
            targetGender: typeof data.targetGender === "string" ? data.targetGender : null,
            targetAgeMin:
              data.targetAgeMin === null || data.targetAgeMin === undefined
                ? null
                : Number(data.targetAgeMin),
            targetAgeMax:
              data.targetAgeMax === null || data.targetAgeMax === undefined
                ? null
                : Number(data.targetAgeMax),
            minFollowers: parsed.minFollowers,
            maxFollowers: parsed.maxFollowers > 0 ? parsed.maxFollowers : null,
            minEngagementRate: parsed.minEngagementRate,
            deliverables: parsed.normalizedDeliverables,
            applicationDeadline: parsed.applicationDeadline,
            contentDeadline: parsed.contentDeadline,
            postingDeadline: parsed.postingDeadline,
            status: isDraft ? "DRAFT" : "ACTIVE",
            requiresProduct: parsed.requiresProduct,
            productName: parsed.productName,
            productValue: parsed.productValuePaise,
            productDescription: parsed.productDescription,
            isDirectInvite: Boolean(data.invitedInfluencerId),
          },
        });

        await this.handleDirectInviteInCampaign({
          tx,
          newCampaign,
          data,
          profile,
          totalBudgetPaise: parsed.totalBudgetPaise,
          perInfluencerBudgetPaise: parsed.perInfluencerBudgetPaise,
          normalizedDeliverables: parsed.normalizedDeliverables,
          requirements: parsed.requirements,
          contentDeadline: parsed.contentDeadline,
          postingDeadline: parsed.postingDeadline,
          requiresProduct: parsed.requiresProduct,
          productName: parsed.productName,
          productValuePaise: parsed.productValuePaise,
          productHandlingFee,
        });

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
              amount: campaignFundingAmounts.totalAmount,
              status: "COMPLETED",
              description: `Funds held for campaign creation: ${parsed.title}`,
              metadata: {
                balanceImpact: true,
                campaignId: newCampaign.id,
                totalBudget: parsed.totalBudgetPaise,
                platformFee: campaignFundingAmounts.platformFee,
                gatewayFee: campaignFundingAmounts.gatewayFee,
                fundedDealSlots,
              },
            },
          });
        }

        await createActivityLog({
          userId,
          action: "CREATE_CAMPAIGN",
          entityType: "Campaign",
          entityId: newCampaign.id,
        }, tx);

        return newCampaign;
      }, {
        // Serializable isolation prevents TOCTOU races on the budget/deal checks
        // when two parallel invites are sent at campaign creation time.
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
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
        applications: {
          where: { status: "SELECTED" },
          select: { id: true },
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
    const isAdminCheck = isAdmin(viewerUserType);

    if (campaign.status !== "ACTIVE" && !isOwner && !isAdminCheck) {
      return null;
    }

    if (campaign.isDirectInvite && !isOwner && !isAdminCheck) {
      if (!viewerUserId || !isInfluencer(viewerUserType)) {
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
  
  private static buildBasicInfoUpdate(data: Record<string, unknown>, updateData: Prisma.CampaignUpdateInput) {
    if (data.title !== undefined) updateData.title = safeStringCast(data.title);
    if (data.description !== undefined) updateData.description = safeStringCast(data.description);
    if (data.requirements !== undefined) updateData.requirements = safeStringCast(data.requirements);
    if (data.guidelines !== undefined) {
      updateData.guidelines = safeStringOrNullCast(data.guidelines);
    }
  }

  private static buildDemographicsUpdate(data: Record<string, unknown>, updateData: Prisma.CampaignUpdateInput) {
    if (data.targetCategories !== undefined) updateData.targetCategories = data.targetCategories as string[];
    if (data.targetCities !== undefined) updateData.targetCities = data.targetCities as string[];
    if (data.targetLanguages !== undefined) updateData.targetLanguages = data.targetLanguages as string[];
    if (data.targetGender !== undefined) {
      updateData.targetGender = safeStringOrNullCast(data.targetGender);
    }
    if (data.targetAgeMin !== undefined) {
      updateData.targetAgeMin = data.targetAgeMin !== null && data.targetAgeMin !== undefined ? Number(data.targetAgeMin) : null;
    }
    if (data.targetAgeMax !== undefined) {
      updateData.targetAgeMax = data.targetAgeMax !== null && data.targetAgeMax !== undefined ? Number(data.targetAgeMax) : null;
    }
  }

  private static buildFollowersAndEngagementUpdate(data: Record<string, unknown>, updateData: Prisma.CampaignUpdateInput) {
    if (data.minFollowers !== undefined) updateData.minFollowers = Number(data.minFollowers);
    if (data.maxFollowers !== undefined) {
      updateData.maxFollowers = Number(data.maxFollowers) > 0 ? Number(data.maxFollowers) : null;
    }
    if (data.minEngagementRate !== undefined) {
      updateData.minEngagementRate = data.minEngagementRate ? Number(data.minEngagementRate) : null;
    }
  }

  private static buildBudgetAndTimelineUpdate(data: Record<string, unknown>, updateData: Prisma.CampaignUpdateInput) {
    if (data.totalBudget !== undefined) updateData.totalBudget = Number(data.totalBudget);
    if (data.perInfluencerBudget !== undefined) {
      updateData.perInfluencerBudget = data.perInfluencerBudget ? Number(data.perInfluencerBudget) : null;
    }
    if (data.maxInfluencers !== undefined) {
      updateData.maxInfluencers = data.maxInfluencers ? Number(data.maxInfluencers) : null;
    }
    if (data.deliverables !== undefined) updateData.deliverables = data.deliverables as Prisma.InputJsonValue;
    if (data.applicationDeadline !== undefined) {
      updateData.applicationDeadline = data.applicationDeadline ? new Date(data.applicationDeadline as string) : null;
    }
    if (data.contentDeadline !== undefined) updateData.contentDeadline = new Date(data.contentDeadline as string);
    if (data.postingDeadline !== undefined) updateData.postingDeadline = new Date(data.postingDeadline as string);
  }

  private static buildProductSeedingUpdate(data: Record<string, unknown>, updateData: Prisma.CampaignUpdateInput) {
    if (data.requiresProduct !== undefined) updateData.requiresProduct = Boolean(data.requiresProduct);
    if (data.productName !== undefined) {
      updateData.productName = safeStringCast(data.productName);
    }
    if (data.productValue !== undefined) updateData.productValue = Number(data.productValue);
    if (data.productDescription !== undefined) {
      updateData.productDescription = safeStringCast(data.productDescription);
    }
  }

  private static buildCampaignUpdatePayload(data: Record<string, unknown>): Prisma.CampaignUpdateInput {
    const updateData: Prisma.CampaignUpdateInput = {};
    this.buildBasicInfoUpdate(data, updateData);
    this.buildDemographicsUpdate(data, updateData);
    this.buildFollowersAndEngagementUpdate(data, updateData);
    this.buildBudgetAndTimelineUpdate(data, updateData);
    this.buildProductSeedingUpdate(data, updateData);
    return updateData;
  }

  static async updateDraftCampaign(
    campaignId: string,
    userId: string,
    data: Record<string, unknown>,
  ) {
    try {
      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const campaign = await tx.campaign.findUnique({
          where: { id: campaignId },
          include: { brand: true },
        });

        if (!campaign || campaign.deletedAt || campaign.brand?.userId !== userId) {
          throw AppError.notFound("Campaign not found or unauthorized");
        }

        if (campaign.status !== "DRAFT") {
          throw AppError.badRequest("Campaign details can only be updated in DRAFT status");
        }

        const updateData = this.buildCampaignUpdatePayload(data);

        const updatedCampaign = await tx.campaign.update({
          where: { id: campaignId },
          data: updateData,
        });

        await createActivityLog({
          userId,
          action: "CAMPAIGN_UPDATE",
          entityType: "Campaign",
          entityId: campaignId,
        }, tx);

        return updatedCampaign;
      });

      logger.info("Campaign updated successfully", {
        userId,
        campaignId,
      });
      return result;
    } catch (error) {
      logger.error("Error updating campaign", error, { userId, campaignId });
      throw error;
    }
  }

  static async activateDraftCampaign(userId: string, campaignId: string) {
    try {
      const campaignData = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: { brand: { select: { userId: true } } },
      });
      if (!campaignData || campaignData.deletedAt || campaignData.brand?.userId !== userId) {
        throw AppError.notFound("Campaign not found or unauthorized");
      }

      const tierCheck = await checkVerificationTierForAmount(
        userId,
        "BRAND",
        campaignData.totalBudget,
      );
      if (!tierCheck.allowed) {
        throw new TierError(tierCheck.reason || "Verification required", tierErrorResponse(tierCheck));
      }

      const result = await prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const campaign = await tx.campaign.findUnique({
            where: { id: campaignId },
            include: { brand: true },
          });

          if (!campaign || campaign.deletedAt || campaign.brand?.userId !== userId) {
            throw AppError.notFound("Campaign not found or unauthorized");
          }
          if (campaign.status !== "DRAFT") {
            throw AppError.badRequest("Campaign is not in DRAFT status");
          }

          const brandFee = await resolveBrandPlatformFee(userId);
          const isProductOnly = campaign.requiresProduct && campaign.totalBudget === 0;
          const productHandlingFee = calculateProductHandlingFee(
            campaign.productValue,
            campaign.requiresProduct,
            isProductOnly,
            brandFee.effectivePlatformFee,
          );
          const fundedDealSlots = estimateCampaignDealSlots(
            campaign.totalBudget,
            campaign.perInfluencerBudget,
            campaign.maxInfluencers,
          );
          const fundingAmounts = calculateTotalAmount(
            campaign.totalBudget,
            brandFee.effectivePlatformFee,
            productHandlingFee * fundedDealSlots,
          );
          const fundingTierCheck = await checkVerificationTierForAmount(
            userId,
            "BRAND",
            fundingAmounts.totalAmount,
          );
          if (!fundingTierCheck.allowed) {
            throw new TierError(fundingTierCheck.reason || "Verification required", tierErrorResponse(fundingTierCheck));
          }
          const amountPaise = fundingAmounts.totalAmount;
          const wallet = await tx.wallet.findUnique({ where: { userId } });

          assertSufficientBalance(wallet, amountPaise);

          const updateResult = await tx.wallet.updateMany({
            where: { id: wallet!.id, balance: { gte: amountPaise } },
            data: {
              balance: { decrement: amountPaise },
              pendingBalance: { increment: amountPaise },
            },
          });

          if (updateResult.count === 0) {
            throw AppError.badRequest("Insufficient wallet balance or concurrent transaction detected",);
          }

          await tx.transaction.create({
            data: {
              walletId: wallet!.id,
              type: "DEBIT",
              amount: amountPaise,
              status: "COMPLETED",
              description: `Funds held for campaign activation: ${campaign.title}`,
              metadata: {
                balanceImpact: true,
                campaignId,
                totalBudget: campaign.totalBudget,
                platformFee: fundingAmounts.platformFee,
                gatewayFee: fundingAmounts.gatewayFee,
                fundedDealSlots,
              },
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
            data: { status: "ACTIVE", fundedAmount: amountPaise },
          });

          await createActivityLog({
            userId,
            action: "ACTIVATE_CAMPAIGN",
            entityType: "Campaign",
            entityId: campaignId,
          }, tx);

          return updatedCampaign;
        },
        {
          // Serializable prevents a concurrent cancelCampaign from racing on
          // wallet state while budget funds are being moved from balance →
          // pendingBalance.  The updateMany atomic guard is the primary safety
          // net; Serializable is a belt-and-suspenders defence.
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );

      logger.info("Campaign activated successfully", { userId, campaignId });
      return result;
    } catch (error) {
      logger.error("Error activating campaign", error, { userId, campaignId });
      throw error;
    }
  }

  static async cancelCampaign(userId: string, campaignId: string) {
    // Retry loop for Postgres P2034 serialization conflicts.
    // cancelCampaign reads deal.aggregate (committed budget sum) then computes
    // a refundableAmount from wallet.pendingBalance — identical phantom-read
    // exposure to acceptApplication.  A concurrent acceptApplication that
    // inserts a deal between our aggregate-read and wallet-update would cause
    // us to refund budget that is actually committed to a deal.
    // Serializable isolation detects the dependency cycle and aborts one side;
    // the retry ensures the losing side re-runs with the correct data.
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await prisma.$transaction(
          async (tx: Prisma.TransactionClient) => {
            const campaign = await tx.campaign.findUnique({
              where: { id: campaignId },
              include: { brand: true },
            });

            if (!campaign || campaign.deletedAt || campaign.brand?.userId !== userId) {
              throw AppError.notFound("Campaign not found or unauthorized");
            }

            if (campaign.status === "CANCELLED") {
              throw AppError.badRequest("Campaign is already cancelled");
            }

            if (campaign.status === "COMPLETED") {
              throw AppError.badRequest("Completed campaigns cannot be cancelled");
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
              throw AppError.badRequest("Cannot cancel campaign while active deals exist for this campaign");
            }

            const wallet = await tx.wallet.findUnique({ where: { userId } });
            const shouldRefundHeldBudget = campaign.status !== "DRAFT";

            if (shouldRefundHeldBudget && wallet) {
              // Under Serializable isolation this aggregate is protected from
              // phantom inserts — a concurrent acceptApplication that commits
              // a new deal after this read causes Postgres to abort one of the
              // two transactions with P2034, preventing a stale-read over-refund.
              const alreadyCommitted = campaign.reservedTotalAmount ?? campaign.reservedAmount ?? 0;
              const campaignReservedBudget = Math.max(
                0,
                (campaign.fundedAmount || campaign.totalBudget) - alreadyCommitted,
              );
              const refundableAmount = Math.min(wallet.pendingBalance, campaignReservedBudget);

              if (refundableAmount > 0) {
                // Atomic conditional decrement — if pendingBalance was already
                // reduced by a concurrent transaction the updateMany returns
                // count=0, we recalculate on retry.
                const walletUpdate = await tx.wallet.updateMany({
                  where: { id: wallet.id, pendingBalance: { gte: refundableAmount } },
                  data: {
                    pendingBalance: { decrement: refundableAmount },
                    balance: { increment: refundableAmount },
                  },
                });

                if (walletUpdate.count === 0) {
                  throw AppError.badRequest("Concurrent wallet modification detected, retrying");
                }

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

            await createActivityLog({
              userId,
              action: "CANCEL_CAMPAIGN",
              entityType: "Campaign",
              entityId: campaignId,
            }, tx);

            return updatedCampaign;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );

        logger.info("Campaign cancelled successfully", { userId, campaignId });
        return result;
      } catch (error) {
        const isSerializationConflict =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034";

        if (isSerializationConflict && attempt < MAX_RETRIES) {
          logger.warn(
            `[cancelCampaign] Serialization conflict on attempt ${attempt}/${MAX_RETRIES}, retrying…`,
            { userId, campaignId },
          );
          await new Promise((r) => setTimeout(r, 50 * attempt));
          continue;
        }

        logger.error("Error cancelling campaign", error, { userId, campaignId });
        throw error;
      }
    }
    // Unreachable — loop always returns or throws
    throw AppError.badRequest("cancelCampaign: exceeded max retries");
  }
}
