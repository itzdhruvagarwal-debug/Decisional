import { AppError } from "@/lib/errors";
/**
 * Tiered Verification System — Role-Aware
 *
 * ────────────────────────────────────────────────────────────────
 *  INFLUENCER tiers:
 *    Tier 0 — Locked       : email or phone not verified
 *    Tier 1 — Basic        : Email ✅ + Phone ✅ + Aadhaar + Selfie → ₹50,000/month
 *    Tier 2 — Standard     : + PAN Card + Bank Statement           → UNLIMITED
 *
 *  BRAND tiers:
 *    Tier 0 — Locked       : email or phone not verified
 *    Tier 1 — Basic        : Email ✅ + Phone ✅ + Aadhaar + Selfie → ₹50,000/month
 *    Tier 2 — Standard     : + PAN Card + Bank Statement           → ₹1,00,000/month
 *    Tier 3 — Premium      : + GST / MSME / Startup / CIN          → UNLIMITED
 * ────────────────────────────────────────────────────────────────
 *
 * Monthly spend calculation:
 *  - Brand     → sum of totalBudget of active campaigns created this month
 *  - Influencer → sum of perInfluencerBudget of campaigns applied to (non-rejected) this month
 */

import prisma from "@/lib/db";
import { logger } from "@/lib/logger";

// ────────── Tier Limits (in Paise = ₹ × 100) ──────────

export const TIER_LIMITS = {
  TIER_1_MAX_MONTHLY: 5_000_000, // ₹50,000
  TIER_2_MAX_MONTHLY: 10_000_000, // ₹1,00,000  (Brand only — Influencer jumps straight to unlimited)
  TIER_3_MAX_MONTHLY: Infinity, // Unlimited
} as const;

export type VerificationTier = 0 | 1 | 2 | 3;

export interface TierCheckResult {
  allowed: boolean;
  tier: VerificationTier;
  monthlyUsed: number; // paise already used this month
  monthlyLimit: number; // paise limit for this tier (Infinity → null in JSON)
  reason?: string;
  requiredDocs?: string[]; // docs needed to unlock next tier
}

// ────────── Helper: Verified document set ──────────

async function getVerifiedDocs(userId: string): Promise<Set<string>> {
  const docs = await prisma.verificationDocument.findMany({
    where: { userId, status: "VERIFIED" },
    select: { type: true },
  });
  return new Set(docs.map((d: { type: string }) => d.type));
}

// ────────── Helper: Monthly spend ──────────

async function getMonthlySpend(
  userId: string,
  userType: "BRAND" | "INFLUENCER",
): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  if (userType === "BRAND") {
    const [profile, campaigns] = await Promise.all([
      prisma.brandProfile.findUnique({
        where: { userId },
        select: { id: true },
      }),
      prisma.brandProfile.findUnique({
        where: { userId },
        select: { id: true },
      }).then(p => p ? prisma.campaign.findMany({
        where: {
          brandId: p.id,
          createdAt: { gte: startOfMonth },
          status: { notIn: ["CANCELLED"] },
        },
        select: {
          totalBudget: true,
          requiresProduct: true,
          productValue: true,
          maxInfluencers: true,
          perInfluencerBudget: true,
        },
      }) : [])
    ]);
    
    if (!profile) return 0;
    return campaigns.reduce((sum: number, c: {
      totalBudget: number;
      requiresProduct: boolean;
      productValue: number | null;
      maxInfluencers: number | null;
      perInfluencerBudget: number | null;
    }) => {
      if (c.totalBudget > 0) return sum + c.totalBudget;
      if (c.requiresProduct && c.productValue) {
        const slots = c.maxInfluencers && c.maxInfluencers > 0 ? c.maxInfluencers : 1;
        return sum + (c.productValue * slots);
      }
      return sum;
    }, 0);
  } else {
    const [profile, apps] = await Promise.all([
      prisma.influencerProfile.findUnique({
        where: { userId },
        select: { id: true },
      }),
      prisma.influencerProfile.findUnique({
        where: { userId },
        select: { id: true },
      }).then(p => p ? prisma.application.findMany({
        where: {
          influencerId: p.id,
          createdAt: { gte: startOfMonth },
          status: { notIn: ["REJECTED", "WITHDRAWN"] },
        },
      select: {
        campaign: {
          select: {
            perInfluencerBudget: true,
            requiresProduct: true,
            productValue: true,
            totalBudget: true,
          },
        },
      },
    }) : [])
    ]);
    
    if (!profile) return 0;
    return apps.reduce(
      (sum: number, a: {
        campaign: {
          perInfluencerBudget: number | null;
          requiresProduct: boolean;
          productValue: number | null;
          totalBudget: number;
        };
      }) => {
        const isProductOnly = a.campaign.requiresProduct && a.campaign.totalBudget === 0;
        if (isProductOnly) {
          return sum + (a.campaign.productValue || 0);
        }
        return sum + (a.campaign.perInfluencerBudget || 0);
      },
      0,
    );
  }
}

