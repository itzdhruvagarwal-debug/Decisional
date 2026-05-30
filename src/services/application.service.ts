import { Prisma } from "@prisma/client";

import prisma from "@/lib/db";
import { checkApplicationFraud } from "@/lib/fraud-detection";
import { checkTrustGate } from "@/lib/trust-engine";
import {
  checkVerificationTierForAmount,
  tierErrorResponse,
} from "@/lib/verification-tiers";
import { logger } from "@/lib/logger";
import { checkEnterpriseApplicationGate } from "@/lib/enterprise-trust-guard";
import { generateContractTerms } from "@/lib/contract-engine";
import { calculateTotalAmount } from "@/lib/razorpay";
import { resolveBrandPlatformFee } from "@/lib/platform-fees";
import { addUserXp } from "@/lib/gamification-engine";

export class ApplicationService {
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

      const where: any = {};

      if (userType === "INFLUENCER") {
        const profile = await prisma.influencerProfile.findUnique({
          where: { userId },
          select: { id: true },
        });
        if (!profile) return { applications: [], total: 0 };
        where.influencerId = profile.id;
      }

      if (params.campaignId) {
        where.campaignId = params.campaignId;

        // Verify ownership for non-influencer users
        if (userType !== "INFLUENCER" && userType !== "ADMIN") {
          const campaign = await prisma.campaign.findUnique({
            where: { id: params.campaignId },
            include: { brand: { select: { userId: true } } },
          });

          if (!campaign) throw new Error("Campaign not found");
          const ownerId = campaign.brand?.userId;

          if (ownerId !== userId) {
            logger.warn("Unauthorized application list attempt", {
              userId,
              campaignId: params.campaignId,
            });
            throw new Error("Not authorized to view these applications");
          }
        }
      } else if (userType !== "INFLUENCER") {
        if (userType === "BRAND") {
          const profile = await prisma.brandProfile.findUnique({
            where: { userId },
            select: { id: true },
          });
          if (profile) {
            where.campaign = { brandId: profile.id };
          }
        }
      }

      if (params.status) where.status = params.status;

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
                categories: true,
                averageRating: true,
                completedDeals: true,
                user: { select: { trustScore: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.application.count({ where }),
      ]);

