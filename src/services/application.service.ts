import { AppError } from "@/lib/errors";
import { Prisma, ApplicationStatus, CampaignStatus } from "@prisma/client";

import prisma from "@/lib/db";
import { checkApplicationFraud } from "@/lib/fraud-detection";
import { checkTrustGate } from "@/lib/trust-engine";
import {
  checkVerificationTierForAmount,
  tierErrorResponse,
} from "@/lib/verification-tiers";
import { logger } from "@/lib/logger";
import { ApplicationInput } from "@/lib/validations";
import { checkEnterpriseApplicationGate } from "@/lib/enterprise-trust-guard";
import { generateContractTerms } from "@/lib/contract-engine";
import { calculateTotalAmount } from "@/lib/razorpay";
import { assertSufficientBalance, assertAccountCanTransact, calculateProductHandlingFee } from "@/lib/utils";
import { resolveBrandPlatformFee } from "@/lib/platform-fees";
import { addUserXp } from "@/lib/gamification-engine";
import { NotificationService } from "@/services/notification.service";
import { createActivityLog } from "@/lib/audit";
import { TierError } from "@/services/campaign.service";
import { MatchingService } from "@/services/matching.service";
import { isAdmin, isBrand, isInfluencer } from "@/lib/rbac";

export interface CampaignValidateResult {
  id: string;
  status: CampaignStatus;
  minFollowers: number;
  maxFollowers: number | null;
  applicationDeadline: Date | null;
  perInfluencerBudget: number | null;
  maxInfluencers: number | null;
  selectedInfluencers: number;
  requiresProduct: boolean;
  totalBudget: number;
  productValue: number | null;
}

function resolveApplicationDealAmount(
  proposedRate: number | null | undefined,
  perInfluencerBudget: number | null | undefined,
) {
  const proposed = Math.max(0, proposedRate || 0);
  const cap = Math.max(0, perInfluencerBudget || 0);

  return proposed > 0 ? proposed : cap;
}

