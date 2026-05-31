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
        // 3 applications / day limit
        if (user.influencerProfile) {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const applicationsToday = await prisma.application.count({
                where: {
                    influencerId: user.influencerProfile.id,
                    createdAt: { gte: todayStart },
                }
            });

            if (applicationsToday >= 3) {
                return {
                    allowed: false,
                    reason: "New accounts are limited to 3 applications per day to prevent spam.",
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

        if (recentDealsCount > 10 && user.trustScore < 75) {
            // Velocity trigger - Audit needed
            logger.warn("Velocity trigger activated for user", { userId, recentDealsCount });

            // Optionally deduct trust or flag for review dynamically
            await applyAIFraudSignal(userId, 5, "High velocity deal behavior detected");
        }
    }

    return { allowed: true };
}

// ==================== AI + FRAUD INTEGRATION ====================

/**
 * Apply a direct penalty to Trust Score based on an AI signal (e.g., bot detection, fake followers).
 * Forces manual review if score drops to 30 or below.
 */
export async function applyAIFraudSignal(
    userId: string,
    riskWeight: number,
    reason: string
): Promise<void> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { trustScore: true, status: true }
    });

    if (!user) return;

    const newScore = Math.max(0, user.trustScore - riskWeight);
    let newStatus = user.status;

    if (newScore <= 30 && user.status === "ACTIVE") {
        newStatus = "SUSPENDED"; // Existing enum value used for manual review hold.
        logger.warn(`User ${userId} suspended for manual review due to AI fraud signal.`);
    }

    await prisma.user.update({
        where: { id: userId },
        data: {
            trustScore: newScore,
            status: newStatus,
        }
    });

    // Log the violation/fraud detection
    await prisma.userViolation.create({
        data: {
            userId,
            type: "FRAUD",
            severity: newScore <= 30 ? "HIGH" : "MEDIUM",
            description: `AI Risk Engine: ${reason} (Penalty: -${riskWeight})`,
            action: newScore <= 30 ? "TEMP_SUSPENSION" : "TRUST_SCORE_LOG",
        }
    });
}

// ==================== FINANCIAL IMPACT ENGINES ====================

/**
 * Determine withdrawal speed based on Trust Score
 */
export function getWithdrawalSpeed(trustScore: number): "INSTANT" | "24_HOURS" | "72_HOURS" | "MANUAL_REVIEW" {
    if (trustScore >= 86) return "INSTANT";
    if (trustScore >= 71) return "24_HOURS";
    if (trustScore >= 51) return "72_HOURS";
    return "MANUAL_REVIEW";
}

/**
 * Determine if user is eligible to earn from referrals (stops bots farming code signups)
 */
export function isEligibleForReferralEarnings(trustScore: number): boolean {
    return trustScore >= 51; // NORMAL tier or higher
}

/**
 * Get internal search ranking boost
 * Elite users get 2x multiplier in search visibility
 */
export function getSearchRankingBoost(trustScore: number): number {
    if (trustScore >= 86) return 2.0;    // Elite
    if (trustScore >= 71) return 1.5;    // Trusted
    if (trustScore >= 51) return 1.0;    // Normal
    if (trustScore >= 31) return 0.5;    // Limited
    return 0.1;                          // Flagged (barely visible)
}