      return { applications, total, totalPages: Math.ceil(total / limit) };
    } catch (error) {
      logger.error("Error listing applications", error, { userId });
      throw new Error("Failed to list applications");
    }
  }

  static async createApplication(userId: string, data: any) {
    try {
      // 0. Input Validation
      if (!data.proposal || data.proposal.trim().length < 10) {
        throw new Error(
          "Proposal is required and must be at least 10 characters",
        );
      }
      if (data.proposedRate && data.proposedRate < 0) {
        throw new Error("Proposed rate cannot be negative");
      }

      // 1. Get Influencer Profile & KYC Status
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
            },
          },
        },
      });

      if (!user) throw new Error("User not found");

      const profile = user.influencerProfile;
      if (!profile)
        throw new Error("Please complete your profile before applying");

      if (!profile.instagramHandle && !profile.youtubeHandle) {
        throw new Error(
          "You must connect at least one social media handle (Instagram or YouTube) to your profile before applying to campaigns."
        );
      }

      const instaFollowers = profile.instagramFollowers || 0;
      const ytSubs = profile.youtubeSubscribers || 0;
      const maxRelevantFollowers = Math.max(instaFollowers, ytSubs);

      if (maxRelevantFollowers < 1000) {
        throw new Error(
          "You must have at least 1,000 Instagram followers or YouTube subscribers to apply for campaigns on Decisional.",
        );
      }

      // 2. Validate Campaign
      const campaign = await prisma.campaign.findUnique({
        where: { id: data.campaignId },
        select: {
          id: true,
          status: true,
          minFollowers: true,
          maxFollowers: true,
          applicationDeadline: true,
          perInfluencerBudget: true,
        },
      });

      if (!campaign) throw new Error("Campaign not found");
      if (campaign.status !== "ACTIVE")
        throw new Error("Campaign is not accepting applications");
      if (
        campaign.applicationDeadline &&
        new Date() > campaign.applicationDeadline
      )
        throw new Error("Application deadline has passed");

      if (maxRelevantFollowers < campaign.minFollowers)
        throw new Error(
          `Minimum ${campaign.minFollowers.toLocaleString()} followers required`,
        );
      if (campaign.maxFollowers && maxRelevantFollowers > campaign.maxFollowers)
        throw new Error(
          `Maximum ${campaign.maxFollowers.toLocaleString()} followers allowed`,
        );

      // 2b. Tiered Verification Check (based on campaign perInfluencerBudget)
      const campaignBudgetPaise = campaign.perInfluencerBudget || 0;
      const tierCheck = await checkVerificationTierForAmount(
        userId,
        "INFLUENCER",
        campaignBudgetPaise,
      );
      if (!tierCheck.allowed) {
        const err: any = new Error(tierCheck.reason || "Verification required");
        err.tierError = tierErrorResponse(tierCheck);
        throw err;
      }

      // 3. Check Duplicate
      const existing = await prisma.application.findUnique({
        where: {
          campaignId_influencerId: {
            campaignId: data.campaignId,
            influencerId: profile.id,
          },
        },
      });
      if (existing)
        throw new Error("You have already applied to this campaign");

      // 4. Fraud Check
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
        throw new Error("Application blocked. Please contact support.");
      }

      // 5. Trust Gate & Enterprise Velocity Guard
      const dealAmount = Math.max(
        data.proposedRate || 0,
        campaign.perInfluencerBudget || 0,
      );
      if (dealAmount > 0) {
        const trustGate = await checkTrustGate(userId, dealAmount);
        if (!trustGate.allowed) {
          logger.warn("Trust gate block application", { userId, dealAmount });
          throw new Error(
            trustGate.reason || "Trust score too low for this campaign",
          );
        }

        // Dynamic Enterprise Validation (3 apps/day limit for new accounts, velocity checks, etc)
        const enterpriseGate = await checkEnterpriseApplicationGate(userId, dealAmount);
        if (!enterpriseGate.allowed) {
          logger.warn("Enterprise gate block application", { userId, dealAmount, reason: enterpriseGate.reason });
          throw new Error(
            enterpriseGate.reason || "Limited by enterprise risk guard.",
          );
        }
      }

      // 6. Transaction
      const result = await prisma.$transaction(async (tx: any) => {
        const newApplication = await tx.application.create({
          data: {
            campaignId: data.campaignId,
            influencerId: profile.id,
            proposal: data.proposal,
            proposedRate: data.proposedRate || 0,
            estimatedDelivery: data.estimatedDelivery
              ? new Date(data.estimatedDelivery)
              : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default 1 week
            status: "PENDING",
          },
        });

        await tx.campaign.update({
          where: { id: data.campaignId },
          data: { totalApplications: { increment: 1 } },
        });

        await addUserXp(userId, 10, "SUBMIT_APPLICATION", tx);

        await tx.activityLog.create({
          data: {
            userId,
            action: "SUBMIT_APPLICATION",
            entityType: "Application",
            entityId: newApplication.id,
            metadata: {
              campaignId: data.campaignId,
              fraudCheckResult: fraudCheck.action,
            },
          },
        });

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

  static async acceptApplication(userId: string, applicationId: string) {
    try {
      const result = await prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const brandProfile = await tx.brandProfile.findUnique({
            where: { userId },
            select: { id: true, companyName: true },
          });
          if (!brandProfile) {
            throw new Error("Brand profile not found");
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
                },
              },
              influencer: {
                select: {
                  id: true,
                  userId: true,
                  displayName: true,
                },
              },
            },
          });

          if (!application) {
            throw new Error("Application not found");
          }

          if (application.campaign.brandId !== brandProfile.id) {
            throw new Error("Not authorized to accept this application");
          }

          if (!["PENDING", "SHORTLISTED"].includes(application.status)) {
            throw new Error("Only pending applications can be accepted");
          }

          const applicationLock = await tx.application.updateMany({
            where: {
              id: application.id,
              status: { in: ["PENDING", "SHORTLISTED"] },
            },
            data: { updatedAt: new Date() },
          });

          if (applicationLock.count === 0) {
            throw new Error("Application has already been processed");
          }

          if (application.campaign.status !== "ACTIVE") {
            throw new Error("Campaign is not active");
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
            throw new Error("A deal already exists for this influencer");
          }

          const dealAmount = Math.max(
            application.proposedRate || 0,
            application.campaign.perInfluencerBudget || 0,
          );
          if (dealAmount <= 0) {
            throw new Error(
              "Cannot accept application without a valid per-influencer budget",
            );
          }

          const committed = await tx.deal.aggregate({
            where: {
              campaignId: application.campaignId,
              deletedAt: null,
              status: { not: "CANCELLED" },
            },
            _sum: {
              amount: true,
            },
          });

          const alreadyCommitted = committed._sum.amount || 0;
          if (alreadyCommitted + dealAmount > application.campaign.totalBudget) {
            throw new Error(
              "Campaign budget exceeded. Increase budget or reject other deals first.",
            );
          }

          const wallet = await tx.wallet.findUnique({
            where: { userId },
            select: { id: true, pendingBalance: true },
          });
          if (!wallet || wallet.pendingBalance < dealAmount) {
            throw new Error(
              "Insufficient held campaign funds. Please top up and reactivate campaign budget.",
            );
          }

          const brandFee = await resolveBrandPlatformFee(userId);
          const paymentAmounts = calculateTotalAmount(
            dealAmount,
            brandFee.effectivePlatformFee,
          );

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
            },
            {
              rate: dealAmount,
              message: application.proposal,
              platformFee: paymentAmounts.platformFee,
              gatewayFee: paymentAmounts.gatewayFee,
              totalAmount: paymentAmounts.totalAmount,
              platformFeePercent: paymentAmounts.platformFeePercent,
              influencerPayout: paymentAmounts.influencerReceives,
            },
          );

          const deal = await tx.deal.create({
            data: {
              campaignId: application.campaignId,
              influencerId: application.influencerId,
              brandId: brandProfile.id,
              amount: dealAmount,
              platformFee: paymentAmounts.platformFee,
              gatewayFee: paymentAmounts.gatewayFee,
              totalAmount: paymentAmounts.totalAmount,
              submissionDeadline: application.campaign.contentDeadline,
              postingDeadline: application.campaign.postingDeadline,
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
            data: { selectedInfluencers: { increment: 1 } },
          });

          await tx.notification.create({
            data: {
              userId: application.influencer.userId,
              type: "deal_update",
              title: "Your application was accepted",
              message: `${brandProfile.companyName} accepted your application for ${application.campaign.title}. Please sign the contract.`,
              data: {
                campaignId: application.campaignId,
                applicationId: application.id,
                dealId: deal.id,
              },
            },
          });

          await tx.activityLog.create({
            data: {
              userId,
              action: "ACCEPT_APPLICATION",
              entityType: "Application",
              entityId: application.id,
              metadata: {
                campaignId: application.campaignId,
                dealId: deal.id,
              },
            },
          });

          return deal;
        },
      );

      logger.info("Application accepted successfully", {
        userId,
        applicationId,
        dealId: result.id,
      });

      return result;
    } catch (error) {
      logger.error("Error accepting application", error, { userId, applicationId });
      throw error;
    }
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
            throw new Error("Brand profile not found");
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
            throw new Error("Application not found");
          }

          if (application.campaign.brandId !== brandProfile.id) {
            throw new Error("Not authorized to reject this application");
          }

          if (!["PENDING", "SHORTLISTED"].includes(application.status)) {
            throw new Error("Only pending applications can be rejected");
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
            throw new Error("Application has already been processed");
          }

          const updatedApplication = await tx.application.findUniqueOrThrow({
            where: { id: application.id },
          });

          await tx.notification.create({
            data: {
              userId: application.influencer.userId,
              type: "deal_update",
              title: "Application update",
              message: `${brandProfile.companyName} rejected your application for ${application.campaign.title}.`,
              data: {
                campaignId: application.campaignId,
                applicationId: application.id,
              },
            },
          });

          await tx.activityLog.create({
            data: {
              userId,
              action: "REJECT_APPLICATION",
              entityType: "Application",
              entityId: application.id,
              metadata: {
                campaignId: application.campaignId,
              },
            },
          });

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
