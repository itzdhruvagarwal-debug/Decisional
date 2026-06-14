import prisma from "@/lib/db";
import { Prisma, UserType } from "@prisma/client";
import { checkRevisionLimit, ContractTerms } from "@/lib/contract-engine";
import { checkPostVerification } from "@/lib/fraud-detection";
import { updateTrustAndLevel } from "@/lib/trust-engine";
import { addUserXp } from "@/lib/gamification-engine";
import { logger } from "@/lib/logger";
import { PaymentService } from "@/services/payment.service";
import { invalidate } from "@/lib/cache";
import { sendDealNotificationEmail } from "@/lib/email";

async function invalidateDealCache(dealId: string) {
  await invalidate(`deal:${dealId}`);
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
    throw new Error("Shipping address is required");
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
    throw new Error("Complete Indian shipping address with valid phone and PIN is required");
  }

  return address as Prisma.InputJsonValue;
}

export class DealService {
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

      const where: any = {};

      if (params.status) where.status = params.status;

      // Scope by user type
      if (userType === "INFLUENCER") {
        const profile = await prisma.influencerProfile.findUnique({
          where: { userId },
          select: { id: true },
        });
        if (!profile) return { deals: [], total: 0 };
        where.influencerId = profile.id;
      } else if (userType === "BRAND") {
        const profile = await prisma.brandProfile.findUnique({
          where: { userId },
          select: { id: true },
        });
        if (!profile) return { deals: [], total: 0 };
        where.brandId = profile.id;
      }

      logger.info("Listing deals", { userId, userType, filters: where, page });

      const [deals, total] = await Promise.all([
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
      ]);

