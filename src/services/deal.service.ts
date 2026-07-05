import { AppError } from "@/lib/errors";
import prisma from "@/lib/db";
import { DealStatus, Prisma, UserType } from "@prisma/client";
import { checkRevisionLimit, ContractTerms } from "@/lib/contract-engine";
import { createActivityLog } from "@/lib/audit";
import { checkPostVerification, checkContentUniqueness, checkAccountPrivacyFlip } from "@/lib/fraud-detection";
import { updateTrustAndLevel } from "@/lib/trust-engine";
import { addUserXp } from "@/lib/gamification-engine";
import { logger } from "@/lib/logger";
import { PaymentService } from "@/services/payment.service";
import { getDealTotalAmount, ACTIVE_DEAL_STATUSES, assertSufficientBalance, getErrorMessage } from "@/lib/utils";
import { invalidate } from "@/lib/cache";
import { sendDealNotificationEmail } from "@/lib/email";
import { redis } from "@/lib/redis";
import { NotificationService } from "@/services/notification.service";
import { recalculateSocialProof } from "@/lib/social-proof-calculator";

async function invalidateDealCache(dealId: string) {
  await invalidate(`deal:${dealId}`);
}

async function lockAndFetchDealForAction(tx: Prisma.TransactionClient, dealId: string) {
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

async function releaseWalletHold(
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

function normalizeMandatoryElements(
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

function formatFraudFlags(flags: { description?: string; rule?: string }[]) {
  return flags
    .map((flag) => flag.description || flag.rule || "Verification failed")
    .join(", ");
}

function validateShippingAddress(value: unknown): Prisma.InputJsonValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw AppError.badRequest("Shipping address is required");
  }

  const input = value as Record<string, unknown>;
  const address = {
    fullName: String(input.fullName || "").trim(),
    phone: String(input.phone || "").trim(),
    line1: String(input.line1 || "").trim(),
    line2: input.line2 ? String(input.line2).trim() : null,
    city: String(input.city || "").trim(),
    state: String(input.state || "").trim(),
    pinCode: String(input.pinCode || "").trim(),
    country: String(input.country || "India").trim(),
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

export class DealService {
  private static async refundRejectPendingInvite(tx: Prisma.TransactionClient, deal: any) {
    if (deal.brand?.userId && deal.reservedFromWallet) {
      const refundAmount = getDealTotalAmount(deal);
      const isCampaignPoolRefund = !deal.campaign.isDirectInvite;
      await releaseWalletHold(
        tx,
        deal.brand.userId,
        deal.id,
        refundAmount,
        `Refund for rejected invite: ${deal.campaign.title}`,
        {
          balanceImpact: !isCampaignPoolRefund,
          source: isCampaignPoolRefund
            ? "campaign_pool_refund"
            : "direct_invite_refund",
        },
        isCampaignPoolRefund ? "INCREMENT_PENDING" : "INCREMENT_BALANCE"
      );
    } else if (deal.campaign.isDirectInvite && deal.brand?.userId) {
      await releaseWalletHold(
        tx,
        deal.brand.userId,
        deal.id,
        getDealTotalAmount(deal),
        `Refund for rejected invite: ${deal.campaign.title}`,
        undefined,
        "SHIFT_PENDING_TO_BALANCE"
      );
    } else if (deal.brand?.userId) {
      // Fallback case: reservedFromWallet = false and !isDirectInvite
      await releaseWalletHold(
        tx,
        deal.brand.userId,
        deal.id,
        getDealTotalAmount(deal),
        `Refund for rejected deal signature: ${deal.campaign.title}`,
        {
          balanceImpact: true,
          source: "non_wallet_pool_refund",
        },
        "SHIFT_PENDING_TO_BALANCE"
      );
    }
  }

  private static async cancelCampaignForDirectInvite(tx: Prisma.TransactionClient, deal: any) {
    if (deal.campaign.isDirectInvite) {
      await tx.campaign.update({
        where: { id: deal.campaignId },
        data: { status: "CANCELLED", deletedAt: new Date() },
      });

      if (deal.campaign.brandId && deal.campaign.status === "ACTIVE") {
        await tx.brandProfile.updateMany({
          where: {
            id: deal.campaign.brandId,
            activeCampaigns: { gt: 0 },
          },
          data: {
            activeCampaigns: { decrement: 1 },
          },
        });
      }
    }
  }

  private static async sendAutoApproveEmails(deal: any) {
    try {
      const [influencerUser, brandUser] = await Promise.all([
        prisma.user.findUnique({ where: { id: deal.influencer.userId }, select: { email: true } }),
        deal.brand?.userId
          ? prisma.user.findUnique({ where: { id: deal.brand.userId }, select: { email: true } })
          : null
      ]);

      if (influencerUser?.email) {
        await sendDealNotificationEmail(
          influencerUser.email,
          deal.campaign.title,
          `Your content for "${deal.campaign.title}" was auto-approved because the brand's review window expired.`
        );
      }

      if (brandUser?.email) {
        await sendDealNotificationEmail(
          brandUser.email,
          deal.campaign.title,
          `Content for "${deal.campaign.title}" was auto-approved because your ${deal.reviewPeriodHours || 48}-hour brand review window expired.`
        );
      }
    } catch (mailErr) {
      logger.warn("Auto-approval email notification failed - non-fatal", { error: mailErr, dealId: deal.id });
    }
  }

  private static async autoApproveDealTx(deal: any, now: Date, latestSubmission: any): Promise<boolean> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const submissionUpdate = await tx.contentSubmission.updateMany({
        where: { id: latestSubmission.id, status: "PENDING" },
        data: { status: "APPROVED", reviewedAt: now },
      });

      if (submissionUpdate.count === 0) return false;

      const dealUpdate = await tx.deal.updateMany({
        where: { id: deal.id, status: "CONTENT_SUBMITTED" },
        data: {
          status: "CONTENT_APPROVED",
          approvedAt: now,
          rejectionReason: null,
        },
      });

      if (dealUpdate.count === 0) return false;

      await NotificationService.createNotification({
        userId: deal.influencer.userId,
        type: "deal_update",
        title: "Content auto-approved",
        message: `Your content for "${deal.campaign.title}" was auto-approved after the brand review window expired.`,
        data: { link: `/dashboard/deals/${deal.id}` },
      }, tx);

      if (deal.brand?.userId) {
        await NotificationService.createNotification({
          userId: deal.brand.userId,
          type: "deal_update",
          title: "Review window expired",
          message: `Content for "${deal.campaign.title}" was auto-approved because the review window expired.`,
          data: { link: `/dashboard/deals/${deal.id}` },
        }, tx);
      }

      return true;
    });
  }


  static async listDeals(
    userId: string,
    userType: UserType | string,
    params: {
      status?: string;
      page: number;
      limit: number;
    },
  ) {
    try {
      const page = Math.max(1, params.page || 1);
      const limit = Math.min(50, Math.max(1, params.limit || 10));

      const where: Prisma.DealWhereInput = { deletedAt: null };

      if (params.status) where.status = params.status as DealStatus;

      // Scope by user type
      const statsWhere: Prisma.DealWhereInput = { deletedAt: null };
      if (userType === "INFLUENCER") {
        const profile = await prisma.influencerProfile.findUnique({
          where: { userId },
          select: { id: true },
        });
        if (!profile) return { deals: [], total: 0, totalPages: 0, stats: { active: 0, completed: 0, totalEarnings: 0 } };
        where.influencerId = profile.id;
        statsWhere.influencerId = profile.id;
      } else if (userType === "BRAND") {
        const profile = await prisma.brandProfile.findUnique({
          where: { userId },
          select: { id: true },
        });
        if (!profile) return { deals: [], total: 0, totalPages: 0, stats: { active: 0, completed: 0, totalEarnings: 0 } };
        where.brandId = profile.id;
        statsWhere.brandId = profile.id;
      }

      logger.info("Listing deals", { userId, userType, filters: where, page });

      const [deals, total, activeCount, completedCount, earningsAggregation] = await Promise.all([
        prisma.deal.findMany({
          where,
          include: {
            campaign: { select: { id: true, title: true, deliverables: true } },
            influencer: {
              select: {
                id: true,
                displayName: true,
                avatar: true,
                instagramHandle: true,
              },
            },
            brand: { select: { id: true, companyName: true, logo: true } },
            contentSubmissions: { orderBy: { version: "desc" }, take: 1 },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.deal.count({ where }),
        prisma.deal.count({
          where: {
            ...statsWhere,
            status: {
              in: ACTIVE_DEAL_STATUSES as DealStatus[],
            },
          },
        }),
        prisma.deal.count({
          where: {
            ...statsWhere,
            status: "COMPLETED",
          },
        }),
        prisma.deal.aggregate({
          where: {
            ...statsWhere,
            status: "COMPLETED",
          },
          _sum: {
            influencerPayout: true,
          },
        }),
      ]);

      const stats = {
        active: activeCount,
        completed: completedCount,
        totalEarnings: earningsAggregation._sum.influencerPayout || 0,
      };

      return { deals, total, totalPages: Math.ceil(total / limit), stats };
    } catch (error) {
      logger.error("Error listing deals", error, { userId });
      throw AppError.badRequest("Failed to list deals");
    }
  }

  static async submitContent(
    userId: string,
    dealId: string,
    contentUrl: string,
    notes?: string,
    contentUrls?: Array<{ type: string; url: string; status?: string; feedback?: string }>,
  ) {
    try {
      const updatedDeal = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // LOCK: Lock and fetch deal using helper
        const deal = await lockAndFetchDealForAction(tx, dealId);

        if (!deal || deal.influencer.userId !== userId) {
          logger.warn("Unauthorized content submission attempt", {
            userId,
            dealId,
          });
          throw AppError.forbidden("Unauthorized");
        }

        // PAYMENT GUARD: Only allow submission when brand's payment is secured
        // in escrow (PAYMENT_HELD) or when a revision was requested.
        // ACTIVE alone is NOT sufficient — it means contract signed but no payment yet.
        if (
          !["PAYMENT_HELD", "REVISION_REQUESTED"].includes(
            deal.status,
          )
        ) {
          throw AppError.badRequest("Payment must be secured before content submission");
        }

        if (
          deal.requiresProduct &&
          deal.productFulfillmentStatus !== "RECEIVED" &&
          deal.status !== "REVISION_REQUESTED"
        ) {
          throw AppError.badRequest("Product must be received before content submission");
        }

        const nextVersion = (deal.contentSubmissions[0]?.version || 0) + 1;

        // Initialize statuses on new submission: all pending unless pre-approved
        const formattedUrls = contentUrls?.map((item) => ({
          type: item.type,
          url: item.url,
          status: item.status || "PENDING",
          feedback: item.feedback || "",
        })) || null;

        // Determine fallback contentUrl for backward-compatibility
        const finalContentUrl = contentUrl || (contentUrls?.[0]?.url) || "";

        await tx.contentSubmission.create({
          data: {
            dealId,
            version: nextVersion,
            contentUrl: finalContentUrl,
            contentUrls: formattedUrls ? (formattedUrls as Prisma.InputJsonValue) : Prisma.DbNull,
            notes: notes ?? null,
            status: "PENDING",
          },
        });

        const updatedDeal = await tx.deal.update({
          where: { id: dealId },
          data: {
            status: "CONTENT_SUBMITTED",
            submittedContentUrl: finalContentUrl,
            submittedAt: new Date(),
          },
        });

        await addUserXp(userId, 15, "CONTENT_SUBMITTED", tx);

        if (deal.brand?.userId) {
          await NotificationService.createNotification({
            userId: deal.brand.userId,
            type: "deal_update",
            title: nextVersion === 1 ? "Content submitted" : `Revision ${nextVersion} submitted`,
            message: `${deal.influencer.displayName || "Influencer"} has submitted ${nextVersion > 1 ? "revised " : ""}content for "${deal.campaign.title}". Please review within 48 hours.`,
            data: { link: `/dashboard/deals/${dealId}` },
          }, tx);
        }

        logger.info("Content submitted successfully", {
          userId,
          dealId,
          version: nextVersion,
        });
        return updatedDeal;
      });

      await invalidateDealCache(dealId);
      return updatedDeal;
    } catch (error) {
      logger.error("Error submitting content", error, { userId, dealId });
      throw error;
    }
  }

  static async requestRevision(
    userId: string,
    dealId: string,
    feedback: string,
  ) {
    const updatedDeal = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // LOCK: Lock and fetch deal using helper
      const deal = await lockAndFetchDealForAction(tx, dealId);

      if (!deal) throw AppError.notFound("Deal not found");
      const ownerId = deal.brand?.userId;
      if (ownerId !== userId) throw AppError.forbidden("Unauthorized");

      if (deal.status !== "CONTENT_SUBMITTED")
        throw AppError.badRequest("No content to review");

      const contract = deal.contractTerms as unknown as ContractTerms;
      const limitCheck = checkRevisionLimit(
        { revisionsUsed: deal.revisionsUsed, maxRevisions: deal.maxRevisions },
        contract,
      );

      if (!limitCheck.allowed)
        throw AppError.badRequest(limitCheck.message || "Maximum revisions reached");

      // If this is a paid extra revision, debit the brand wallet
      if (limitCheck.cost > 0) {
        const brandWallet = await tx.wallet.findUnique({
          where: { userId },
          select: { id: true, balance: true },
        });
        assertSufficientBalance(brandWallet, limitCheck.cost);
        if (!brandWallet) {
          throw AppError.notFound("Brand wallet not found");
        }
        await tx.wallet.update({
          where: { id: brandWallet.id },
          data: { balance: { decrement: limitCheck.cost } },
        });
        await tx.transaction.create({
          data: {
            walletId: brandWallet.id,
            dealId,
            type: "DEBIT",
            amount: limitCheck.cost,
            status: "COMPLETED",
            description: `Extra revision fee for deal: ${dealId} (revision #${deal.revisionsUsed + 1})`,
            metadata: {
              source: "extra_revision_charge",
              revisionNumber: deal.revisionsUsed + 1,
              costPerExtraRevision: contract.costPerExtraRevision,
            },
          },
        });
        logger.info("Extra revision charged to brand", {
          dealId,
          brandUserId: userId,
          cost: limitCheck.cost,
          revisionNumber: deal.revisionsUsed + 1,
        });
      }

      const latestSubmission = deal.contentSubmissions[0];
      if (!latestSubmission) throw AppError.badRequest("No content submission found");

      await tx.contentSubmission.update({
        where: { id: latestSubmission.id },
        data: {
          status: "REVISION_REQUESTED",
          feedback,
          reviewedAt: new Date(),
        },
      });

      return await tx.deal.update({
        where: { id: dealId },
        data: {
          status: "REVISION_REQUESTED",
          revisionsUsed: { increment: 1 },
          rejectionReason: feedback,
        },
      });
    });

    await invalidateDealCache(dealId);
    return updatedDeal;
  }

  static async rejectPendingInvite(
    userId: string,
    dealId: string,
    reason?: string,
  ) {
    const reasonText =
      reason?.trim() || "Invite rejected by influencer before signing.";

    const updatedDeal = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // LOCK: Lock and fetch deal using helper
      const deal = await lockAndFetchDealForAction(tx, dealId);

      if (deal.influencer.userId !== userId) {
        logger.warn("Unauthorized invite rejection attempt", { userId, dealId });
        throw AppError.forbidden("Unauthorized");
      }

      if (deal.status !== "PENDING_SIGNATURE") {
        throw AppError.badRequest("Only pending signature invites can be rejected");
      }

      await tx.deal.update({
        where: { id: dealId },
        data: {
          status: "CANCELLED",
          rejectionReason: reasonText,
        },
      });

      await tx.application.updateMany({
        where: {
          campaignId: deal.campaignId,
          influencerId: deal.influencerId,
          status: "SELECTED",
        },
        data: {
          status: "WITHDRAWN",
          rejectionReason: reasonText,
        },
      });

      await tx.campaign.updateMany({
        where: { id: deal.campaignId, selectedInfluencers: { gt: 0 } },
        data: {
          selectedInfluencers: { decrement: 1 },
          reservedAmount: { decrement: deal.amount },
          reservedTotalAmount: { decrement: getDealTotalAmount(deal) },
        },
      });

      await this.refundRejectPendingInvite(tx, deal);
      await this.cancelCampaignForDirectInvite(tx, deal);

      if (deal.brand?.userId) {
        await NotificationService.createNotification({
          userId: deal.brand.userId,
          type: "deal_update",
          title: "Invite rejected",
          message: `${deal.influencer.displayName} rejected the invite for ${deal.campaign.title}.`,
          data: { link: `/dashboard/deals/${dealId}` },
        }, tx);
      }

      await createActivityLog({
        userId,
        action: "REJECT_DEAL_INVITE",
        entityType: "Deal",
        entityId: dealId,
        metadata: {
          campaignId: deal.campaignId,
          directInvite: deal.campaign.isDirectInvite,
          reason: reasonText,
        },
      }, tx);

      return await tx.deal.findUniqueOrThrow({ where: { id: dealId } });
    });

    await invalidateDealCache(dealId);
    return updatedDeal;
  }

  static async submitShippingAddress(
    userId: string,
    dealId: string,
    address: unknown,
  ) {
    const shippingAddress = validateShippingAddress(address);

    const updatedDeal = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const deal = await lockAndFetchDealForAction(tx, dealId);

      if (deal.influencer.userId !== userId) throw AppError.forbidden("Unauthorized");
      if (!deal.requiresProduct) throw AppError.badRequest("This deal does not require product shipping");
      if (!["ADDRESS_PENDING", "READY_TO_DISPATCH"].includes(deal.productFulfillmentStatus)) {
        throw AppError.badRequest("Shipping address cannot be changed after dispatch");
      }

      const updated = await tx.deal.update({
        where: { id: dealId },
        data: {
          shippingAddress,
          productFulfillmentStatus: "READY_TO_DISPATCH",
        },
      });

      if (deal.brand?.userId) {
        await NotificationService.createNotification({
          userId: deal.brand.userId,
          type: "deal_update",
          title: "Shipping address received",
          message: `${deal.influencer.displayName || "Influencer"} added a shipping address for "${deal.campaign.title}".`,
          data: { link: `/dashboard/deals/${dealId}` },
        }, tx);
      }

      return updated;
    });

    await invalidateDealCache(dealId);
    return updatedDeal;
  }

  static async confirmProductDispatch(
    userId: string,
    dealId: string,
    data: { trackingNumber: string; carrier?: string },
  ) {
    const trackingNumber = data.trackingNumber.trim();
    const carrier = data.carrier?.trim();
    if (!trackingNumber || trackingNumber.length > 120) {
      throw AppError.badRequest("Tracking number is required");
    }

    const updatedDeal = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const deal = await lockAndFetchDealForAction(tx, dealId);

      if (deal.brand?.userId !== userId) throw AppError.forbidden("Unauthorized");
      if (!deal.requiresProduct) throw AppError.badRequest("This deal does not require product shipping");
      if (deal.productFulfillmentStatus !== "READY_TO_DISPATCH" || !deal.shippingAddress) {
        throw AppError.badRequest("Influencer shipping address is required before dispatch");
      }

      const updated = await tx.deal.update({
        where: { id: dealId },
        data: {
          dispatchTrackingNumber: trackingNumber,
          dispatchCarrier: carrier || null,
          dispatchedAt: new Date(),
          productFulfillmentStatus: "DISPATCHED",
        },
      });

      await NotificationService.createNotification({
        userId: deal.influencer.userId,
        type: "deal_update",
        title: "Product dispatched",
        message: `${deal.brand?.companyName || "Brand"} dispatched the product for "${deal.campaign.title}". Please confirm once received.`,
        data: { link: `/dashboard/deals/${dealId}` },
      }, tx);

      return updated;
    });

    await invalidateDealCache(dealId);
    return updatedDeal;
  }

  static async confirmProductReceived(userId: string, dealId: string) {
    const updatedDeal = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const deal = await lockAndFetchDealForAction(tx, dealId);

      if (deal.influencer.userId !== userId) throw AppError.forbidden("Unauthorized");
      if (!deal.requiresProduct) throw AppError.badRequest("This deal does not require product shipping");
      if (deal.productFulfillmentStatus !== "DISPATCHED") {
        throw AppError.badRequest("Product must be dispatched before it can be marked received");
      }

      const updated = await tx.deal.update({
        where: { id: dealId },
        data: {
          productFulfillmentStatus: "RECEIVED",
          productReceivedAt: new Date(),
        },
      });

      if (deal.brand?.userId) {
        await NotificationService.createNotification({
          userId: deal.brand.userId,
          type: "deal_update",
          title: "Product received",
          message: `${deal.influencer.displayName || "Influencer"} confirmed product receipt for "${deal.campaign.title}".`,
          data: { link: `/dashboard/deals/${dealId}` },
        }, tx);
      }

      return updated;
    });

    await invalidateDealCache(dealId);
    return updatedDeal;
  }

  static async approveContent(userId: string, dealId: string) {
    // Legacy support: approve all deliverables
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        contentSubmissions: { orderBy: { version: "desc" }, take: 1 },
      },
    });
    if (!deal) throw AppError.notFound("Deal not found");
    const latestSubmission = deal.contentSubmissions[0];
    if (!latestSubmission) throw AppError.badRequest("No submission found");

    let reviews: Array<{ type: string; status: "APPROVED"; feedback?: string }> = [];
    if (latestSubmission.contentUrls) {
      const urls = latestSubmission.contentUrls as Array<{ type: string }>;
      reviews = urls.map(item => ({ type: item.type, status: "APPROVED" }));
    } else {
      reviews = [{ type: "GENERIC", status: "APPROVED" }];
    }

    return this.reviewContent(userId, dealId, reviews);
  }
  private static validateAndGetSubmissionUrls(deal: any) {
    if (deal.status !== "CONTENT_SUBMITTED") {
      throw AppError.badRequest("No content to review");
    }

    const latestSubmission = deal.contentSubmissions[0];
    if (!latestSubmission) throw AppError.badRequest("No content submission found");

    let currentUrls: Array<{ type: string; url: string; status: string; feedback: string }> = [];
    if (latestSubmission.contentUrls) {
      currentUrls = structuredClone(latestSubmission.contentUrls);
    } else {
      currentUrls = [
        {
          type: "GENERIC",
          url: latestSubmission.contentUrl,
          status: "PENDING",
          feedback: "",
        },
      ];
    }
    return { latestSubmission, currentUrls };
  }

  private static processContentUrlsReview(
    currentUrls: Array<{ type: string; url: string; status: string; feedback: string }>,
    reviews: Array<{ type: string; status: "APPROVED" | "REVISION_REQUESTED"; feedback?: string | undefined }>
  ) {
    let overallApproved = true;
    let hasRevision = false;

    const updatedUrls = currentUrls.map((item) => {
      const review = reviews.find((r) => r.type === item.type);
      if (review) {
        if (review.status === "REVISION_REQUESTED") {
          overallApproved = false;
          hasRevision = true;
        }
        return {
          ...item,
          status: review.status,
          feedback: review.feedback || "",
        };
      }
      if (item.status !== "APPROVED") {
        overallApproved = false;
        if (item.status === "REVISION_REQUESTED") {
          hasRevision = true;
        }
      }
      return item;
    });

    return { updatedUrls, overallApproved, hasRevision };
  }

  private static async handleRevisionCharge(
    tx: Prisma.TransactionClient,
    deal: any,
    userId: string,
    dealId: string
  ) {
    const contract = deal.contractTerms as unknown as ContractTerms;
    const limitCheck = checkRevisionLimit(
      { revisionsUsed: deal.revisionsUsed, maxRevisions: deal.maxRevisions },
      contract
    );

    if (!limitCheck.allowed) {
      throw AppError.badRequest(limitCheck.message || "Maximum revisions reached");
    }

    if (limitCheck.cost > 0) {
      const brandWallet = await tx.wallet.findUnique({
        where: { userId },
        select: { id: true, balance: true },
      });
      assertSufficientBalance(brandWallet, limitCheck.cost);
      if (!brandWallet) {
        throw AppError.notFound("Brand wallet not found");
      }
      await tx.wallet.update({
        where: { id: brandWallet.id },
        data: { balance: { decrement: limitCheck.cost } },
      });
      await tx.transaction.create({
        data: {
          walletId: brandWallet.id,
          dealId,
          type: "DEBIT",
          amount: limitCheck.cost,
          status: "COMPLETED",
          description: `Extra revision fee for deal: ${dealId} (revision #${deal.revisionsUsed + 1})`,
          metadata: {
            source: "extra_revision_charge",
            revisionNumber: deal.revisionsUsed + 1,
            costPerExtraRevision: contract.costPerExtraRevision,
          },
        },
      });
    }
  }

  static async reviewContent(
    userId: string,
    dealId: string,
    reviews: Array<{ type: string; status: "APPROVED" | "REVISION_REQUESTED"; feedback?: string | undefined }>,
  ) {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const deal = await lockAndFetchDealForAction(tx, dealId);
      if (!deal) throw AppError.notFound("Deal not found");

      const ownerId = deal.brand?.userId;
      if (ownerId !== userId) throw AppError.forbidden("Unauthorized");

      const { latestSubmission, currentUrls } = this.validateAndGetSubmissionUrls(deal);
      const { updatedUrls, overallApproved, hasRevision } = this.processContentUrlsReview(
        currentUrls,
        reviews
      );

      let updatedStatus: "CONTENT_APPROVED" | "REVISION_REQUESTED" = "CONTENT_APPROVED";

      if (hasRevision) {
        updatedStatus = "REVISION_REQUESTED";
        await this.handleRevisionCharge(tx, deal, userId, dealId);
      } else if (!overallApproved) {
        return {
          success: true,
          statusUpdated: false,
          dealStatus: deal.status,
        };
      }

      const allFeedback = updatedUrls
        .filter((item) => item.status === "REVISION_REQUESTED" && item.feedback)
        .map((item) => `[${item.type}]: ${item.feedback}`)
        .join(" | ");

      await tx.contentSubmission.update({
        where: { id: latestSubmission.id },
        data: {
          status: updatedStatus === "CONTENT_APPROVED" ? "APPROVED" : "REVISION_REQUESTED",
          contentUrls: updatedUrls as Prisma.InputJsonValue,
          feedback: allFeedback || null,
          reviewedAt: new Date(),
        },
      });

      const dealUpdatePayload: Prisma.DealUpdateInput = {
        status: updatedStatus,
        rejectionReason: updatedStatus === "REVISION_REQUESTED" ? allFeedback : null,
      };
      if (updatedStatus === "CONTENT_APPROVED") {
        dealUpdatePayload.approvedAt = new Date();
      }
      if (updatedStatus === "REVISION_REQUESTED") {
        dealUpdatePayload.revisionsUsed = { increment: 1 };
      }

      await tx.deal.update({
        where: { id: dealId },
        data: dealUpdatePayload,
      });

      if (deal.influencer?.userId) {
        await NotificationService.createNotification({
          userId: deal.influencer.userId,
          type: "deal_update",
          title: updatedStatus === "CONTENT_APPROVED" ? "Content Approved" : "Revision Requested",
          message: updatedStatus === "CONTENT_APPROVED"
            ? `Your content submission for "${deal.campaign.title}" was approved.`
            : `The brand has requested revision on your submission for "${deal.campaign.title}".`,
          data: { link: `/dashboard/deals/${dealId}` },
        }, tx);
      }

      return {
        success: true,
        statusUpdated: true,
        dealStatus: updatedStatus,
        ownerId,
        influencerUserId: deal.influencer.userId,
        requiresPostVerification: deal.requiresPostVerification,
      };
    });

    if (result.statusUpdated && result.dealStatus === "CONTENT_APPROVED") {
      if (result.influencerUserId) {
        await updateTrustAndLevel(result.influencerUserId, "DEAL_COMPLETED");
        recalculateSocialProof(result.influencerUserId).catch((err) => {
          logger.warn("[SocialProof] Real-time recalc failed after deal completion", {
            userId: result.influencerUserId,
            error: err,
          });
        });
      }

      await invalidateDealCache(dealId);

      if (result.requiresPostVerification === false) {
        try {
          await PaymentService.processDealCompletion(dealId);
          await invalidateDealCache(dealId);
        } catch (error) {
          logger.error("Failed to process deal payment immediately for no-verification deal", {
            dealId,
            error,
          });
        }
      }
    } else {
      await invalidateDealCache(dealId);
    }

    return { success: true };
  }

  private static async autoApproveSingleExpiredDeal(deal: any, now: Date): Promise<boolean> {
    const latestSubmission = deal.contentSubmissions[0];
    if (!latestSubmission || latestSubmission.status !== "PENDING") {
      return false;
    }

    const updated = await this.autoApproveDealTx(deal, now, latestSubmission);

    if (updated) {
      await invalidateDealCache(deal.id);

      if (deal.requiresPostVerification === false) {
        try {
          await PaymentService.processDealCompletion(deal.id);
          await invalidateDealCache(deal.id);
        } catch (error) {
          logger.error("Failed to process auto-approved deal payment immediately", {
            dealId: deal.id,
            error,
          });
        }
      }

      this.sendAutoApproveEmails(deal).catch(() => {});
      return true;
    }
    return false;
  }

  static async autoApproveExpiredContent(now: Date = new Date()) {
    const lockKey = "cron:auto_approve_expired_content:lock";
    const acquired = await redis.set(lockKey, "LOCKED", "EX", 300, "NX");
    if (!acquired) {
      logger.info("autoApproveExpiredContent already running, skipping to avoid race condition.");
      return { processed: 0, skipped: 0, scanned: 0, locked: true };
    }

    try {
      // Batch processing to prevent OOM - process 200 deals at a time
      const BATCH_SIZE = 200;
      let processed = 0;
      let skipped = 0;
      let scanned = 0;
      let hasMore = true;
      let cursor: Date | undefined = undefined;

      while (hasMore) {
        const candidateDeals = await prisma.deal.findMany({
          where: {
            status: "CONTENT_SUBMITTED",
            submittedAt: { not: null },
            deletedAt: null,
            ...(cursor ? { submittedAt: { lt: cursor } } : {}),
          },
          select: {
            id: true,
            submittedAt: true,
            reviewPeriodHours: true,
            requiresPostVerification: true,
            campaign: { select: { title: true } },
            influencer: { select: { userId: true } },
            brand: { select: { userId: true } },
            contentSubmissions: {
              orderBy: { version: "desc" },
              take: 1,
              select: { id: true, status: true },
            },
          },
          orderBy: { submittedAt: "desc" },
          take: BATCH_SIZE,
        });

        scanned += candidateDeals.length;
        hasMore = candidateDeals.length === BATCH_SIZE;

        if (candidateDeals.length > 0) {
          cursor = candidateDeals[candidateDeals.length - 1]?.submittedAt as Date;
        }

        const expiredDeals = candidateDeals.filter((deal: {
          submittedAt: Date | null;
          reviewPeriodHours: number;
        }) => {
          if (!deal.submittedAt) return false;
          const reviewWindowMs =
            Math.max(deal.reviewPeriodHours || 48, 1) * 60 * 60 * 1000;
          return now.getTime() - deal.submittedAt.getTime() >= reviewWindowMs;
        });

        let batchSkipped = 0;

        for (const deal of expiredDeals) {
          const approved = await this.autoApproveSingleExpiredDeal(deal, now);
          if (approved) {
            processed += 1;
          } else {
            batchSkipped += 1;
          }
        }

        skipped += batchSkipped;
      }

      return {
        processed,
        skipped,
        scanned,
      };
    } finally {
      await redis.del("cron:auto_approve_expired_content:lock");
    }
  }

  static async verifyPost(userId: string, dealId: string, postUrl: string): Promise<{ success: boolean; status: "VERIFIED" | "VERIFICATION_PENDING" }> {
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: { influencer: { select: { userId: true } }, campaign: true },
    });

    if (!deal || deal.influencer.userId !== userId)
      throw AppError.forbidden("Unauthorized");
    if (!["CONTENT_APPROVED", "POSTED"].includes(deal.status))
      throw AppError.badRequest("Content must be approved before posting");

    const contractTerms = deal.contractTerms as {
      mandatoryElements?: unknown;
      mandatoryTags?: unknown;
    } | null;
    const mandatoryElements = normalizeMandatoryElements(contractTerms);
    const verificationResult = await checkPostVerification({
      dealId: deal.id,
      influencerUserId: deal.influencer.userId,
      postUrl,
      requiredTags: mandatoryElements.filter((element) => !element.startsWith("#")),
      requiredHashtags: mandatoryElements.filter((element) => element.startsWith("#")),
      postingDeadline: deal.postingDeadline,
    });

    let isBlocked = verificationResult.action === "BLOCK";
    let needsReview = verificationResult.action === "REVIEW" || !verificationResult.passed;
    const verificationFlags = [...verificationResult.flags];

    // Check content uniqueness to detect duplication/theft
    if (deal.verificationHash) {
      const uniquenessResult = await checkContentUniqueness(deal.verificationHash, deal.id);
      if (uniquenessResult.action === "BLOCK") {
        isBlocked = true;
      }
      if (uniquenessResult.action === "REVIEW" || uniquenessResult.action === "FLAG" || !uniquenessResult.passed) {
        needsReview = true;
      }
      verificationFlags.push(...uniquenessResult.flags);
    }

    // Check account privacy flip to detect post visibility evasion
    const privacyResult = await checkAccountPrivacyFlip(deal.influencer.userId, postUrl);
    if (privacyResult.action === "BLOCK") {
      isBlocked = true;
    }
    if (privacyResult.action === "REVIEW" || privacyResult.action === "FLAG" || !privacyResult.passed) {
      needsReview = true;
    }
    verificationFlags.push(...privacyResult.flags);

    // BLOCK: hard failure — influencer cannot proceed
    if (isBlocked) {
      throw AppError.badRequest(`Post verification failed: ${formatFraudFlags(verificationFlags)}`,
      );
    }

    const resultStatus = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // LOCK THE DEAL ROW to prevent race conditions during verification using raw SQL SELECT FOR UPDATE
      await tx.$queryRaw`SELECT id FROM "Deal" WHERE id = ${dealId} FOR UPDATE`;
      const lockedDeal = await tx.deal.findUnique({
        where: { id: dealId },
      });

      if (!lockedDeal) {
        throw AppError.notFound("Deal not found");
      }

      if (!["CONTENT_APPROVED", "POSTED"].includes(lockedDeal.status)) {
        throw AppError.badRequest("Deal must be in CONTENT_APPROVED or POSTED status. It might have already been verified.");
      }

      const finalStatus = needsReview ? "VERIFICATION_PENDING" : "VERIFIED";

      const updated = await tx.deal.update({
        where: { id: dealId },
        data: {
          status: finalStatus,
          postUrl,
          postedAt: new Date(),
          ...(needsReview ? {} : { verifiedAt: new Date() }),
        },
      });

      return updated.status;
    });

    await invalidateDealCache(dealId);

    if (resultStatus === "VERIFIED") {
      // Process Payment (Capture & Credit)
      try {
        await PaymentService.processDealCompletion(dealId);
        await invalidateDealCache(dealId);
      } catch (error: unknown) {
        const errMessage = getErrorMessage(error);
        if (errMessage === "LATE_POST_PAYMENT_BLOCKED") {
          // Influencer posted after deadline — payout intentionally blocked.
          // CRITICAL: Funds are now stuck in escrow. Admin must manually review
          // this deal and either issue a payout override or refund the brand.
          logger.critical("LATE_POST_PAYOUT_STUCK: Deal VERIFIED but payment blocked — admin action required", {
            dealId,
            error: errMessage,
          });
        } else {
          logger.error("Failed to process deal payment immediately", {
            dealId,
            error,
          });
          // Don't fail the verification request; the reconcile-payouts cron will retry
        }
      }
    }

    return { success: true, status: resultStatus as "VERIFIED" | "VERIFICATION_PENDING" };
  }
}
