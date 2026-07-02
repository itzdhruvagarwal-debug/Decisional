import { AppError } from "@/lib/errors";
import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";
import { updateTrustAndLevel } from "@/lib/trust-engine";
import { checkAndAwardBadges } from "@/lib/gamification-engine";
import { getDealAndVerifyParticipant } from "@/lib/utils";

export class ReviewService {
  static async listReviews(
    userId: string,
    targetId?: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const where: Prisma.ReviewWhereInput = {};

    if (targetId) {
      where.receiverId = targetId;
    } else {
      // Default: reviews received by the user
      where.receiverId = userId;
    }

    const viewer = await prisma.user.findUnique({
      where: { id: userId },
      select: { userType: true },
    });
    const viewerType = viewer?.userType;

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        include: {
          reviewer: {
            select: {
              id: true,
              userType: true,
              influencerProfile: {
                select: { displayName: true, avatar: true },
              },
              brandProfile: { select: { companyName: true, logo: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.review.count({ where }),
    ]);

    const sanitizedReviews = reviews.map((review) => {
      if (viewerType === "BRAND" && review.reviewerType === "BRAND" && review.reviewerId !== userId) {
        const sanitized = {
          ...review,
          comment: "Comment is confidential",
          dealId: "confidential",
          reviewerId: "confidential",
        };
        if (sanitized.reviewer) {
          sanitized.reviewer = {
            ...sanitized.reviewer,
            id: "confidential",
            brandProfile: sanitized.reviewer.brandProfile
              ? {
                  ...sanitized.reviewer.brandProfile,
                  companyName: "Anonymous Brand",
                  logo: null,
                }
              : null,
          };
        }
        return sanitized;
      }
      return review;
    });

    return { reviews: sanitizedReviews, total };
  }

  static async createReview(
    reviewerId: string,
    data: {
      receiverId?: string;
      dealId: string;
      rating: number;
      comment?: string;
    },
  ) {
    if (data.rating < 1 || data.rating > 5)
      throw AppError.badRequest("Rating must be between 1 and 5");

    // Fetch Deal to verify and deduce receiver if needed
    const deal = await getDealAndVerifyParticipant(data.dealId, reviewerId);

    if (deal.status !== "COMPLETED")
      throw AppError.badRequest("Deal must be completed before reviewing");

    const participants = [deal.influencer.userId, deal.brand?.userId].filter(
      Boolean,
    ) as string[];

    // Deduce receiverId if not provided
    let targetId = data.receiverId;
    if (!targetId) {
      targetId = participants.find((p) => p !== reviewerId);
      if (!targetId) throw AppError.badRequest("Could not determine review target");
    }

    if (targetId === reviewerId) throw AppError.badRequest("Cannot review yourself");
    if (!participants.includes(targetId))
      throw AppError.badRequest("Target user is not part of this deal");

    // Check if review already exists
    const existing = await prisma.review.findUnique({
      where: {
        dealId_reviewerId_receiverId: {
          dealId: data.dealId,
          reviewerId: reviewerId,
          receiverId: targetId,
        },
      },
    });
    if (existing)
      throw AppError.badRequest("You have already reviewed this user for this deal");

    const receiverId = targetId; // ensure it's set for transaction usage

    // Fetch reviewer type
    const reviewerUser = await prisma.user.findUnique({
      where: { id: reviewerId },
      select: { userType: true },
    });
    if (!reviewerUser) throw AppError.notFound("Reviewer not found");

    // Transaction: Create Review + Update Aggregates (averageRating) + Check Badges
    try {
      const review = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const newReview = await tx.review.create({
          data: {
            dealId: data.dealId,
            reviewerId: reviewerId,
            receiverId: receiverId,
            reviewerType: reviewerUser.userType,
            rating: data.rating,
            comment: data.comment ?? null,
          },
        });

        // Update Receiver's Profile Stats (averageRating logic needed)
        const receiver = await tx.user.findUnique({
          where: { id: receiverId },
          include: {
            influencerProfile: true,
            brandProfile: true,
          },
        });

        if (!receiver) throw AppError.notFound("Receiver not found");

        // Improved Average Rating Calculation
        const { _avg, _count } = await tx.review.aggregate({
          where: { receiverId: receiverId },
          _avg: { rating: true },
          _count: { rating: true },
        });

        const newAverage = _avg.rating || data.rating; // fallback if somehow null

        const updateData = {
          averageRating: newAverage,
          totalReviews: _count.rating,
        };

        if (receiver.userType === "INFLUENCER" && receiver.influencerProfile) {
          await tx.influencerProfile.update({
            where: { id: receiver.influencerProfile.id },
            data: updateData,
          });
        } else if (receiver.userType === "BRAND" && receiver.brandProfile) {
          await tx.brandProfile.update({
            where: { id: receiver.brandProfile.id },
            data: updateData,
          });
        }

        // Gamification
        await checkAndAwardBadges(reviewerId, "FIRST_REVIEW", tx);
        if (data.rating === 5) {
          await checkAndAwardBadges(receiverId, "FIVE_STAR_RATING", tx);
        }

        return newReview;
      });

      // Recalculate Trust Score (async outside transaction to avoid lock contention if slow)
      await updateTrustAndLevel(receiverId, "REVIEW_RECEIVED");

      return review;
    } catch (error: unknown) {
      if ((error as { code?: string }).code === "P2002") {
        throw AppError.badRequest("You have already reviewed this deal (duplicate submission prevented).",
        );
      }
      throw error;
    }
  }
}
