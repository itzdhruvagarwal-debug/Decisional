import prisma from "./db";
import { logger } from "./logger";

/**
 * Enterprise Risk & Trust Guard.
 * Advanced dynamic behavior tracking, AI fraud penalties, and financial gates.
 */

// ==================== DYNAMIC BEHAVIOR LOGIC ====================

export interface ApplicationGateResult {
    allowed: boolean;
    reason?: string;
    maxAmountCap?: number;
}

export async function checkEnterpriseApplicationGate(
    userId: string,
    proposedAmountPaise: number
): Promise<ApplicationGateResult> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            createdAt: true,
            trustScore: true,
            influencerProfile: { select: { id: true, completedDeals: true } },
        }
    });

    if (!user) return { allowed: false, reason: "User not found" };

    const accountAgeDays = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    const isNewAccount = accountAgeDays < 30;

    // 1. New Accounts Logic
    if (isNewAccount) {
        if (user.influencerProfile) {
            const now = new Date();
            const istOffset = 5.5 * 60 * 60 * 1000;
            const todayIST = new Date(now.getTime() + istOffset);
            todayIST.setUTCHours(0, 0, 0, 0);
            const istDayStart = new Date(todayIST.getTime() - istOffset);

            const applicationsToday = await prisma.application.count({
                where: {
                    influencerId: user.influencerProfile.id,
                    createdAt: { gte: istDayStart },
                }
            });

            if (applicationsToday >= 3) {
                return {
                    allowed: false,
                    reason: "New accounts are limited to 3 applications per day (IST) to prevent spam.",
                };
            }
        }

        // First deal cap (₹5k = 500000 paise)
        if ((user.influencerProfile?.completedDeals || 0) === 0) {
            if (proposedAmountPaise > 500000) {
                return {
                    allowed: false,
                    maxAmountCap: 500000,
                    reason: "For your first deal, the maximum allowed request is ₹5,000.",
                };
            }
        }
    }

    // 2. High Velocity Behavior (Too many deals too fast)
    if (user.influencerProfile && user.influencerProfile.completedDeals > 0) {
        const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const recentDealsCount = await prisma.deal.count({
            where: {
                influencerId: user.influencerProfile.id,
                createdAt: { gte: weekStart }
            }
        });

        if (recentDealsCount > 10 && user.trustScore < 750) {
            // Velocity trigger - Audit needed
            logger.warn("Velocity trigger activated for user", { userId, recentDealsCount });
            
            // 1. Create a UserViolation database record
            await prisma.userViolation.create({
                data: {
                    userId,
                    type: "SPAM",
                    severity: "MEDIUM",
                    description: `Velocity trigger activated: low-trust user (Trust Score: ${user.trustScore}) completed ${recentDealsCount} deals within 7 days.`,
                    action: "WARNING",
                    metadata: { recentDealsCount, trustScore: user.trustScore },
                }
            });

            // 2. Notify all administrators
            const admins = await prisma.user.findMany({
                where: { userType: "ADMIN" },
                select: { id: true },
            });
            if (admins.length > 0) {
                const { NotificationService } = await import("@/services/notification.service");
                await NotificationService.createNotifications(
                    admins.map((adm) => ({
                        userId: adm.id,
                        type: "admin_alert",
                        title: "⚠️ High Velocity Violation Detected",
                        message: `User ${userId} triggered a high velocity alert (completed ${recentDealsCount} deals in 7 days with trust score < 750).`,
                        data: { targetUserId: userId, recentDealsCount },
                    }))
                );
            }
        }
    }

    return { allowed: true };
}

// ==================== FINANCIAL IMPACT ENGINES ====================

export type WithdrawalSpeed = "INSTANT" | "24_HOURS" | "72_HOURS" | "MANUAL_REVIEW";

/**
 * Determine withdrawal processing speed based on trust score tier.
 * Elite users get instant processing; low-trust users are routed to manual review.
 *
 * INSTANT       → Elite tier (trustScore ≥ 850)
 * 24_HOURS      → Trusted tier (trustScore ≥ 750)
 * 72_HOURS      → Normal tier (trustScore ≥ 600)
 * MANUAL_REVIEW → Limited/Flagged tier (trustScore < 600)
 */
export function getWithdrawalSpeed(trustScore: number): WithdrawalSpeed {
    if (trustScore >= 850) return "INSTANT";
    if (trustScore >= 750) return "24_HOURS";
    if (trustScore >= 600) return "72_HOURS";
    return "MANUAL_REVIEW";
}


/**
 * Determine if user is eligible to earn from referrals (stops bots farming code signups)
 */
export function isEligibleForReferralEarnings(trustScore: number): boolean {
    return trustScore >= 600; // NORMAL tier or higher
}

