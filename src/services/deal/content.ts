import { addUserXp } from "@/lib/gamification-engine";
import { ContractTerms } from "@/lib/contract-engine";
import { assertSufficientBalance } from "@/lib/utils";
import { updateTrustAndLevel } from "@/lib/trust-engine";
import { recalculateSocialProof } from "@/lib/social-proof-calculator";
import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { checkRevisionLimit } from "@/lib/contract-engine";
import { NotificationService } from "@/services/notification.service";
import { PaymentService } from "@/services/payment.service";
import { logger } from "@/lib/logger";
import { DealWithRelations, invalidateDealCache, lockAndFetchDealForAction } from "./helpers";

export async function submitContent(
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

        if (deal?.influencer.userId !== userId) {
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


export async function approveContent(userId: string, dealId: string) {
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

    return reviewContent(userId, dealId, reviews);
  }
export function validateAndGetSubmissionUrls(deal: DealWithRelations) {
    if (deal.status !== "CONTENT_SUBMITTED") {
      throw AppError.badRequest("No content to review");
    }

    const latestSubmission = deal.contentSubmissions[0];
    if (!latestSubmission) throw AppError.badRequest("No content submission found");

    let currentUrls: Array<{ type: string; url: string; status: string; feedback: string }> = [];
    if (latestSubmission.contentUrls) {
      currentUrls = structuredClone(latestSubmission.contentUrls) as Array<{
        type: string;
        url: string;
        status: string;
        feedback: string;
      }>;
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
export function processContentUrlsReview(
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


export async function handleRevisionCharge(
    tx: Prisma.TransactionClient,
    deal: DealWithRelations,
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


export async function reviewContent(
    userId: string,
    dealId: string,
    reviews: Array<{ type: string; status: "APPROVED" | "REVISION_REQUESTED"; feedback?: string | undefined }>,
  ) {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const deal = await lockAndFetchDealForAction(tx, dealId);
      if (!deal) throw AppError.notFound("Deal not found");

      const ownerId = deal.brand?.userId;
      if (ownerId !== userId) throw AppError.forbidden("Unauthorized");

      const { latestSubmission, currentUrls } = validateAndGetSubmissionUrls(deal);
      const { updatedUrls, overallApproved, hasRevision } = processContentUrlsReview(
        currentUrls,
        reviews
      );

      let updatedStatus: "CONTENT_APPROVED" | "REVISION_REQUESTED" = "CONTENT_APPROVED";

      if (hasRevision) {
        updatedStatus = "REVISION_REQUESTED";
        await handleRevisionCharge(tx, deal, userId, dealId);
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
        await updateTrustAndLevel(result.influencerUserId, "CONTENT_APPROVED");
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

