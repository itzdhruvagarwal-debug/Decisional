import { AppError } from "@/lib/errors";
import prisma from "@/lib/db";
import { Prisma, DisputeType, DisputeStatus } from "@prisma/client";
import {
  analyzeDispute,
  applyResolution,
  escalateDispute,
  MediatorAnalysis,
} from "@/lib/dispute-mediator";
import { logger } from "@/lib/logger";
import { getDealAndVerifyParticipant } from "@/lib/utils";
import { NotificationService } from "@/services/notification.service";

export class DisputeService {
  static async listDisputes(
    userId: string,
    params: {
      dealId?: string;
      status?: string;
      page: number;
      limit: number;
    },
  ) {
    const where: Prisma.DisputeWhereInput = {
      OR: [
        { raisedByUserId: userId },
        { deal: { influencer: { userId: userId } } },
        { deal: { brand: { userId: userId } } },
      ],
    };

    if (params.dealId) where.dealId = params.dealId;
    if (params.status) where.status = params.status as DisputeStatus;

    const [disputes, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        include: {
          deal: {
            select: {
              id: true,
              amount: true,
              campaign: { select: { title: true } },
              influencer: { select: { displayName: true } },
              brand: { select: { companyName: true } },
            },
          },
          evidence: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.dispute.count({ where }),
    ]);

    return { disputes, total };
  }

