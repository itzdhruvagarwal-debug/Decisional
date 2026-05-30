import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  requireActiveAdmin,
  type AdminSessionUser,
} from "@/lib/admin-auth";
import { logActivity, ActivityAction } from "@/lib/audit";

export class AdminService {
  static async checkAdminAccess(input: AdminSessionUser | null | undefined) {
    await requireActiveAdmin(input);
  }

  static async getVerificationQueue() {
    return await prisma.user.findMany({
      where: { status: "PENDING_VERIFICATION" },
      select: {
        id: true,
        email: true,
        userType: true,
        createdAt: true,
        influencerProfile: { select: { displayName: true } },
        brandProfile: { select: { companyName: true } },
        taxCompliance: {
          select: {
            status: true,
            panLast4: true,
            gstinLast4: true,
            itrAcknowledgementLast4: true,
            eInvoiceApplicable: true,
          },
        },
        verificationDocs: { select: { id: true } },
        _count: { select: { verificationDocs: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200, // Safety limit to prevent unbounded queries
    });
  }

  static async listUsers(params: {
    search?: string;
    userType?: string;
    status?: string;
    verificationLevel?: string;
    page: number;
    limit: number;
  }) {
    const where: any = {};

    if (params.search) {
      where.OR = [
        { email: { contains: params.search, mode: "insensitive" } },
        { phone: { contains: params.search, mode: "insensitive" } },
        {
          influencerProfile: {
            displayName: { contains: params.search, mode: "insensitive" },
          },
        },
        {
          brandProfile: {
            companyName: { contains: params.search, mode: "insensitive" },
          },
        },
      ];
    }

    if (params.userType) where.userType = params.userType;
    if (params.status) where.status = params.status;
    if (params.verificationLevel)
      where.verificationLevel = params.verificationLevel;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          userType: true,
          status: true,
          trustScore: true,
          createdAt: true,
          verificationLevel: true,
          influencerProfile: { select: { displayName: true, avatar: true } },
          brandProfile: { select: { companyName: true, logo: true } },
          taxCompliance: {
            select: {
              status: true,
              panLast4: true,
              gstinLast4: true,
              itrAcknowledgementLast4: true,
              eInvoiceApplicable: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  static async getUserDetails(userId: string) {
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
        referredBy: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
        influencerProfile: true,
        brandProfile: true,
        taxCompliance: true,
        wallet: {
          include: {
            transactions: { take: 10, orderBy: { createdAt: "desc" } },
          },
        },
        verificationDocs: true,
        violations: { take: 10, orderBy: { createdAt: "desc" } },
        activityLogs: { take: 20, orderBy: { createdAt: "desc" } },
        badges: { include: { badge: true } },
        disputes: { take: 10, orderBy: { createdAt: "desc" } },
      },
    });

    if (!user) throw new Error("User not found");

    // Get Deal Stats
    const dealStats = await this.getDealStats(user.id, user.userType);

    return { user, dealStats };
  }

  static async updateUserStatus(
    adminUser: AdminSessionUser,
    userId: string,
    data: {
      action:
      | "ban"
      | "suspend"
      | "activate"
      | "adjust_trust"
      | "set_verification";
      reason?: string;
      trustScoreAdjustment?: number;
      verificationLevel?: any;
      suspensionDays?: number;
    },
  ) {
    const admin = await requireActiveAdmin(adminUser);
    if (admin.id === userId && ["ban", "suspend"].includes(data.action)) {
      throw new Error("Admins cannot ban or suspend their own account");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, status: true, trustScore: true },
    });
    if (!user) throw new Error("User not found");

    let updateData: any = {};
    let message = "";
    let devLogMessage = "";
    let violationData: any = null;
    let notificationTitle = "Account Update";

    switch (data.action) {
      case "ban":
        updateData = { status: "BANNED" };
        message = `User ${user.email} has been banned.`;
        devLogMessage = `User ${userId} BANNED by admin ${admin.email}`;
        notificationTitle = "Account banned";
        violationData = {
          type: "TERMS_VIOLATION",
          severity: "CRITICAL",
          description: data.reason || "Admin banned via panel",
          action: "PERMANENT_BAN",
        };
        break;
      case "suspend":
        updateData = { status: "SUSPENDED" };
        message = `User ${user.email} has been suspended.`;
        devLogMessage = `User ${userId} SUSPENDED by admin ${admin.email}`;
        notificationTitle = "Account suspended";
        violationData = {
          type: "TERMS_VIOLATION",
          severity: "HIGH",
          description: data.reason || "Admin suspended via panel",
          action: "TEMP_SUSPENSION",
        };
        break;
      case "activate":
        updateData = { status: "ACTIVE" };
        message = `User ${user.email} has been activated.`;
        devLogMessage = `User ${userId} ACTIVATED by admin ${admin.email}`;
        notificationTitle = "Account activated";
        break;
      case "adjust_trust":
        if (data.trustScoreAdjustment === undefined)
          throw new Error("Adjustment required");
        const newScore = Math.max(
          0,
          Math.min(100, user.trustScore + data.trustScoreAdjustment),
        );
        updateData = { trustScore: newScore };
        message = `Trust score adjusted by ${data.trustScoreAdjustment}`;
        devLogMessage = `User ${userId} trust score adjusted by ${data.trustScoreAdjustment} to ${newScore} by admin ${admin.email}`;
        notificationTitle = "Trust score updated";
        break;
      case "set_verification":
        if (!data.verificationLevel)
          throw new Error("Verification level required");
        updateData = { verificationLevel: data.verificationLevel };
        message = `Verification level set to ${data.verificationLevel}`;
        devLogMessage = `User ${userId} verification level set to ${data.verificationLevel} by admin ${admin.email}`;
        notificationTitle = "Verification level updated";
        break;
    }

    logger.info(devLogMessage || message, {
      adminEmail: admin.email,
      adminId: admin.id,
      userId,
      action: data.action,
    });

    const result = await prisma.$transaction(async (tx: any) => {
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: updateData,
      });

      if (violationData) {
        await tx.userViolation.create({
          data: {
            userId,
            type: violationData.type,
            severity: violationData.severity,
            description: violationData.description,
            action: violationData.action,
            expiresAt: data.suspensionDays
              ? new Date(Date.now() + data.suspensionDays * 24 * 60 * 60 * 1000)
              : null,
            metadata: {
              adminEmail: admin.email,
              adminId: admin.id,
              reason: data.reason,
              suspensionDays: data.suspensionDays,
            },
          },
        });
      }

      // Notification
      await tx.notification.create({
        data: {
          userId,
          type: "system",
          title: notificationTitle,
          message: data.reason || message,
          data: { adminAction: data.action },
        },
      });

      return { success: true, message, user: updatedUser };
    });

