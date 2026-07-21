/**
 * Fraud Detection - Rule-Based System
 * No AI/ML - Pure pattern matching and threshold checks
 */

import prisma from "./db";
import { Prisma } from "@prisma/client";
import { logger } from "./logger";
import { findPostByUrl, checkIsInstagramPostPublic } from "./instagram";
import { getYouTubeVideo, extractVideoId, getFreshYouTubeAccessToken } from "./youtube";
import { decrypt, hashForDuplicateDetection } from "./encryption";

import { isVPNOrProxy } from "./ipinfo";

import disposableDomainsList from "disposable-email-domains";


// ==================== FRAUD DETECTION RULES ====================

export interface FraudCheckResult {
  passed: boolean;
  flags: FraudFlag[];
  riskScore: number; // 0-100
  action: "ALLOW" | "FLAG" | "BLOCK" | "REVIEW";
}

export interface FraudFlag {
  rule: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  evidence?: string;
}

// ==================== USER REGISTRATION CHECKS ====================

interface RegistrationCheckParams {
  email: string;
  phone: string;
  ipAddress: string;
  deviceFingerprint: string;
  userAgent: string;
}

export async function checkRegistrationFraud(
  params: RegistrationCheckParams,
): Promise<FraudCheckResult> {
  const flags: FraudFlag[] = [];
  let riskScore = 0;

  // Rule 0: Global Blacklist Check
  const blacklistCheck = await checkBlacklist(params.email, params.phone);
  if (!blacklistCheck.passed) {
    return blacklistCheck;
  }

  // Rule 1: Multiple accounts from same device
  const existingDevices = await prisma.deviceFingerprint.count({
    where: { fingerprint: params.deviceFingerprint },
  });

  if (existingDevices > 0) {
    flags.push({
      rule: "MULTIPLE_ACCOUNTS_SAME_DEVICE",
      severity: "CRITICAL",
      description: `${existingDevices} existing account(s) from this device`,
      evidence: params.deviceFingerprint,
    });
    riskScore += 60;
  }

  // Rule 2: Multiple accounts from same IP in last 24h
  const recentIPRegistrations = await prisma.user.count({
    where: {
      activityLogs: {
        some: {
          action: "REGISTER",
          ipAddress: params.ipAddress,
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      },
    },
  });

  if (recentIPRegistrations >= 3) {
    flags.push({
      rule: "MULTIPLE_REGISTRATIONS_SAME_IP",
      severity: "HIGH",
      description: `${recentIPRegistrations} registrations from this IP in 24h`,
      evidence: params.ipAddress,
    });
    riskScore += 40;
  }

  // Rule 3: Disposable email domain
  const disposableDomains = (disposableDomainsList || []) as string[];
  const emailDomain = params.email.split("@")[1]?.toLowerCase();

  const isDisposable =
    emailDomain &&
    (disposableDomains.includes(emailDomain) ||
      [
        "tempmail.com",
        "guerrillamail.com",
        "10minutemail.com",
        "throwaway.email",
        "mailinator.com",
        "yopmail.com",
        "trashmail.com",
        "fakeinbox.com",
        "dispostable.com",
        "getairmail.com",
        "maildrop.cc",
        "mintemail.com",
        "sharklasers.com",
        "temp-mail.org",
        "temp-mail.com",
        "generator.email",
        "yopmail.fr",
        "yopmail.net",
        "duck.com",
      ].includes(emailDomain));

  if (isDisposable && emailDomain) {
    flags.push({
      rule: "DISPOSABLE_EMAIL",
      severity: "CRITICAL",
      description: "Disposable email address detected",
      evidence: emailDomain,
    });
    riskScore += 60;
  }

  // Rule 4: VPN/Proxy detection via IPInfo enterprise module
  const isVPN = await isVPNOrProxy(params.ipAddress);
  if (isVPN) {
    flags.push({
      rule: "VPN_DETECTED",
      severity: "HIGH",
      description: "VPN or proxy IP detected",
      evidence: params.ipAddress,
    });
    riskScore += 50;
  }

  // Determine action
  let action: FraudCheckResult["action"] = "ALLOW";
  if (riskScore >= 80) action = "BLOCK";
  else if (riskScore >= 50) action = "REVIEW";
  else if (riskScore >= 25) action = "FLAG";

  return {
    passed: action === "ALLOW" || action === "FLAG",
    flags,
    riskScore,
    action,
  };
}

// ==================== APPLICATION CHECKS ====================

interface ApplicationCheckParams {
  userId: string;
  campaignId: string;
  proposalContent: string;
  proposedRate?: number;
}

export async function checkApplicationFraud(
  params: ApplicationCheckParams,
): Promise<FraudCheckResult> {
  const flags: FraudFlag[] = [];
  let riskScore = 0;

  // Rule 1: Bulk applications (>10 in last hour)
  // Note: Application.influencerId is the InfluencerProfile.id, not the User.id
  const influencerProfile = await prisma.influencerProfile.findUnique({
    where: { userId: params.userId },
    select: { id: true },
  });

  const recentApplications = influencerProfile
    ? await prisma.application.count({
      where: {
        influencerId: influencerProfile.id,
        createdAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000),
        },
      },
    })
    : 0;

  if (recentApplications >= 10) {
    flags.push({
      rule: "BULK_APPLICATIONS",
      severity: "HIGH",
      description: `${recentApplications} applications in the last hour`,
    });
    riskScore += 60;
  }

  // Rule 2: Copy-paste proposal detection
  // GUARD: Only run Jaccard similarity on substantive proposals (>20 chars).
  // Short generic messages like "Hi, I'm interested" trivially produce
  // high similarity scores because the word-set is tiny.
  const trimmedProposal = params.proposalContent.trim();

  if (trimmedProposal.length > 20) {
    const recentProposals = influencerProfile
      ? await prisma.application.findMany({
        where: {
          influencerId: influencerProfile.id,
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
        select: { proposal: true },
        take: 10,
      })
      : [];

    const similarProposals = recentProposals.filter(
      (p: { proposal: string }) =>
        calculateSimilarity(p.proposal, trimmedProposal) > 0.9,
    );

    if (similarProposals.length >= 2) {
      flags.push({
        rule: "COPY_PASTE_PROPOSALS",
        severity: "HIGH",
        description: `${similarProposals.length} similar proposals detected`,
      });
      riskScore += 50;
    }
  }

  // Rule 3: Suspiciously low rate (potential fake deal farming)
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.campaignId },
    select: { perInfluencerBudget: true },
  });

  if (
    campaign?.perInfluencerBudget &&
    params.proposedRate &&
    params.proposedRate < campaign.perInfluencerBudget * 0.2
  ) {
    flags.push({
      rule: "SUSPICIOUSLY_LOW_RATE",
      severity: "MEDIUM",
      description: "Proposed rate significantly below campaign budget",
    });
    riskScore += 30;
  }

  // Determine action
  let action: FraudCheckResult["action"] = "ALLOW";
  if (riskScore >= 60) action = "BLOCK";
  else if (riskScore >= 35) action = "REVIEW";
  else if (riskScore >= 15) action = "FLAG";

  return {
    passed: action === "ALLOW" || action === "FLAG",
    flags,
    riskScore,
    action,
  };
}