  static async createDispute(
    userId: string,
    data: {
      dealId: string;
      type: DisputeType;
      description: string;
    },
  ) {
    // Verify user is part of deal
    const deal = await getDealAndVerifyParticipant(data.dealId, userId);

    const allowedDealStatuses = [
      "PAYMENT_HELD",
      "CONTENT_SUBMITTED",
      "REVISION_REQUESTED",
      "CONTENT_APPROVED",
      "POSTED",
      "VERIFICATION_PENDING",
      "VERIFIED",
      "DISPUTED",
    ];
    if (!allowedDealStatuses.includes(deal.status)) {
      throw AppError.badRequest("Cannot raise dispute on a completed or cancelled deal");
    }

    // Create dispute - starts at Tier 1 (Auto) with a lock on the deal
    const dispute = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Lock the deal row to prevent concurrent dispute creations
      await tx.deal.update({
        where: { id: data.dealId },
        data: { updatedAt: new Date() },
      });

      // 2. Check for existing open dispute inside the locked transaction
      const existingDispute = await tx.dispute.findFirst({
        where: {
          dealId: data.dealId,
          status: { in: ["OPEN", "TIER1_AUTO", "TIER2_MEDIATION"] },
        },
      });

      if (existingDispute) {
        throw AppError.badRequest("An open dispute already exists for this deal");
      }

      const newDispute = await tx.dispute.create({
        data: {
          dealId: data.dealId,
          raisedByUserId: userId,
          type: data.type,
          description: data.description,
          status: "TIER1_AUTO",
          tier: 1,
        },
      });

      // Update deal status
      await tx.deal.update({
        where: { id: data.dealId },
        data: { status: "DISPUTED" },
      });

      // Notification 1: Raiser
      await NotificationService.createNotification({
        userId: userId,
        type: "dispute",
        title: "Dispute Opened",
        message: `You have successfully raised a dispute for your deal. AI mediator analysis has been initiated.`,
        data: { disputeId: newDispute.id, dealId: data.dealId },
      }, tx);

      // Notification 2: Opponent
      const otherUserId = deal.influencer.userId === userId ? deal.brand?.userId : deal.influencer.userId;
      if (otherUserId) {
        await NotificationService.createNotification({
          userId: otherUserId,
          type: "dispute",
          title: "Dispute Filed Against You",
          message: `The other party has raised a dispute on your deal. Please review the details and submit any evidence.`,
          data: { disputeId: newDispute.id, dealId: data.dealId },
        }, tx);
      }

      return newDispute;
    });

    // Tier 1: AI Mediator Analysis
    let analysis: MediatorAnalysis | null = null;
    let autoResolved = false;
    try {
      analysis = await analyzeDispute(dispute.id);

      // Auto-resolve if confidence is HIGH and it's auto-resolvable
      if (analysis.autoResolvable && analysis.confidence === "HIGH") {
        const result = await applyResolution(dispute.id, analysis, "AUTO");
        autoResolved = result.success;
      } else if (!analysis.autoResolvable) {
        // Escalate to Tier 2 automatically if not auto-resolvable
        await applyResolution(dispute.id, analysis, "AUTO");
      }
    } catch (mediatorError) {
      logger.error("Dispute mediator analysis failed", mediatorError, {
        disputeId: dispute.id,
      });
      // Fall through — dispute stays in TIER1_AUTO for manual review
    }

    let disputeMessage = "Dispute created. AI analysis pending review.";
    if (autoResolved) {
      disputeMessage = "Dispute auto-resolved by AI mediator based on contract terms and evidence";
    } else if (analysis?.autoResolvable === false) {
      disputeMessage = "Dispute requires human mediation. Escalated to Tier 2.";
    }

    return {
      dispute,
      analysis,
      autoResolved,
      message: disputeMessage,
    };
  }

  static async addEvidence(
    userId: string,
    data: {
      disputeId: string;
      type: string;
      url: string;
      description?: string;
    },
  ) {
    const dispute = await prisma.dispute.findUnique({
      where: { id: data.disputeId },
      include: {
        deal: {
          include: {
            influencer: { select: { userId: true } },
            brand: { select: { userId: true } },
          },
        },
      },
    });

    if (!dispute) throw AppError.notFound("Dispute not found");

    // Check dispute is still open for evidence
    const openStatuses = ["OPEN", "TIER1_AUTO", "TIER2_MEDIATION"];
    if (!openStatuses.includes(dispute.status)) {
      throw AppError.badRequest(`Cannot add evidence to a ${dispute.status} dispute`);
    }

    const allowedEvidenceUsers = [
      dispute.raisedByUserId,
      dispute.deal.influencer.userId,
      dispute.deal.brand?.userId,
    ].filter(Boolean);

    if (!allowedEvidenceUsers.includes(userId)) throw AppError.forbidden("Unauthorized");

    const evidence = await prisma.disputeEvidence.create({
      data: {
        disputeId: data.disputeId,
        submittedByUserId: userId,
        type: data.type, // 'screenshot', 'document', 'chat_log'
        url: data.url,
        description: data.description ?? null,
      },
    });

    return { evidence, message: "Evidence added successfully" };
  }

  static async handleAction(
    userId: string,
    data: {
      disputeId: string;
      action: "accept_resolution" | "reject_resolution" | "escalate";
      reason?: string;
    },
  ) {
    const dispute = await prisma.dispute.findUnique({
      where: { id: data.disputeId },
      include: {
        deal: {
          include: {
            influencer: { select: { userId: true } },
            brand: { select: { userId: true } },
          },
        },
      },
    });

    if (!dispute) throw AppError.notFound("Dispute not found");

    const actionableStatuses = ["OPEN", "TIER1_AUTO", "TIER2_MEDIATION"];
    if (!actionableStatuses.includes(dispute.status)) {
      throw AppError.badRequest(`Cannot update a ${dispute.status} dispute`);
    }

    const allowedUsers = [
      dispute.raisedByUserId,
      dispute.deal.influencer.userId,
      dispute.deal.brand?.userId,
    ].filter(Boolean);

    if (!allowedUsers.includes(userId)) throw AppError.forbidden("Unauthorized");

    if (data.action === "accept_resolution") {
      if (dispute.status === "TIER2_MEDIATION") {
        throw AppError.badRequest("Dispute is under mediation review. Please wait for the mediator's decision.");
      }
      // Re-run analysis and apply
      const analysis = await analyzeDispute(data.disputeId);
      const userType =
        userId === dispute.deal.influencer.userId ? "INFLUENCER" : "BRAND";

      const result = await applyResolution(data.disputeId, analysis, userType);
      return { success: result.success, message: result.message };
    }

    if (data.action === "reject_resolution" || data.action === "escalate") {
      const escalation = await escalateDispute(
        data.disputeId,
        data.reason || "Party rejected AI resolution",
      );
      return {
        success: escalation.success,
        newTier: escalation.newTier,
        message: `Dispute escalated to Tier ${escalation.newTier}`,
      };
    }

    throw AppError.badRequest("Invalid action");
  }

  static async getDisputeDetails(
    userId: string,
    disputeId: string,
    isAdmin: boolean = false,
  ) {
    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        deal: {
          select: {
            id: true,
            amount: true,
            campaign: { select: { title: true } },
            influencer: {
              select: { userId: true, displayName: true, avatar: true },
            },
            brand: { select: { userId: true, companyName: true, logo: true } },
          },
        },
        evidence: {
          orderBy: { submittedAt: "desc" },
        },
      },
    });

    if (!dispute) throw AppError.notFound("Dispute not found");

    const isParticipant =
      dispute.raisedByUserId === userId ||
      dispute.deal.influencer.userId === userId ||
      dispute.deal.brand?.userId === userId;

    if (!isParticipant && !isAdmin) {
      throw AppError.forbidden("Unauthorized access to dispute");
    }

    return dispute;
  }
}