export class ApplicationService {
  private static async checkCampaignOwnership(campaignId: string, userId: string, userType: string) {
    if (isAdmin(userType) || isInfluencer(userType)) return;
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { brand: { select: { userId: true } } },
    });

    if (!campaign) throw AppError.notFound("Campaign not found");
    const ownerId = campaign.brand?.userId;

    if (ownerId !== userId) {
      logger.warn("Unauthorized application list attempt", {
        userId,
        campaignId,
      });
      throw AppError.badRequest("Not authorized to view these applications");
    }
  }

  private static async resolveListWhere(
    userId: string,
    userType: string,
    params: {
      campaignId?: string;
      status?: string;
    },
  ): Promise<Prisma.ApplicationWhereInput | null> {
    const where: Prisma.ApplicationWhereInput = {};

    if (isInfluencer(userType)) {
      const profile = await prisma.influencerProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!profile) return null;
      where.influencerId = profile.id;
    }

    if (params.campaignId) {
      where.campaignId = params.campaignId;
      await this.checkCampaignOwnership(params.campaignId, userId, userType);
    } else if (!isInfluencer(userType) && isBrand(userType)) {
      const profile = await prisma.brandProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (profile) {
        where.campaign = { brandId: profile.id };
      }
    }

    if (params.status) where.status = params.status as ApplicationStatus;

    return where;
  }

  static async listApplications(
    userId: string,
    userType: string,
    params: {
      campaignId?: string;
      status?: string;
      page: number;
      limit: number;
    },
  ) {
    try {
      const page = Math.max(1, params.page || 1);
      const limit = Math.min(50, Math.max(1, params.limit || 10));

      const where = await ApplicationService.resolveListWhere(userId, userType, params);
      if (!where) return { applications: [], total: 0 };

      logger.info("Listing applications", {
        userId,
        userType,
        filters: where,
        page,
      });

      const [applications, total] = await Promise.all([
        prisma.application.findMany({
          where,
          include: {
            campaign: {
              select: {
                id: true,
                title: true,
                perInfluencerBudget: true,
                targetCategories: true,
                brand: { select: { companyName: true, logo: true } },
              },
            },
            influencer: {
              select: {
                id: true,
                displayName: true,
                avatar: true,
                instagramFollowers: true,
                instagramEngagementRate: true,
                youtubeSubscribers: true,
                youtubeEngagementRate: true,
                categories: true,
                averageRating: true,
                completedDeals: true,
                followerAuthenticityScore: true,
                user: { select: { trustScore: true, xp: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.application.count({ where }),
      ]);

      const applicationsWithScores = await Promise.all(
        applications.map(async (app) => {
          const matchResult = await MatchingService.calculateMatchScore(
            {
              id: app.campaign.id,
              targetCategories: app.campaign.targetCategories,
              perInfluencerBudget: app.campaign.perInfluencerBudget,
            },
            {
              id: app.influencer.id,
              categories: app.influencer.categories,
              instagramFollowers: app.influencer.instagramFollowers,
              instagramEngagementRate: app.influencer.instagramEngagementRate,
              youtubeSubscribers: app.influencer.youtubeSubscribers,
              youtubeEngagementRate: app.influencer.youtubeEngagementRate,
              followerAuthenticityScore: app.influencer.followerAuthenticityScore,
              averageRating: app.influencer.averageRating,
              xp: app.influencer.user.xp,
            },
            app.proposedRate
          );

          return {
            ...app,
            matchScore: matchResult.matchScore,
            matchBreakdown: matchResult.matchBreakdown,
          };
        })
      );

      // Sort by match score descending to bubble up highest matching/ROI candidates first
      const sortedApplications = applicationsWithScores.sort((a, b) => b.matchScore - a.matchScore);

      return { applications: sortedApplications, total, totalPages: Math.ceil(total / limit) };
    } catch (error) {
      logger.error("Error listing applications", error, { userId });
      throw AppError.badRequest("Failed to list applications");
    }
  }

  private static validateApplicationRatesAndProposal(data: ApplicationInput) {
    if (!data.proposal || data.proposal.trim().length < 10) {
      throw AppError.badRequest("Proposal is required and must be at least 10 characters");
    }
    if (data.proposedRate && data.proposedRate < 0) {
      throw AppError.badRequest("Proposed rate cannot be negative");
    }
  }

  private static async getAndValidateInfluencer(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        influencerProfile: {
          select: {
            id: true,
            instagramFollowers: true,
            youtubeSubscribers: true,
            instagramHandle: true,
            youtubeHandle: true,
            followerAuthenticityScore: true,
          },
        },
      },
    });

    if (!user) throw AppError.notFound("User not found");
    assertAccountCanTransact(user.status);

    const profile = user.influencerProfile;
    if (!profile) {
      throw AppError.badRequest("Please complete your profile before applying");
    }

    if (!profile.instagramHandle && !profile.youtubeHandle) {
      throw AppError.badRequest(
        "You must connect at least one social media handle (Instagram or YouTube) to your profile before applying to campaigns."
      );
    }

    // Direct authenticity score hard block
    if (profile.followerAuthenticityScore < 40) {
      throw AppError.badRequest(
        `Your follower authenticity score (${profile.followerAuthenticityScore}/100) is below the minimum required threshold of 40. High authenticity is required to participate in campaigns.`
      );
    }

    const instaFollowers = profile.instagramFollowers === null ? 0 : (profile.instagramFollowers ?? 0);
    const ytSubs = profile.youtubeSubscribers === null ? 0 : (profile.youtubeSubscribers ?? 0);
    const hasHiddenSubscribers = instaFollowers === -1 || ytSubs === -1;
    const maxRelevantFollowers = hasHiddenSubscribers ? -1 : Math.max(instaFollowers, ytSubs);

    if (!hasHiddenSubscribers && maxRelevantFollowers < 1000) {
      throw AppError.badRequest(
        "You must have at least 1,000 Instagram followers or YouTube subscribers to apply for campaigns on Decisional."
      );
    }

    return { profile, maxRelevantFollowers, hasHiddenSubscribers };
  }

  private static async getAndValidateCampaign(
    campaignId: string,
    maxRelevantFollowers: number,
    hasHiddenSubscribers: boolean
  ) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        status: true,
        minFollowers: true,
        maxFollowers: true,
        applicationDeadline: true,
        perInfluencerBudget: true,
        maxInfluencers: true,
        selectedInfluencers: true,
        requiresProduct: true,
        totalBudget: true,
        productValue: true,
      },
    });

    if (!campaign) throw AppError.notFound("Campaign not found");
    if (campaign.status !== "ACTIVE") {
      throw AppError.badRequest("Campaign is not accepting applications");
    }
    if (
      campaign.maxInfluencers !== null &&
      campaign.maxInfluencers !== undefined &&
      campaign.selectedInfluencers >= campaign.maxInfluencers
    ) {
      throw AppError.badRequest("This campaign has reached its maximum number of influencer slots.");
    }
    if (campaign.applicationDeadline && new Date() > campaign.applicationDeadline) {
      throw AppError.badRequest("Application deadline has passed");
    }

    const isProductOnly = campaign.requiresProduct && campaign.totalBudget === 0;
    if (isProductOnly) {
      if (!hasHiddenSubscribers && maxRelevantFollowers > 10000) {
        throw AppError.badRequest(
          "Product-only campaigns are only available for influencers with 10,000 or fewer followers/subscribers."
        );
      }
    }

    if (!hasHiddenSubscribers && maxRelevantFollowers < campaign.minFollowers) {
      throw AppError.badRequest(`Minimum ${campaign.minFollowers.toLocaleString()} followers required`);
    }
    if (!hasHiddenSubscribers && campaign.maxFollowers && maxRelevantFollowers > campaign.maxFollowers) {
      throw AppError.badRequest(`Maximum ${campaign.maxFollowers.toLocaleString()} followers allowed`);
    }

    return campaign;
  }



  private static async checkVerificationAndGates(
    userId: string,
    data: ApplicationInput,
    campaign: CampaignValidateResult
  ) {
    const isProductOnly = campaign.requiresProduct && campaign.totalBudget === 0;
    const applicationValue = isProductOnly ? campaign.productValue || 0 : campaign.perInfluencerBudget || 0;

    const tierCheck = await checkVerificationTierForAmount(userId, "INFLUENCER", applicationValue);
    if (!tierCheck.allowed) {
      throw new TierError(tierCheck.reason || "Verification required", tierErrorResponse(tierCheck));
    }

    const fraudCheck = await checkApplicationFraud({
      userId,
      campaignId: data.campaignId,
      proposalContent: data.proposal,
    });

    if (fraudCheck.action === "BLOCK") {
      logger.warn("Application blocked by fraud check", {
        userId,
        campaignId: data.campaignId,
        reason: fraudCheck.flags.map((f) => f.description).join(", "),
      });
      throw AppError.badRequest("Application blocked. Please contact support.");
    }

    if (fraudCheck.action === "REVIEW") {
      logger.warn("Application flagged for admin review", {
        userId,
        campaignId: data.campaignId,
        riskScore: fraudCheck.riskScore,
        flags: fraudCheck.flags.map((f) => f.description),
      });
    }

    const dealAmount = resolveApplicationDealAmount(data.proposedRate, campaign.perInfluencerBudget);
    if (dealAmount > 0) {
      const trustGate = await checkTrustGate(userId, dealAmount);
      if (!trustGate.allowed) {
        logger.warn("Trust gate block application", { userId, dealAmount });
        throw AppError.badRequest(trustGate.reason || "Trust score too low for this campaign");
      }

      const enterpriseGate = await checkEnterpriseApplicationGate(userId, dealAmount);
      if (!enterpriseGate.allowed) {
        logger.warn("Enterprise gate block application", {
          userId,
          dealAmount,
          reason: enterpriseGate.reason,
        });
        throw AppError.badRequest(enterpriseGate.reason || "Limited by enterprise risk guard.");
      }
    }

    return { fraudCheck };
  }

  static async createApplication(userId: string, data: ApplicationInput) {
    try {
      this.validateApplicationRatesAndProposal(data);

      const { profile, maxRelevantFollowers, hasHiddenSubscribers } =
        await this.getAndValidateInfluencer(userId);

      const campaign = await this.getAndValidateCampaign(
        data.campaignId,
        maxRelevantFollowers,
        hasHiddenSubscribers
      );

      const { fraudCheck } = await this.checkVerificationAndGates(userId, data, campaign);

      const existing = await prisma.application.findUnique({
        where: {
          campaignId_influencerId: {
            campaignId: data.campaignId,
            influencerId: profile.id,
          },
        },
      });
      if (existing) {
        throw AppError.badRequest("You have already applied to this campaign");
      }

      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const newApplication = await tx.application.create({
          data: {
            campaignId: data.campaignId,
            influencerId: profile.id,
            proposal: data.proposal,
            proposedRate: data.proposedRate || 0,
            estimatedDelivery: data.estimatedDelivery
              ? new Date(data.estimatedDelivery)
              : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default 1 week
            status: fraudCheck.action === "REVIEW" ? "FLAGGED" : "PENDING",
          },
        });

        await tx.campaign.update({
          where: { id: data.campaignId },
          data: { totalApplications: { increment: 1 } },
        });

        await addUserXp(userId, 10, "SUBMIT_APPLICATION", tx);

        await createActivityLog({
          userId,
          action: "SUBMIT_APPLICATION",
          entityType: "Application",
          entityId: newApplication.id,
          metadata: {
            campaignId: data.campaignId,
            fraudCheckResult: fraudCheck.action,
            riskScore: fraudCheck.riskScore,
            flags: fraudCheck.flags.map((f) => f.rule),
          },
        }, tx);

        return newApplication;
      });

      logger.info("Application submitted successfully", {
        userId,
        applicationId: result.id,
      });
      return result;
    } catch (error) {
      logger.error("Error creating application", error, {
        userId,
        campaignId: data.campaignId,
      });
      throw error;
    }
  }

  private static validateApplicationCanBeAccepted(
    application: {
      status: string;
      campaign: {
        status: string;
        maxInfluencers: number | null;
        selectedInfluencers: number;
        brandId: string | null;
      };
    },
    brandProfileId: string,
  ): void {
    if (application.campaign.brandId !== brandProfileId) {
      throw AppError.badRequest("Not authorized to accept this application");
    }

    if (
      application.campaign.maxInfluencers !== null &&
      application.campaign.maxInfluencers !== undefined &&
      application.campaign.selectedInfluencers >= application.campaign.maxInfluencers
    ) {
      throw AppError.badRequest("This campaign has reached its maximum number of influencer slots.");
    }

    if (!["PENDING", "SHORTLISTED"].includes(application.status)) {
      throw AppError.badRequest("Only pending applications can be accepted");
    }

    if (application.campaign.status !== "ACTIVE") {
      throw AppError.badRequest("Campaign is not active");
    }
  }

  private static async calculateDealFinancials(
    application: {
      proposedRate: number | null;
      campaign: {
        perInfluencerBudget: number | null;
        requiresProduct: boolean;
        totalBudget: number;
        productValue: number | null;
        reservedAmount: number | null;
        reservedTotalAmount: number | null;
        fundedAmount: number | null;
      };
    },
    customRate: number | undefined,
    userId: string,
  ): Promise<{ dealAmount: number; paymentAmounts: ReturnType<typeof calculateTotalAmount>; productHandlingFee: number }> {
    const dealAmount = customRate && customRate > 0
      ? customRate
      : resolveApplicationDealAmount(
          application.proposedRate,
          application.campaign.perInfluencerBudget,
        );
    const isProductOnly = application.campaign.requiresProduct && application.campaign.totalBudget === 0;
    if (dealAmount <= 0 && !isProductOnly) {
      throw AppError.badRequest("Cannot accept application without a valid per-influencer budget");
    }

    const alreadyCommitted = application.campaign.reservedAmount || 0;
    if (alreadyCommitted + dealAmount > application.campaign.totalBudget) {
      throw AppError.badRequest("Campaign budget exceeded. Increase budget or reject other deals first.");
    }

    const brandFee = await resolveBrandPlatformFee(userId);
    const productHandlingFee = calculateProductHandlingFee(
      application.campaign.productValue,
      application.campaign.requiresProduct,
      isProductOnly,
      brandFee.effectivePlatformFee,
    );

    const paymentAmounts = calculateTotalAmount(
      dealAmount,
      brandFee.effectivePlatformFee,
      productHandlingFee,
    );

    const alreadyCommittedTotal =
      application.campaign.reservedTotalAmount ||
      application.campaign.reservedAmount ||
      0;
    const fundedAmount =
      application.campaign.fundedAmount || application.campaign.totalBudget;
    if (alreadyCommittedTotal + paymentAmounts.totalAmount > fundedAmount) {
      throw AppError.badRequest("Campaign funded amount exceeded. Add funds or reduce selected deal value.");
    }

    return { dealAmount, paymentAmounts, productHandlingFee };
  }

  static async acceptApplication(userId: string, applicationId: string, customRate?: number) {
    // Retry loop to handle Postgres P2034 serialization-conflict errors that can
    // occur when two parallel requests attempt to accept applications for the same
    // campaign budget simultaneously.  Serializable isolation guarantees the budget
    // aggregate read and the deal create are atomic; on conflict one transaction
    // wins cleanly and the other is retried (or surfaces a user-visible error).
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await prisma.$transaction(
          async (tx: Prisma.TransactionClient) => {
            const actingUser = await tx.user.findUnique({
              where: { id: userId },
              select: { status: true },
            });
            assertAccountCanTransact(actingUser?.status);

            const brandProfile = await tx.brandProfile.findUnique({
              where: { userId },
              select: { id: true, companyName: true },
            });
            if (!brandProfile) {
              throw AppError.notFound("Brand profile not found");
            }

            const application = await tx.application.findUnique({
              where: { id: applicationId },
              include: {
                campaign: {
                  select: {
                    id: true,
                    title: true,
                    status: true,
                    brandId: true,
                    totalBudget: true,
                    perInfluencerBudget: true,
                    deliverables: true,
                    requirements: true,
                    contentDeadline: true,
                    postingDeadline: true,
                    requiresProduct: true,
                    productName: true,
                    productValue: true,
                    productDescription: true,
                    maxInfluencers: true,
                    selectedInfluencers: true,
                    reservedAmount: true,
                    reservedTotalAmount: true,
                    fundedAmount: true,
                  },
                },
                influencer: {
                  select: {
                    id: true,
                    userId: true,
                    displayName: true,
                    followerAuthenticityScore: true,
                  },
                },
              },
            });

            if (!application) {
              throw AppError.notFound("Application not found");
            }

            // Direct authenticity score check at acceptance time
            if (application.influencer.followerAuthenticityScore < 40) {
              throw AppError.badRequest(
                `This application cannot be accepted because the influencer's follower authenticity score (${application.influencer.followerAuthenticityScore}/100) is below the minimum required threshold of 40.`
              );
            }

            ApplicationService.validateApplicationCanBeAccepted(application, brandProfile.id);

            const applicationLock = await tx.application.updateMany({
              where: {
                id: application.id,
                status: { in: ["PENDING", "SHORTLISTED"] },
              },
              data: { updatedAt: new Date() },
            });

            if (applicationLock.count === 0) {
              throw AppError.badRequest("Application has already been processed");
            }

            await tx.campaign.update({
              where: { id: application.campaignId },
              data: { updatedAt: new Date() },
            });

            const existingDeal = await tx.deal.findFirst({
              where: {
                campaignId: application.campaignId,
                influencerId: application.influencerId,
                deletedAt: null,
                status: { not: "CANCELLED" },
              },
              select: { id: true },
            });
            if (existingDeal) {
              throw AppError.badRequest("A deal already exists for this influencer");
            }

            const { dealAmount, paymentAmounts, productHandlingFee } =
              await ApplicationService.calculateDealFinancials(application, customRate, userId);

            const wallet = await tx.wallet.findUnique({
              where: { userId },
              select: { id: true, pendingBalance: true },
            });
            assertSufficientBalance(wallet, paymentAmounts.totalAmount, "pendingBalance");

            const draftContractTerms = generateContractTerms(
              "pending",
              {
                totalBudget: application.campaign.totalBudget,
                perInfluencerBudget: dealAmount,
                deliverables: application.campaign.deliverables,
                requirements: application.campaign.requirements,
                contentDeadline: application.campaign.contentDeadline,
                postingDeadline: application.campaign.postingDeadline,
                requiresProduct: application.campaign.requiresProduct,
                productName: application.campaign.productName,
                productValue: application.campaign.productValue,
                productDescription: application.campaign.productDescription,
              },
              {
                rate: dealAmount,
                message: application.proposal,
                platformFee: paymentAmounts.platformFee,
                gatewayFee: paymentAmounts.gatewayFee,
                totalAmount: paymentAmounts.totalAmount,
                platformFeePercent: paymentAmounts.platformFeePercent,
                influencerPayout: paymentAmounts.influencerReceives,
                productHandlingFee,
              },
            );

            const reserveResult = await tx.wallet.updateMany({
              where: { userId, pendingBalance: { gte: paymentAmounts.totalAmount } },
              data: { pendingBalance: { decrement: paymentAmounts.totalAmount } },
            });

            if (reserveResult.count === 0) {
              throw AppError.badRequest("Insufficient held campaign funds.");
            }

            const deal = await tx.deal.create({
              data: {
                campaignId: application.campaignId,
                influencerId: application.influencerId,
                brandId: brandProfile.id,
                amount: dealAmount,
                platformFee: paymentAmounts.platformFee,
                gatewayFee: paymentAmounts.gatewayFee,
                totalAmount: paymentAmounts.totalAmount,
                influencerPayout: paymentAmounts.influencerReceives,
                reservedFromWallet: true,
                requiresProduct: application.campaign.requiresProduct,
                productName: application.campaign.productName,
                productValue: application.campaign.productValue,
                productHandlingFee,
                productFulfillmentStatus: application.campaign.requiresProduct
                  ? "ADDRESS_PENDING"
                  : "NOT_REQUIRED",
                submissionDeadline: application.campaign.contentDeadline,
                postingDeadline: application.campaign.postingDeadline,
                signDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
                contractTerms:
                  draftContractTerms as unknown as Prisma.InputJsonValue,
                status: "PENDING_SIGNATURE",
              },
            });

            await tx.deal.update({
              where: { id: deal.id },
              data: {
                contractTerms: {
                  ...draftContractTerms,
                  dealId: deal.id,
                } as unknown as Prisma.InputJsonValue,
              },
            });

            await tx.application.update({
              where: { id: application.id },
              data: { status: "SELECTED" },
            });

            await tx.campaign.update({
              where: { id: application.campaignId },
              data: {
                selectedInfluencers: { increment: 1 },
                reservedAmount: { increment: dealAmount },
                reservedTotalAmount: { increment: paymentAmounts.totalAmount },
              },
            });

            await NotificationService.createNotification({
              userId: application.influencer.userId,
              type: "deal_update",
              title: "Your application was accepted",
              message: `${brandProfile.companyName} accepted your application for ${application.campaign.title}. Please sign the contract.`,
              data: {
                campaignId: application.campaignId,
                applicationId: application.id,
                dealId: deal.id,
              },
            }, tx);

            await createActivityLog({
              userId,
              action: "ACCEPT_APPLICATION",
              entityType: "Application",
              entityId: application.id,
              metadata: {
                campaignId: application.campaignId,
                dealId: deal.id,
              },
            }, tx);

            return deal;
          },
          {
            // Serializable isolation prevents the budget-aggregate TOCTOU race:
            // two concurrent accept calls read the same committed-budget sum and
            // both pass the budget check under Read Committed, creating two deals
            // that together exceed totalBudget.  Under Serializable, Postgres
            // detects the dependency cycle and aborts one transaction with P2034,
            // which the retry loop below handles gracefully.
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );

        logger.info("Application accepted successfully", {
          userId,
          applicationId,
          dealId: result.id,
        });

        return result;
      } catch (error) {
        const isSerializationConflict =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034";

        if (isSerializationConflict && attempt < MAX_RETRIES) {
          logger.warn(
            `[acceptApplication] Serialization conflict on attempt ${attempt}/${MAX_RETRIES}, retrying…`,
            { userId, applicationId },
          );
          // Small jitter before retry to reduce thundering-herd
          await new Promise((r) => setTimeout(r, 50 * attempt));
          continue;
        }

        logger.error("Error accepting application", error, { userId, applicationId });
        throw error;
      }
    }
    // Unreachable — the loop always returns or throws
    throw AppError.badRequest("acceptApplication: exceeded max retries");
  }

  static async rejectApplication(
    userId: string,
    applicationId: string,
    rejectionReason?: string,
  ) {
    try {
      const result = await prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const brandProfile = await tx.brandProfile.findUnique({
            where: { userId },
            select: { id: true, companyName: true },
          });
          if (!brandProfile) {
            throw AppError.notFound("Brand profile not found");
          }

          const application = await tx.application.findUnique({
            where: { id: applicationId },
            include: {
              campaign: {
                select: {
                  id: true,
                  title: true,
                  brandId: true,
                },
              },
              influencer: {
                select: { userId: true },
              },
            },
          });

          if (!application) {
            throw AppError.notFound("Application not found");
          }

          if (application.campaign.brandId !== brandProfile.id) {
            throw AppError.badRequest("Not authorized to reject this application");
          }

          if (!["PENDING", "SHORTLISTED"].includes(application.status)) {
            throw AppError.badRequest("Only pending applications can be rejected");
          }

          const applicationLock = await tx.application.updateMany({
            where: {
              id: application.id,
              status: { in: ["PENDING", "SHORTLISTED"] },
            },
            data: {
              status: "REJECTED",
              rejectionReason:
                rejectionReason?.trim() || "Application rejected by campaign owner.",
            },
          });

          if (applicationLock.count === 0) {
            throw AppError.badRequest("Application has already been processed");
          }

          const updatedApplication = await tx.application.findUniqueOrThrow({
            where: { id: application.id },
          });

          await NotificationService.createNotification({
            userId: application.influencer.userId,
            type: "deal_update",
            title: "Application update",
            message: `${brandProfile.companyName} rejected your application for ${application.campaign.title}.`,
            data: {
              campaignId: application.campaignId,
              applicationId: application.id,
            },
          }, tx);

          await createActivityLog({
            userId,
            action: "REJECT_APPLICATION",
            entityType: "Application",
            entityId: application.id,
            metadata: {
              campaignId: application.campaignId,
            },
          }, tx);

          return updatedApplication;
        },
      );

      logger.info("Application rejected successfully", {
        userId,
        applicationId,
      });
      return result;
    } catch (error) {
      logger.error("Error rejecting application", error, { userId, applicationId });
      throw error;
    }
  }
}