// ==================== PAYMENT CHECKS ====================

interface PaymentCheckParams {
  userId: string;
  amount: number;
  bankAccount?: string | undefined;
  upiId?: string | undefined;
}

async function checkWithdrawalVelocityAndLimits(
  userId: string,
  amount: number,
  flags: FraudFlag[]
): Promise<number> {
  let score = 0;
  const todayWithdrawals = await prisma.withdrawal.count({
    where: {
      wallet: { userId },
      createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    },
  });

  if (todayWithdrawals >= 3) {
    flags.push({
      rule: "RAPID_WITHDRAWALS",
      severity: "HIGH",
      description: `${todayWithdrawals} withdrawals today`,
    });
    score += 60;
  }

  const last24hWithdrawals = await prisma.withdrawal.findMany({
    where: {
      wallet: { userId },
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    select: { amount: true },
  });
  const totalWithdrawn24h = last24hWithdrawals.reduce((acc: number, w: { amount: number }) => acc + w.amount, 0);
  if (totalWithdrawn24h + amount > 5000000) {
    flags.push({
      rule: "DAILY_WITHDRAWAL_LIMIT_EXCEEDED",
      severity: "HIGH",
      description: `Total withdrawals in the last 24h exceeds ₹50,000 limit`,
    });
    score += 55;
  }

  return score;
}

async function checkDuplicatePayoutAccounts(
  userId: string,
  bankAccount: string | undefined,
  upiId: string | undefined,
  flags: FraudFlag[]
): Promise<number> {
  let score = 0;

  if (bankAccount && bankAccount !== "UPI_PAYOUT") {
    const bankAccountHash = hashForDuplicateDetection(bankAccount);
    
    const duplicateBank = await prisma.withdrawal.findFirst({
      where: {
        bankAccountHash,
        wallet: { userId: { not: userId } },
      },
      select: { id: true },
    });

    if (duplicateBank) {
      flags.push({
        rule: "DUPLICATE_BANK_ACCOUNT_REUSE",
        severity: "CRITICAL",
        description: `This bank account is associated with another user account`,
      });
      score += 100;
    }
  }

  if (upiId) {
    const upiIdHash = hashForDuplicateDetection(upiId);
    
    const duplicateUpi = await prisma.withdrawal.findFirst({
      where: {
        upiIdHash,
        wallet: { userId: { not: userId } },
      },
      select: { id: true },
    });

    if (duplicateUpi) {
      flags.push({
        rule: "DUPLICATE_UPI_REUSE",
        severity: "CRITICAL",
        description: `This UPI ID is associated with another user account`,
      });
      score += 100;
    }
  }

  return score;
}

async function checkMultipleBankAccounts(
  userId: string,
  bankAccount: string | undefined,
  flags: FraudFlag[]
): Promise<number> {
  if (!bankAccount) return 0;
  
  const existingWithdrawals = await prisma.withdrawal.findMany({
    where: { wallet: { userId } },
    select: { bankAccountHash: true },
    take: 100,
  });

  const accountHashes = new Set<string>();
  for (const w of existingWithdrawals) {
    if (w.bankAccountHash) {
      accountHashes.add(w.bankAccountHash);
    }
  }

  const currentHash = hashForDuplicateDetection(bankAccount);
  if (accountHashes.size >= 3 && !accountHashes.has(currentHash)) {
    flags.push({
      rule: "MULTIPLE_BANK_ACCOUNTS",
      severity: "HIGH",
      description: "Too many different bank accounts used",
    });
    return 45;
  }

  return 0;
}

export async function checkPaymentFraud(
  params: PaymentCheckParams,
): Promise<FraudCheckResult> {
  const flags: FraudFlag[] = [];
  let riskScore = 0;

  riskScore += await checkWithdrawalVelocityAndLimits(params.userId, params.amount, flags);
  riskScore += await checkDuplicatePayoutAccounts(params.userId, params.bankAccount, params.upiId, flags);
  riskScore += await checkMultipleBankAccounts(params.userId, params.bankAccount, flags);

  // Rule 3: Large withdrawal from new account
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { createdAt: true, trustScore: true },
  });

  if (user) {
    const accountAgeDays = Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    if (accountAgeDays < 30 && params.amount > 2500000) {
      flags.push({
        rule: "LARGE_WITHDRAWAL_NEW_ACCOUNT",
        severity: "HIGH",
        description: "Large withdrawal from account less than 30 days old",
      });
      riskScore += 55;
    }

    if (user.trustScore < 600) {
      flags.push({
        rule: "LOW_TRUST_SCORE_WITHDRAWAL",
        severity: "HIGH",
        description: `Trust score ${user.trustScore} below threshold`,
      });
      riskScore += 50;
    }
  }

  // Determine action
  let action: FraudCheckResult["action"] = "ALLOW";
  if (riskScore >= 70) action = "BLOCK";
  else if (riskScore >= 45) action = "REVIEW";
  else if (riskScore >= 20) action = "FLAG";

  return {
    passed: action === "ALLOW" || action === "FLAG",
    flags,
    riskScore,
    action,
  };
}