// ────────── Helper: Has Tier 3 business doc (Brand only) ──────────

function hasTier3Doc(docs: Set<string>): boolean {
  return (
    docs.has("GST_CERTIFICATE") ||
    docs.has("MSME_CERTIFICATE") ||
    docs.has("STARTUP_CERTIFICATE") ||
    docs.has("CIN_CERTIFICATE")
  );
}

// ────────── Main: Current tier for a user (role-aware) ──────────

export async function getUserVerificationTier(
  userId: string,
  userType?: "BRAND" | "INFLUENCER",
): Promise<VerificationTier> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true, phoneVerified: true, userType: true },
  });
  if (!user) return 0;
  if (!user.emailVerified || !user.phoneVerified) return 0;

  const role = (userType || user.userType) as "BRAND" | "INFLUENCER";
  const docs = await getVerifiedDocs(userId);

  const hasTier1 = docs.has("AADHAAR") && docs.has("SELFIE");
  if (!hasTier1) return 0;

  const hasTier2 = docs.has("PAN_CARD") && docs.has("BANK_STATEMENT");
  if (!hasTier2) return 1;

  // Influencer: Tier 2 = unlimited (no Tier 3 needed)
  if (role === "INFLUENCER") return 2;

  // Brand: Tier 3 needs a business doc
  if (hasTier3Doc(docs)) return 3;
  return 2;
}

// ────────── Main: Check if user can transact a given amount ──────────