    // Asynchronously log the admin mutation to the audit trail
    let auditAction = "";
    switch (data.action) {
      case "ban":
        auditAction = ActivityAction.ACCOUNT_BANNED;
        break;
      case "suspend":
        auditAction = ActivityAction.ACCOUNT_SUSPENDED;
        break;
      case "activate":
        auditAction = "ACCOUNT_ACTIVATED";
        break;
      case "adjust_trust":
        auditAction = "TRUST_ADJUSTED";
        break;
      case "set_verification":
        auditAction = "VERIFICATION_UPDATED";
        break;
    }

    if (auditAction) {
      logActivity({
        userId: admin.id,
        action: auditAction,
        entityType: "USER",
        entityId: userId,
        metadata: {
          adminEmail: admin.email,
          reason: data.reason,
          trustScoreAdjustment: data.trustScoreAdjustment,
          verificationLevel: data.verificationLevel,
          suspensionDays: data.suspensionDays,
          previousStatus: user.status,
          previousTrustScore: user.trustScore,
        },
      });
    }

    return result;
  }

  private static async getDealStats(userId: string, userType: string) {
    let field = "";
    if (userType === "INFLUENCER") {
      const p = await prisma.influencerProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!p) return null;
      field = "influencerId";
      return await this.fetchStats(field, p.id);
    } else if (userType === "BRAND") {
      const p = await prisma.brandProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!p) return null;
      field = "brandId";
      return await this.fetchStats(field, p.id);
    }
    return null;
  }

  private static async fetchStats(field: string, profileId: string) {
    const [total, completed, active, cancelled] = await Promise.all([
      prisma.deal.count({ where: { [field]: profileId } }),
      prisma.deal.count({ where: { [field]: profileId, status: "COMPLETED" } }),
      prisma.deal.count({
        where: {
          [field]: profileId,
          status: {
            in: [
              "ACTIVE",
              "PAYMENT_PENDING",
              "PAYMENT_HELD",
              "CONTENT_SUBMITTED",
              "CONTENT_APPROVED",
              "VERIFIED",
            ],
          },
        },
      }),
      prisma.deal.count({ where: { [field]: profileId, status: "CANCELLED" } }),
    ]);
    return { total, completed, active, cancelled };
  }
}