interface VerifiedPostData {
  isPublic: boolean;
  caption: string;
  isPaidPartnership: boolean;
  mentions: string[];
  hashtags: string[];
  postTimestamp: Date;
  likeCount?: number;
  commentCount?: number;
  viewCount?: number;
}

// ==================== POST VERIFICATION CHECKS ====================

interface PostVerificationParams {
  dealId: string;
  influencerUserId?: string; // Optional: used to fetch access tokens for deep verification
  postUrl: string;
  requiredTags: string[]; // Brand handles or specific words
  requiredHashtags: string[];
  postingDeadline: Date;
  submissionTimestamp?: Date; // When the influencer submitted the post
  dealAcceptedAt?: Date; // When the deal was accepted
  dealAmount?: number; // Deal amount in paise — kept for backward compat, no longer used as gate
  followerCount?: number; // Influencer's current follower count (used in engagement anomaly check)
  engagementMetrics?: {
    followers: number;
    likes: number;
    comments: number;
    views: number;
    shares: number;
  };
  comments?: string[]; // Comments for quality analysis
}

async function fetchInstagramPostData(postUrl: string, userId?: string): Promise<VerifiedPostData | null> {
  if (!postUrl.includes("instagram.com") || !userId) return null;
  try {
    const oauth = await prisma.oAuthAccount.findFirst({
      where: { userId, provider: "instagram" },
      select: { accessToken: true },
    });
    const decryptedAccessToken = oauth?.accessToken ? decrypt(oauth.accessToken) : null;
    if (decryptedAccessToken) {
      const igPost = await findPostByUrl(decryptedAccessToken, postUrl);
      if (igPost) {
        return {
          isPublic: await checkIsInstagramPostPublic(igPost.permalink),
          caption: igPost.caption,
          isPaidPartnership: igPost.isPaidPartnership ?? false,
          mentions: [...(igPost.caption.match(/@(\w+)/g) || [])].map((m) => m.slice(1)),
          hashtags: [...(igPost.caption.match(/#(\w+)/g) || [])].map((h) => h.slice(1)),
          postTimestamp: new Date(igPost.timestamp),
          likeCount: igPost.likeCount,
          commentCount: igPost.commentsCount,
          // viewCount: not available in basic IG Graph API without Insights scope
        };
      }
    }
  } catch (apiError) {
    logger.warn("Instagram official verification failed", {
      error: apiError instanceof Error ? apiError.message : String(apiError),
    });
  }
  return null;
}

async function fetchYouTubePostData(postUrl: string, userId?: string): Promise<VerifiedPostData | null> {
  const youtubeId = extractVideoId(postUrl);
  if (!youtubeId) return null;
  try {
    let accessToken: string | undefined;
    if (userId) {
      accessToken = (await getFreshYouTubeAccessToken(userId)) ?? undefined;
    }
    const ytVideo = await getYouTubeVideo(youtubeId, accessToken);
    if (ytVideo) {
      return {
        isPublic: ytVideo.isLive,
        isPaidPartnership: false,
        caption: ytVideo.description,
        mentions: [...(ytVideo.description.match(/@([\w.-]+)/g) || [])].map((m) => m.slice(1)),
        hashtags: [...(ytVideo.description.match(/#(\w+)/g) || [])].map((h) => h.slice(1)),
        postTimestamp: new Date(ytVideo.publishedAt),
        likeCount: ytVideo.likeCount,
        commentCount: ytVideo.commentCount,
        viewCount: ytVideo.viewCount,
      };
    }
  } catch (apiError) {
    logger.warn("YouTube official verification failed", {
      error: apiError instanceof Error ? apiError.message : String(apiError),
    });
  }
  return null;
}

function performPostContentChecks(
  verifiedPostData: VerifiedPostData,
  params: PostVerificationParams,
  flags: FraudFlag[]
): number {
  let score = 0;

  // Rule 1: Post is private
  if (!verifiedPostData.isPublic) {
    flags.push({
      rule: "POST_IS_PRIVATE",
      severity: "CRITICAL",
      description: "Post is not publicly visible",
    });
    score += 100;
  }

  // Rule 2: Brand not tagged
  const brandMentioned = params.requiredTags.some(
    (tag) =>
      verifiedPostData.mentions.some((m: string) =>
        m.toLowerCase().includes(tag.replace("@", "").toLowerCase()),
      ) || verifiedPostData.caption.toLowerCase().includes(tag.toLowerCase()),
  );

  if (params.requiredTags.length > 0 && !brandMentioned) {
    flags.push({
      rule: "BRAND_NOT_TAGGED",
      severity: "CRITICAL",
      description: `Brand tags missing: ${params.requiredTags.join(", ")}`,
    });
    score += 80;
  }

  // Rule 3: Required hashtags missing
  const missingHashtags = params.requiredHashtags.filter(
    (h: string) =>
      !verifiedPostData.hashtags.some(
        (sh: string) => sh.toLowerCase() === h.replace("#", "").toLowerCase(),
      ),
  );
  if (missingHashtags.length > 0) {
    flags.push({
      rule: "MISSING_HASHTAGS",
      severity: "HIGH",
      description: `Missing hashtags: ${missingHashtags.join(", ")}`,
    });
    score += 60;
  }

  // Rule 4: #ad / disclosure check
  const captionLower = verifiedPostData.caption.toLowerCase();
  const hasAdDisclosure =
    verifiedPostData.isPaidPartnership === true ||
    captionLower.includes("#ad") ||
    captionLower.includes("#sponsored") ||
    captionLower.includes("#paidpartnership") ||
    captionLower.includes("#collab") ||
    captionLower.includes("#partnership") ||
    captionLower.includes("#paidcollab") ||
    captionLower.includes("#gifted");

  if (!hasAdDisclosure) {
    flags.push({
      rule: "NO_AD_DISCLOSURE",
      severity: "HIGH",
      description:
        "Paid partnership disclosure missing — required by FTC and Indian ASCI guidelines. " +
        "Add #ad, #sponsored, #paidpartnership, #collab, #partnership, #paidcollab, or #gifted, " +
        "or enable Instagram's native Paid Partnership label.",
    });
    score += 70;
  }

  // Rule 5: Posted after deadline
  if (verifiedPostData.postTimestamp > params.postingDeadline) {
    const hoursLate = Math.floor(
      (verifiedPostData.postTimestamp.getTime() - params.postingDeadline.getTime()) /
      (1000 * 60 * 60),
    );
    flags.push({
      rule: "POSTED_LATE",
      severity: "HIGH",
      description: `Posted ${hoursLate} hour${hoursLate === 1 ? "" : "s"} after deadline — requires admin review`,
    });
    score += 70;
  }

  return score;
}

function runVerificationRules(
  verifiedPostData: VerifiedPostData,
  params: PostVerificationParams,
  flags: FraudFlag[]
): number {
  let riskScore = 0;

  // Ensure isPaidPartnership is always present
  verifiedPostData.isPaidPartnership ??= false;

  riskScore += performPostContentChecks(verifiedPostData, params, flags);

  // Rule 6: Fake post timing check (recycled content or instant submission)
  if (params.submissionTimestamp && params.dealAcceptedAt) {
    const timingCheck = checkFakePostTiming({
      postTimestamp: verifiedPostData.postTimestamp,
      submissionTimestamp: params.submissionTimestamp,
      dealAcceptedAt: params.dealAcceptedAt,
    });
    
    if (!timingCheck.passed) {
      flags.push(...timingCheck.flags);
      riskScore += timingCheck.riskScore;
    }
  }

  // Rule 7: Engagement anomaly check — runs on all deals when engagement data is available
  // Data comes from VerifiedPostData (passed through from platform APIs), not caller params.
  if (verifiedPostData.likeCount !== undefined) {
    const engagementCheck = checkEngagementAnomaly({
      followers: params.followerCount ?? 0,
      likes: verifiedPostData.likeCount,
      comments: verifiedPostData.commentCount ?? 0,
      views: verifiedPostData.viewCount ?? 0,
      shares: 0,
    });
    if (!engagementCheck.passed) {
      flags.push(...engagementCheck.flags);
      riskScore += engagementCheck.riskScore;
    }
  }

  // Rule 8: Comment quality check (informational only, doesn't block)
  if (params.comments && params.comments.length > 0) {
    const commentCheck = checkCommentQuality(params.comments);
    // For comment quality, we only add flags but don't increase risk score (informational)
    if (commentCheck.flags.length > 0) {
      flags.push(...commentCheck.flags.map(f => ({
        ...f,
        severity: "LOW" as const, // Downgrade to informational
      })));
    }
  }

  return riskScore;
}

export async function checkPostVerification(
  params: PostVerificationParams,
): Promise<FraudCheckResult> {
  const flags: FraudFlag[] = [];
  let riskScore = 0;

  // 1. Official platform API content retrieval
  let verifiedPostData: VerifiedPostData | null = null;

  // Deep Verification: If it's Instagram, try to use Official API if we have a token
  if (params.postUrl.includes("instagram.com")) {
    const igData = await fetchInstagramPostData(params.postUrl, params.influencerUserId);
    if (igData) {
      verifiedPostData = igData;
      logger.info("Deep verification used for Instagram post", { dealId: params.dealId });
    } else if (params.influencerUserId) {
      flags.push({
        rule: "POST_NO_LONGER_ACCESSIBLE",
        severity: "CRITICAL",
        description: "Instagram post not found in recent media (deleted or private)",
      });
      riskScore += 80;
    }
  }

  // Deep Verification: If it's YouTube
  if (!verifiedPostData && (params.postUrl.includes("youtube.com") || params.postUrl.includes("youtu.be"))) {
    const ytData = await fetchYouTubePostData(params.postUrl, params.influencerUserId);
    if (ytData) {
      verifiedPostData = ytData;
      logger.info("Deep verification used for YouTube video", { dealId: params.dealId });
    } else {
      flags.push({
        rule: "POST_NO_LONGER_ACCESSIBLE",
        severity: "CRITICAL",
        description: "YouTube video not found (deleted or private)",
      });
      riskScore += 80;
    }
  }

  if (!verifiedPostData) {
    const isNoLongerAccessible = flags.some((f) => f.rule === "POST_NO_LONGER_ACCESSIBLE");
    if (isNoLongerAccessible) {
      return {
        passed: false,
        flags,
        riskScore,
        action: "BLOCK",
      };
    }
    return {
      passed: true,
      flags: [
        {
          rule: "OFFICIAL_VERIFICATION_UNAVAILABLE",
          severity: "MEDIUM",
          description:
            "Could not verify the post through official platform APIs. Manual review recommended.",
        },
      ],
      riskScore: 20,
      action: "REVIEW",
    };
  }

  riskScore += runVerificationRules(verifiedPostData, params, flags);

  // Determine action
  let action: FraudCheckResult["action"] = "ALLOW";
  if (riskScore >= 80) action = "BLOCK";
  else if (riskScore >= 40) action = "REVIEW";
  else if (riskScore >= 15) action = "FLAG";

  return {
    passed: action === "ALLOW" || action === "FLAG",
    flags,
    riskScore,
    action,
  };
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Simple text similarity using Jaccard index
 */
function calculateSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

// VPN/Proxy check is now handled by the standalone ipinfo.ts module
// See: src/lib/ipinfo.ts — isVPNOrProxy()

// ==================== GROWTH & METRICS CHECKS ====================

interface GrowthCheckParams {
  currentFollowers: number;
  previousFollowers: number;
  timeDeltaHours: number;
}

export function checkGrowthFraud(params: GrowthCheckParams): FraudCheckResult {
  const flags: FraudFlag[] = [];
  let riskScore = 0;

  // Rule: >20% growth in 48h is suspicious
  if (
    params.timeDeltaHours > 0 &&
    params.timeDeltaHours <= 48 &&
    params.previousFollowers > 0
  ) {
    const growthRate =
      (params.currentFollowers - params.previousFollowers) /
      params.previousFollowers;

    if (growthRate > 0.2) {
      flags.push({
        rule: "UNNATURAL_GROWTH_SPIKE",
        severity: "HIGH",
        description: `Suspicious growth of ${(growthRate * 100).toFixed(1)}% in ${params.timeDeltaHours}h`,
      });
      riskScore += 40;
    }
  }

  let action: FraudCheckResult["action"] = "ALLOW";
  if (riskScore >= 40) action = "FLAG";

  return {
    passed: action === "ALLOW",
    flags,
    riskScore,
    action,
  };
}

// ==================== ANTI-CHEAT: FAKE POST DETECTION ====================

interface FakePostTimingParams {
  postTimestamp: Date; // When the post was published on the platform
  submissionTimestamp: Date; // When the influencer submitted it to the platform
  dealAcceptedAt: Date; // When the deal was accepted
}

/**
 * Flag posts that appear too quickly after deal acceptance — likely pre-made or recycled content.
 * Also detects suspiciously small gaps between post creation and submission.
 */
export function checkFakePostTiming(
  params: FakePostTimingParams,
): FraudCheckResult {
  const flags: FraudFlag[] = [];
  let riskScore = 0;

  // Rule 1: Post created < 1 minute before submission (instant submission = suspicious)
  const gapMinutes =
    (params.submissionTimestamp.getTime() - params.postTimestamp.getTime()) /
    (1000 * 60);
  if (gapMinutes < 1 && gapMinutes >= 0) {
    flags.push({
      rule: "INSTANT_POST_SUBMISSION",
      severity: "HIGH",
      description: `Post was created less than 1 minute before submission (${gapMinutes.toFixed(1)}m gap)`,
    });
    riskScore += 40;
  }

  // Rule 2: Post was created before deal was accepted (recycled content)
  if (params.postTimestamp < params.dealAcceptedAt) {
    const hoursBefore =
      (params.dealAcceptedAt.getTime() - params.postTimestamp.getTime()) /
      (3600 * 1000);
    flags.push({
      rule: "PRE_DEAL_CONTENT",
      severity: "CRITICAL",
      description: `Post was created ${Math.round(hoursBefore)}h BEFORE deal acceptance — likely recycled content`,
    });
    riskScore += 80;
  }

  // Rule 3: Post was created within 30 minutes of deal acceptance (too fast for quality content)
  const hoursAfterAcceptance =
    (params.postTimestamp.getTime() - params.dealAcceptedAt.getTime()) /
    (3600 * 1000);
  if (hoursAfterAcceptance > 0 && hoursAfterAcceptance < 0.5) {
    flags.push({
      rule: "SUSPICIOUSLY_FAST_CREATION",
      severity: "MEDIUM",
      description: `Content created within 30 minutes of deal acceptance`,
    });
    riskScore += 25;
  }

  let action: FraudCheckResult["action"] = "ALLOW";
  if (riskScore >= 80) action = "BLOCK";
  else if (riskScore >= 40) action = "REVIEW";
  else if (riskScore >= 25) action = "FLAG";

  return {
    passed: action === "ALLOW" || action === "FLAG",
    flags,
    riskScore,
    action,
  };
}

// ==================== ENGAGEMENT ANOMALY DETECTION ====================

interface EngagementAnomalyParams {
  followers: number;
  likes: number;
  comments: number;
  views: number;
  shares: number;
}

function checkLikeViewAnomaly(
  likes: number,
  views: number,
  flags: FraudFlag[]
): number {
  let riskScore = 0;
  if (views > 0) {
    const likeViewRatio = (likes / views) * 100;
    if (likeViewRatio > 30) {
      flags.push({
        rule: "ABNORMAL_LIKE_VIEW_RATIO",
        severity: "HIGH",
        description: `Like/view ratio ${likeViewRatio.toFixed(1)}% is abnormally high (industry: 3-15%)`,
      });
      riskScore += 35;
    }
    if (likeViewRatio < 0.5 && views > 1000) {
      flags.push({
        rule: "LOW_LIKE_VIEW_RATIO",
        severity: "MEDIUM",
        description: `Like/view ratio ${likeViewRatio.toFixed(1)}% is abnormally low — possible bot views`,
      });
      riskScore += 20;
    }
  }
  return riskScore;
}

/**
 * Check for engagement anomalies that suggest bought engagement or bot activity.
 * Uses industry benchmarks for engagement rates by follower tier.
 */
export function checkEngagementAnomaly(
  params: EngagementAnomalyParams,
): FraudCheckResult {
  const flags: FraudFlag[] = [];
  let riskScore = 0;

  // Benchmark engagement rates by follower tier (industry median)
  const engagementRate =
    params.followers > 0
      ? ((params.likes + params.comments) / params.followers) * 100
      : 0;

  // Rule 1: Like/View ratio anomaly
  // Normal ratio: 3-15% for reels/videos
  riskScore += checkLikeViewAnomaly(params.likes, params.views, flags);

  // Rule 2: Engagement rate vs follower count benchmark
  // Nano (1K-10K): 4-6% avg | Micro (10K-50K): 2-4% | Mid (50K-500K): 1-3% | Macro (500K+): 0.5-2%
  if (params.followers >= 10000 && engagementRate > 15) {
    flags.push({
      rule: "SUSPICIOUSLY_HIGH_ENGAGEMENT",
      severity: "HIGH",
      description: `Engagement rate ${engagementRate.toFixed(1)}% is unrealistically high for ${params.followers.toLocaleString()} followers`,
    });
    riskScore += 30;
  }

  // Rule 3: Zero comments but high likes (bot liking pattern)
  if (params.likes > 100 && params.comments === 0) {
    flags.push({
      rule: "ZERO_COMMENTS_HIGH_LIKES",
      severity: "MEDIUM",
      description: `${params.likes} likes but zero comments — typical bot pattern`,
    });
    riskScore += 25;
  }

  // Rule 4: Comment/like ratio anomaly
  // Normal: 1-5% of likes should be comments
  if (params.likes > 50) {
    const commentLikeRatio = (params.comments / params.likes) * 100;
    if (commentLikeRatio > 50) {
      flags.push({
        rule: "ABNORMAL_COMMENT_LIKE_RATIO",
        severity: "MEDIUM",
        description: `Comment/like ratio ${commentLikeRatio.toFixed(1)}% is abnormally high — possible comment bots`,
      });
      riskScore += 20;
    }
  }

  let action: FraudCheckResult["action"] = "ALLOW";
  if (riskScore >= 60) action = "BLOCK";
  else if (riskScore >= 35) action = "REVIEW";
  else if (riskScore >= 20) action = "FLAG";

  return {
    passed: action === "ALLOW" || action === "FLAG",
    flags,
    riskScore,
    action,
  };
}

// ==================== COMMENT QUALITY (BOT DETECTION) ====================

/**
 * Analyze comment quality to detect bot-generated comments.
 * Uses regex patterns for common bot signatures.
 */
export function checkCommentQuality(comments: string[]): FraudCheckResult {
  const flags: FraudFlag[] = [];
  let riskScore = 0;

  if (comments.length === 0) {
    return { passed: true, flags: [], riskScore: 0, action: "ALLOW" };
  }

  // Bot patterns
  const botPatterns = [
    /^(nice|great|wow|amazing|beautiful|love it|cool|awesome|fire|🔥|❤️|👍|💯|😍|👏){1,3}$/i,
    /^follow me/i,
    /^check (my|out)/i,
    /^dm me for/i,
    /^(earn|make) \$?\d+ (per|a) (day|hour)/i,
    /^interested\?? (dm|message|text)/i,
  ];

  const uniqueComments = new Set(comments.map((c) => c.trim().toLowerCase()));
  const duplicateRatio = 1 - uniqueComments.size / comments.length;

  // Rule 1: High duplicate comment ratio
  if (comments.length >= 10 && duplicateRatio > 0.5) {
    flags.push({
      rule: "HIGH_DUPLICATE_COMMENTS",
      severity: "HIGH",
      description: `${(duplicateRatio * 100).toFixed(0)}% of comments are duplicates`,
    });
    riskScore += 35;
  }

  // Rule 2: Bot pattern matching
  const botCommentCount = comments.filter((c) =>
    botPatterns.some((pattern) => pattern.test(c.trim())),
  ).length;

  const botRatio = botCommentCount / comments.length;
  if (botRatio > 0.3) {
    flags.push({
      rule: "BOT_COMMENT_PATTERN",
      severity: "HIGH",
      description: `${(botRatio * 100).toFixed(0)}% of comments match bot patterns`,
    });
    riskScore += 40;
  }

  // Rule 3: Very short comments (all <5 chars)
  const shortComments = comments.filter((c) => c.trim().length < 5).length;
  const shortRatio = shortComments / comments.length;
  if (shortRatio > 0.7 && comments.length >= 10) {
    flags.push({
      rule: "MOSTLY_SHORT_COMMENTS",
      severity: "MEDIUM",
      description: `${(shortRatio * 100).toFixed(0)}% of comments are under 5 characters`,
    });
    riskScore += 20;
  }

  // Rule 4: Low unique commenter ratio (need unique commenters vs total)
  // This would require commenter IDs - here we just check comment diversity
  const uniqueWords = new Set(
    comments.flatMap((c) => c.toLowerCase().split(/\s+/)),
  );
  if (uniqueWords.size < 10 && comments.length >= 20) {
    flags.push({
      rule: "LOW_VOCABULARY_DIVERSITY",
      severity: "MEDIUM",
      description: `Only ${uniqueWords.size} unique words across ${comments.length} comments`,
    });
    riskScore += 15;
  }

  let action: FraudCheckResult["action"] = "ALLOW";
  if (riskScore >= 60) action = "BLOCK";
  else if (riskScore >= 35) action = "REVIEW";
  else if (riskScore >= 15) action = "FLAG";

  return {
    passed: action === "ALLOW" || action === "FLAG",
    flags,
    riskScore,
    action,
  };
}

// ==================== ACCOUNT PRIVACY FLIP DETECTION ====================

/**
 * Check if an influencer's account has been toggled to private after posting deal content.
 * This is a common tactic to hide fake engagement or remove content from public view.
 */
export async function checkAccountPrivacyFlip(
  userId: string,
  postUrl: string,
): Promise<FraudCheckResult> {
  const flags: FraudFlag[] = [];
  let riskScore = 0;

  let verifiedLive: boolean | null = null;

  if (postUrl.includes("instagram.com")) {
    const oauth = await prisma.oAuthAccount.findFirst({
      where: { userId, provider: "instagram" },
      select: { accessToken: true },
    });

    const decryptedAccessToken = oauth?.accessToken ? decrypt(oauth.accessToken) : null;

    if (decryptedAccessToken) {
      const post = await findPostByUrl(decryptedAccessToken, postUrl);
      verifiedLive = Boolean(post);
    }
  }

  const youtubeId = extractVideoId(postUrl);
  if (verifiedLive === null && youtubeId) {
    const video = await getYouTubeVideo(youtubeId);
    verifiedLive = Boolean(video?.isLive);
  }

  if (verifiedLive === false) {
    flags.push({
      rule: "POST_NO_LONGER_ACCESSIBLE",
      severity: "CRITICAL",
      description: "Official platform API no longer returns the post as public",
    });
    riskScore += 80;
  } else if (verifiedLive === null) {
    flags.push({
      rule: "OFFICIAL_VERIFICATION_UNAVAILABLE",
      severity: "HIGH",
      description: "Official platform API verification is unavailable",
    });
    riskScore += 50;
  }

  let action: FraudCheckResult["action"] = "ALLOW";
  if (riskScore >= 80) action = "BLOCK";
  else if (riskScore >= 50) action = "REVIEW";
  else if (riskScore >= 30) action = "FLAG";

  return {
    passed: action === "ALLOW" || action === "FLAG",
    flags,
    riskScore,
    action,
  };
}

// ==================== CONTENT UNIQUENESS CHECKS ====================

export async function checkContentUniqueness(
  contentHash: string,
  currentDealId?: string,
): Promise<FraudCheckResult> {
  const flags: FraudFlag[] = [];
  let riskScore = 0;

  // Check if this content hash has been used in any other deal
  // This prevents:
  // 1. Resubmitting same content for multiple campaigns
  // 2. Stealing content from other influencers (if hash matches)

  // Note: This requires the Deal model to have verificationHash field (which it does)
  const duplicateWhere: Prisma.DealWhereInput = {
    verificationHash: contentHash,
    status: { in: ["COMPLETED", "VERIFIED", "POSTED", "CONTENT_APPROVED"] },
  };
  if (currentDealId) {
    duplicateWhere.id = { not: currentDealId };
  }

  const duplicate = await prisma.deal.findFirst({
    where: {
      ...duplicateWhere,
    },
    select: {
      id: true,
      influencerId: true,
      postedAt: true,
    },
  });

  if (duplicate) {
    flags.push({
      rule: "DUPLICATE_CONTENT_HASH",
      severity: "CRITICAL",
      description: `Content matches existing deal ${duplicate.id}`,
      evidence: `Match found with deal from ${duplicate.postedAt}`,
    });
    riskScore += 100; // Immediate block
  }

  let action: FraudCheckResult["action"] = "ALLOW";
  if (riskScore >= 100) action = "BLOCK";

  return {
    passed: action === "ALLOW",
    flags,
    riskScore,
    action,
  };
}

// ==================== BLACKLIST CHECKS ====================

export async function checkBlacklist(
  email: string,
  phone?: string,
): Promise<FraudCheckResult> {
  const flags: FraudFlag[] = [];
  let riskScore = 0;

  // Check DB for users with this email/phone who are already BANNED
  const bannedUser = await prisma.user.findFirst({
    where: {
      OR: [{ email: email.toLowerCase() }, ...(phone ? [{ phone }] : [])],
      status: "BANNED",
    },
    select: { id: true, email: true },
  });

  if (bannedUser) {
    flags.push({
      rule: "PREVIOUSLY_BANNED_ACCOUNT",
      severity: "CRITICAL",
      description: `Email or phone is associated with a previously banned account`,
    });
    riskScore += 100;
  }

  // Also check UserViolation table for PERMANENT_BAN violations
  const activeViolation = await prisma.userViolation.findFirst({
    where: {
      user: { email: email.toLowerCase() },
      action: "PERMANENT_BAN",
    },
  });

  if (activeViolation && !bannedUser) {
    flags.push({
      rule: "ACTIVE_PERMANENT_BAN_VIOLATION",
      severity: "CRITICAL",
      description: "Account has an active permanent ban violation record",
    });
    riskScore += 100;
  }

  return {
    passed: riskScore === 0,
    flags,
    riskScore,
    action: riskScore >= 100 ? "BLOCK" : "ALLOW",
  };
}