export async function checkVerificationTierForAmount(
  userId: string,
  userType: "BRAND" | "INFLUENCER",
  newAmountPaise: number,
): Promise<TierCheckResult> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerified: true, phoneVerified: true },
    });

    if (!user) {
      return {
        allowed: false,
        tier: 0,
        monthlyUsed: 0,
        monthlyLimit: 0,
        reason: "User not found.",
      };
    }

    // ── Gate 0: Email + Phone ──
    if (!user.emailVerified) {
      return {
        allowed: false,
        tier: 0,
        monthlyUsed: 0,
        monthlyLimit: 0,
        reason:
          "Please verify your email address before creating or applying to campaigns.",
        requiredDocs: ["EMAIL_VERIFICATION"],
      };
    }
    if (!user.phoneVerified) {
      return {
        allowed: false,
        tier: 0,
        monthlyUsed: 0,
        monthlyLimit: 0,
        reason:
          "Please verify your phone number before creating or applying to campaigns.",
        requiredDocs: ["PHONE_VERIFICATION"],
      };
    }

    const docs = await getVerifiedDocs(userId);
    const monthlyUsed = await getMonthlySpend(userId, userType);
    const projectedTotal = monthlyUsed + newAmountPaise;

    // ── Tier 1 gate ──
    const hasTier1 = docs.has("AADHAAR") && docs.has("SELFIE");
    if (!hasTier1) {
      return {
        allowed: false,
        tier: 0,
        monthlyUsed,
        monthlyLimit: 0,
        reason:
          "Please complete your identity verification (Aadhaar card + Selfie) before creating or applying to campaigns.",
        requiredDocs: [
          ...(!docs.has("AADHAAR") ? ["AADHAAR"] : []),
          ...(!docs.has("SELFIE") ? ["SELFIE"] : []),
        ],
      };
    }

    const hasTier2 = docs.has("PAN_CARD") && docs.has("BANK_STATEMENT");

    // ── INFLUENCER path ──
    if (userType === "INFLUENCER") {
      const tier: VerificationTier = hasTier2 ? 2 : 1;

      if (tier === 1 && projectedTotal > TIER_LIMITS.TIER_1_MAX_MONTHLY) {
        const remaining = Math.max(
          0,
          TIER_LIMITS.TIER_1_MAX_MONTHLY - monthlyUsed,
        );
        return {
          allowed: false,
          tier,
          monthlyUsed,
          monthlyLimit: TIER_LIMITS.TIER_1_MAX_MONTHLY,
          reason: `You have reached your ₹50,000/month limit. Remaining: ₹${(remaining / 100).toLocaleString("en-IN")}. Upload your PAN Card and Bank Statement to unlock unlimited campaigns.`,
          requiredDocs: [
            ...(!docs.has("PAN_CARD") ? ["PAN_CARD"] : []),
            ...(!docs.has("BANK_STATEMENT") ? ["BANK_STATEMENT"] : []),
          ],
        };
      }

      // Tier 2 influencer = unlimited — no further limit
      logger.info("Influencer tier check passed", {
        userId,
        tier,
        monthlyUsed,
      });
      return {
        allowed: true,
        tier,
        monthlyUsed,
        monthlyLimit: tier === 2 ? Infinity : TIER_LIMITS.TIER_1_MAX_MONTHLY,
      };
    }

    // ── BRAND path ──
    const tier3 = hasTier3Doc(docs);
    const tier: VerificationTier = hasTier2 && tier3 ? 3 : hasTier2 ? 2 : 1;
    const limit =
      tier === 3
        ? TIER_LIMITS.TIER_3_MAX_MONTHLY
        : tier === 2
          ? TIER_LIMITS.TIER_2_MAX_MONTHLY
          : TIER_LIMITS.TIER_1_MAX_MONTHLY;

    if (tier === 1 && projectedTotal > TIER_LIMITS.TIER_1_MAX_MONTHLY) {
      const remaining = Math.max(
        0,
        TIER_LIMITS.TIER_1_MAX_MONTHLY - monthlyUsed,
      );
      return {
        allowed: false,
        tier,
        monthlyUsed,
        monthlyLimit: TIER_LIMITS.TIER_1_MAX_MONTHLY,
        reason: `You have reached your ₹50,000/month limit. Remaining: ₹${(remaining / 100).toLocaleString("en-IN")}. Upload your PAN Card and Bank Statement to unlock up to ₹1,00,000/month.`,
        requiredDocs: [
          ...(!docs.has("PAN_CARD") ? ["PAN_CARD"] : []),
          ...(!docs.has("BANK_STATEMENT") ? ["BANK_STATEMENT"] : []),
        ],
      };
    }

    if (tier === 2 && projectedTotal > TIER_LIMITS.TIER_2_MAX_MONTHLY) {
      const remaining = Math.max(
        0,
        TIER_LIMITS.TIER_2_MAX_MONTHLY - monthlyUsed,
      );
      return {
        allowed: false,
        tier,
        monthlyUsed,
        monthlyLimit: TIER_LIMITS.TIER_2_MAX_MONTHLY,
        reason: `You have reached your ₹1,00,000/month limit. Remaining: ₹${(remaining / 100).toLocaleString("en-IN")}. Upload a GST Certificate, MSME Certificate, or Startup Certificate to unlock unlimited campaigns.`,
        requiredDocs: [
          "GST_CERTIFICATE",
          "MSME_CERTIFICATE",
          "STARTUP_CERTIFICATE",
        ],
      };
    }

    logger.info("Brand tier check passed", { userId, tier, monthlyUsed });
    return { allowed: true, tier, monthlyUsed, monthlyLimit: limit };
  } catch (error) {
    logger.error("Verification tier check failed", error, { userId });
    throw AppError.badRequest("Failed to check verification tier");
  }
}

// ────────── Utility: Structured API error response ──────────

export function tierErrorResponse(result: TierCheckResult) {
  return {
    error: result.reason || "Verification required",
    code: "VERIFICATION_REQUIRED",
    tier: result.tier,
    monthlyUsed: result.monthlyUsed,
    monthlyLimit: result.monthlyLimit === Infinity ? null : result.monthlyLimit,
    requiredDocs: result.requiredDocs || [],
    upgradeUrl: "/dashboard/settings?tab=verification",
  };
}

// ────────── Utility: Tier description strings ──────────

export function getTierDescription(
  tier: VerificationTier,
  userType: "BRAND" | "INFLUENCER",
): string {
  if (userType === "INFLUENCER") {
    return tier === 2
      ? "Standard — Unlimited campaigns"
      : tier === 1
        ? "Basic — Up to ₹50,000/month"
        : "Unverified — Please complete verification";
  }
  return tier === 3
    ? "Premium — Unlimited campaigns"
    : tier === 2
      ? "Standard — Up to ₹1,00,000/month"
      : tier === 1
        ? "Basic — Up to ₹50,000/month"
        : "Unverified — Please complete verification";
}