      return { deals, total, totalPages: Math.ceil(total / limit) };
    } catch (error) {
      logger.error("Error listing deals", error, { userId });
      throw new Error("Failed to list deals");
    }
  }

  static async submitContent(
    userId: string,
    dealId: string,
    contentUrl: string,
    notes?: string,
  ) {
    try {
      const updatedDeal = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // LOCK: Update deal to lock the row and fetch fresh data
        const deal = await tx.deal.update({
          where: { id: dealId },
          data: { updatedAt: new Date() },
          include: {
            influencer: { select: { userId: true, displayName: true } },
            brand: { select: { userId: true } },
            campaign: { select: { title: true } },
            contentSubmissions: { orderBy: { version: "desc" }, take: 1 },
          },
        });

        if (!deal || deal.influencer.userId !== userId) {
          logger.warn("Unauthorized content submission attempt", {
            userId,
            dealId,
          });
          throw new Error("Unauthorized");
        }

        // PAYMENT GUARD: Only allow submission when brand's payment is secured
        // in escrow (PAYMENT_HELD) or when a revision was requested.
        // ACTIVE alone is NOT sufficient — it means contract signed but no payment yet.
        if (
          !["PAYMENT_HELD", "REVISION_REQUESTED"].includes(
            deal.status,
          )
        ) {
          throw new Error("Payment must be secured before content submission");
        }

        if (
          deal.requiresProduct &&
          deal.productFulfillmentStatus !== "RECEIVED" &&
          deal.status !== "REVISION_REQUESTED"
        ) {
          throw new Error("Product must be received before content submission");
        }

        const nextVersion = (deal.contentSubmissions[0]?.version || 0) + 1;

        await tx.contentSubmission.create({
          data: {
            dealId,
            version: nextVersion,
            contentUrl,
            notes: notes ?? null,
            status: "PENDING",
          },
        });

        const updatedDeal = await tx.deal.update({
          where: { id: dealId },
          data: {
            status: "CONTENT_SUBMITTED",
            submittedContentUrl: contentUrl,
            submittedAt: new Date(),
          },
        });

        await addUserXp(userId, 15, "CONTENT_SUBMITTED", tx);

        if (deal.brand?.userId) {
          await tx.notification.create({
            data: {
              userId: deal.brand.userId,
              type: "deal_update",
              title: nextVersion === 1 ? "Content submitted" : `Revision ${nextVersion} submitted`,
              message: `${deal.influencer.displayName || "Influencer"} has submitted ${nextVersion > 1 ? "revised " : ""}content for "${deal.campaign.title}". Please review within 48 hours.`,
              data: { link: `/dashboard/deals/${dealId}` },
            },
          });
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
      // LOCK: Update deal to lock row
      const deal = await tx.deal.update({
        where: { id: dealId },
        data: { updatedAt: new Date() },
        include: {
          brand: { select: { userId: true } },
          contentSubmissions: { orderBy: { version: "desc" }, take: 1 },
        },
      });

      if (!deal) throw new Error("Deal not found");
      const ownerId = deal.brand?.userId;
      if (ownerId !== userId) throw new Error("Unauthorized");

      if (deal.status !== "CONTENT_SUBMITTED")
        throw new Error("No content to review");

      const contract = deal.contractTerms as unknown as ContractTerms;
      const limitCheck = checkRevisionLimit(
        { revisionsUsed: deal.revisionsUsed, maxRevisions: deal.maxRevisions },
        contract,
      );

      if (!limitCheck.allowed)
        throw new Error(limitCheck.message || "Maximum revisions reached");

      const latestSubmission = deal.contentSubmissions[0];
      if (!latestSubmission) throw new Error("No content submission found");

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
      const deal = await tx.deal.update({
        where: { id: dealId },
        data: { updatedAt: new Date() },
        include: {
          brand: { select: { id: true, userId: true, companyName: true } },
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
          influencer: {
            select: { id: true, userId: true, displayName: true },
          },
        },
      });

      if (deal.influencer.userId !== userId) {
        logger.warn("Unauthorized invite rejection attempt", { userId, dealId });
        throw new Error("Unauthorized");
      }

      if (deal.status !== "PENDING_SIGNATURE") {
        throw new Error("Only pending signature invites can be rejected");
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
        data: { selectedInfluencers: { decrement: 1 } },
      });

      if (deal.brand?.userId && deal.reservedFromWallet) {
        const wallet = await tx.wallet.findUnique({
          where: { userId: deal.brand.userId },
          select: { id: true },
        });

        if (wallet && deal.amount > 0) {
          await tx.wallet.update({
            where: { id: wallet.id },
            data: {
              balance: { increment: deal.amount },
            },
          });

          await tx.transaction.create({
            data: {
              walletId: wallet.id,
              dealId: deal.id,
              type: "REFUND",
              amount: deal.amount,
              status: "COMPLETED",
              description: `Refund for rejected invite: ${deal.campaign.title}`,
            },
          });
        }
      } else if (deal.campaign.isDirectInvite && deal.brand?.userId) {
        const wallet = await tx.wallet.findUnique({
          where: { userId: deal.brand.userId },
          select: { id: true, pendingBalance: true },
        });

        const refundableAmount = wallet ? Math.min(wallet.pendingBalance, deal.amount) : 0;

        if (wallet && refundableAmount > 0) {
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
              dealId: deal.id,
              type: "REFUND",
              amount: refundableAmount,
              status: "COMPLETED",
              description: `Refund for rejected invite: ${deal.campaign.title}`,
            },
          });
        }
      }

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

      if (deal.brand?.userId) {
        await tx.notification.create({
          data: {
            userId: deal.brand.userId,
            type: "deal_update",
            title: "Invite rejected",
            message: `${deal.influencer.displayName} rejected the invite for ${deal.campaign.title}.`,
            data: { link: `/dashboard/deals/${dealId}` },
          },
        });
      }

      await tx.activityLog.create({
        data: {
          userId,
          action: "REJECT_DEAL_INVITE",
          entityType: "Deal",
          entityId: dealId,
          metadata: {
            campaignId: deal.campaignId,
            directInvite: deal.campaign.isDirectInvite,
            reason: reasonText,
          },
        },
      });

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
      const deal = await tx.deal.update({
        where: { id: dealId },
        data: { updatedAt: new Date() },
        include: {
          influencer: { select: { userId: true, displayName: true } },
          brand: { select: { userId: true } },
          campaign: { select: { title: true } },
        },
      });

      if (deal.influencer.userId !== userId) throw new Error("Unauthorized");
      if (!deal.requiresProduct) throw new Error("This deal does not require product shipping");
      if (!["ADDRESS_PENDING", "READY_TO_DISPATCH"].includes(deal.productFulfillmentStatus)) {
        throw new Error("Shipping address cannot be changed after dispatch");
      }

      const updated = await tx.deal.update({
        where: { id: dealId },
        data: {
          shippingAddress,
          productFulfillmentStatus: "READY_TO_DISPATCH",
        },
      });

      if (deal.brand?.userId) {
        await tx.notification.create({
          data: {
            userId: deal.brand.userId,
            type: "deal_update",
            title: "Shipping address received",
            message: `${deal.influencer.displayName || "Influencer"} added a shipping address for "${deal.campaign.title}".`,
            data: { link: `/dashboard/deals/${dealId}` },
          },
        });
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
      throw new Error("Tracking number is required");
    }

    const updatedDeal = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const deal = await tx.deal.update({
        where: { id: dealId },
        data: { updatedAt: new Date() },
        include: {
          brand: { select: { userId: true, companyName: true } },
          influencer: { select: { userId: true } },
          campaign: { select: { title: true } },
        },
      });

      if (deal.brand?.userId !== userId) throw new Error("Unauthorized");
      if (!deal.requiresProduct) throw new Error("This deal does not require product shipping");
      if (deal.productFulfillmentStatus !== "READY_TO_DISPATCH" || !deal.shippingAddress) {
        throw new Error("Influencer shipping address is required before dispatch");
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

      await tx.notification.create({
        data: {
          userId: deal.influencer.userId,
          type: "deal_update",
          title: "Product dispatched",
          message: `${deal.brand?.companyName || "Brand"} dispatched the product for "${deal.campaign.title}". Please confirm once received.`,
          data: { link: `/dashboard/deals/${dealId}` },
        },
      });

      return updated;
    });

    await invalidateDealCache(dealId);
    return updatedDeal;
  }

  static async confirmProductReceived(userId: string, dealId: string) {
    const updatedDeal = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const deal = await tx.deal.update({
        where: { id: dealId },
        data: { updatedAt: new Date() },
        include: {
          influencer: { select: { userId: true, displayName: true } },
          brand: { select: { userId: true } },
          campaign: { select: { title: true } },
        },
      });

      if (deal.influencer.userId !== userId) throw new Error("Unauthorized");
      if (!deal.requiresProduct) throw new Error("This deal does not require product shipping");
      if (deal.productFulfillmentStatus !== "DISPATCHED") {
        throw new Error("Product must be dispatched before it can be marked received");
      }

      const updated = await tx.deal.update({
        where: { id: dealId },
        data: {
          productFulfillmentStatus: "RECEIVED",
          productReceivedAt: new Date(),
        },
      });

      if (deal.brand?.userId) {
        await tx.notification.create({
          data: {
            userId: deal.brand.userId,
            type: "deal_update",
            title: "Product received",
            message: `${deal.influencer.displayName || "Influencer"} confirmed product receipt for "${deal.campaign.title}".`,
            data: { link: `/dashboard/deals/${dealId}` },
          },
        });
      }

      return updated;
    });

    await invalidateDealCache(dealId);
    return updatedDeal;
  }

  static async approveContent(userId: string, dealId: string) {
    // Return result to match previous signature if needed, or void.
    // Previous returned { success: true }
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // LOCK: Update deal to lock row
      const deal = await tx.deal.update({
        where: { id: dealId },
        data: { updatedAt: new Date() },
        include: {
          brand: { select: { userId: true } },
          influencer: { select: { userId: true } },
          contentSubmissions: { orderBy: { version: "desc" }, take: 1 },
        },
      });

      if (!deal) throw new Error("Deal not found");
      const ownerId = deal.brand?.userId;
      if (ownerId !== userId) throw new Error("Unauthorized");
      if (deal.status !== "CONTENT_SUBMITTED")
        throw new Error("No content to review");

      const latestSubmission = deal.contentSubmissions[0];
      if (!latestSubmission) throw new Error("No content submission found");

      await tx.contentSubmission.update({
        where: { id: latestSubmission.id },
        data: { status: "APPROVED", reviewedAt: new Date() },
      });

      await tx.deal.update({
        where: { id: dealId },
        data: {
          status: "CONTENT_APPROVED",
          approvedAt: new Date(),
        },
      });

      // Recalculate trust after the transaction to keep the row lock short.

      return {
        success: true,
        ownerId,
        influencerUserId: deal.influencer.userId,
        requiresPostVerification: deal.requiresPostVerification,
      };
    });

    if (result.influencerUserId)
      await updateTrustAndLevel(result.influencerUserId, "DEAL_COMPLETED");

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

    return { success: true };
  }

  static async autoApproveExpiredContent(now: Date = new Date()) {
    const candidateDeals = await prisma.deal.findMany({
      where: {
        status: "CONTENT_SUBMITTED",
        submittedAt: { not: null },
        deletedAt: null,
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
    });

    const expiredDeals = candidateDeals.filter((deal: {
      submittedAt: Date | null;
      reviewPeriodHours: number;
    }) => {
      if (!deal.submittedAt) return false;
      const reviewWindowMs =
        Math.max(deal.reviewPeriodHours || 48, 1) * 60 * 60 * 1000;
      return now.getTime() - deal.submittedAt.getTime() >= reviewWindowMs;
    });

    let processed = 0;
    const skipped: string[] = [];

    for (const deal of expiredDeals) {
      const latestSubmission = deal.contentSubmissions[0];
      if (!latestSubmission || latestSubmission.status !== "PENDING") {
        skipped.push(deal.id);
        continue;
      }

      const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

        await tx.notification.create({
          data: {
            userId: deal.influencer.userId,
            type: "deal_update",
            title: "Content auto-approved",
            message: `Your content for "${deal.campaign.title}" was auto-approved after the brand review window expired.`,
            data: { link: `/dashboard/deals/${deal.id}` },
          },
        });

        if (deal.brand?.userId) {
          await tx.notification.create({
            data: {
              userId: deal.brand.userId,
              type: "deal_update",
              title: "Review window expired",
              message: `Content for "${deal.campaign.title}" was auto-approved because the review window expired.`,
              data: { link: `/dashboard/deals/${deal.id}` },
            },
          });
        }

        return true;
      });

      if (updated) {
        processed += 1;
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

        // Dispatch emails asynchronously after transaction commits successfully to avoid blocking the DB pool
        (async () => {
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
        })();
      } else {
        skipped.push(deal.id);
      }
    }

    return {
      processed,
      skipped,
      scanned: candidateDeals.length,
    };
  }

  static async verifyPost(userId: string, dealId: string, postUrl: string): Promise<{ success: boolean; status: "VERIFIED" | "VERIFICATION_PENDING" }> {
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: { influencer: { select: { userId: true } }, campaign: true },
    });

    if (!deal || deal.influencer.userId !== userId)
      throw new Error("Unauthorized");
    if (!["CONTENT_APPROVED", "POSTED"].includes(deal.status))
      throw new Error("Content must be approved before posting");

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

    // BLOCK: hard failure — influencer cannot proceed
    if (verificationResult.action === "BLOCK") {
      throw new Error(
        `Post verification failed: ${formatFraudFlags(verificationResult.flags)}`,
      );
    }

    // REVIEW: post passes but is flagged for admin inspection
    const needsReview =
      verificationResult.action === "REVIEW" || !verificationResult.passed;

    const resultStatus = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // LOCK THE DEAL ROW to prevent race conditions during verification
      const lockedDeal = await tx.deal.update({
        where: { id: dealId },
        data: { updatedAt: new Date() },
      });

      if (!["CONTENT_APPROVED", "POSTED"].includes(lockedDeal.status)) {
        throw new Error("Deal must be in CONTENT_APPROVED or POSTED status. It might have already been verified.");
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
      } catch (error) {
        logger.error("Failed to process deal payment immediately", {
          dealId,
          error,
        });
        // Don't fail the verification request; payment can be retried
      }
    }

    return { success: true, status: resultStatus };
  }
}
