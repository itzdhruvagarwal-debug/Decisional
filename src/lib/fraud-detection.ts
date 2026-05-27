/**
 * Fraud Detection - Rule-Based System
 * No AI/ML - Pure pattern matching and threshold checks
 */

import prisma from "./db";
import { logger } from "./logger";
import { findPostByUrl } from "./instagram";
import { getYouTubeVideo, extractVideoId } from "./youtube";
import { isVPNOrProxy } from "./ipinfo";

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
      severity: "HIGH",
      description: `${existingDevices} existing account(s) from this device`,
      evidence: params.deviceFingerprint,
    });
    riskScore += 40;
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
      severity: "MEDIUM",
      description: `${recentIPRegistrations} registrations from this IP in 24h`,
      evidence: params.ipAddress,
    });
    riskScore += 25;
  }

  // Rule 3: Disposable email domain
  const disposableDomains = [
    "tempmail.com",
    "guerrillamail.com",
    "10minutemail.com",
    "throwaway.email",
    "mailinator.com",
    "yopmail.com",
    "trashmail.com",
    "fakeinbox.com",
  ];
  const emailDomain = params.email.split("@")[1]?.toLowerCase();

  if (emailDomain && disposableDomains.includes(emailDomain)) {
    flags.push({
      rule: "DISPOSABLE_EMAIL",
      severity: "HIGH",
      description: "Disposable email address detected",
      evidence: emailDomain,
    });
    riskScore += 35;
  }

  // Rule 4: VPN/Proxy detection via IPInfo enterprise module
  const isVPN = await isVPNOrProxy(params.ipAddress);
  if (isVPN) {
    flags.push({
      rule: "VPN_DETECTED",
      severity: "MEDIUM",
      description: "VPN or proxy IP detected",
      evidence: params.ipAddress,
    });
    riskScore += 20;
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
    riskScore += 40;
  }

  // Rule 2: Copy-paste proposal detection
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
      calculateSimilarity(p.proposal, params.proposalContent) > 0.9,
  );

  if (similarProposals.length >= 3) {
    flags.push({
      rule: "COPY_PASTE_PROPOSALS",
      severity: "MEDIUM",
      description: `${similarProposals.length} similar proposals detected`,
    });
    riskScore += 30;
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
      severity: "LOW",
      description: "Proposed rate significantly below campaign budget",
    });
    riskScore += 15;
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
  bankAccount?: string;
  upiId?: string;
}

export async function checkPaymentFraud(
  params: PaymentCheckParams,
): Promise<FraudCheckResult> {
  const flags: FraudFlag[] = [];
  let riskScore = 0;

  // Rule 1: Rapid withdrawals (>5 in a day)
  const todayWithdrawals = await prisma.withdrawal.count({
    where: {
      wallet: { userId: params.userId },
      createdAt: {
        gte: new Date(new Date().setHours(0, 0, 0, 0)),
      },
    },
  });

  if (todayWithdrawals >= 5) {
    flags.push({
      rule: "RAPID_WITHDRAWALS",
      severity: "HIGH",
      description: `${todayWithdrawals} withdrawals today`,
    });
    riskScore += 40;
  }

  // Rule 2: Multiple bank accounts
  if (params.bankAccount) {
    const existingWithdrawals = await prisma.withdrawal.findMany({
      where: { wallet: { userId: params.userId } },
      select: { bankAccountNumber: true },
      distinct: ["bankAccountNumber"],
    });

    const uniqueAccounts = new Set(
      existingWithdrawals.map(
        (w: { bankAccountNumber: string }) => w.bankAccountNumber,
      ),
    );
    if (uniqueAccounts.size >= 3 && !uniqueAccounts.has(params.bankAccount)) {
      flags.push({
        rule: "MULTIPLE_BANK_ACCOUNTS",
        severity: "MEDIUM",
        description: "Too many different bank accounts used",
      });
      riskScore += 25;
    }
  }

  // Rule 3: Large withdrawal from new account
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { createdAt: true, trustScore: true },
  });

  const accountAgeDays = user
    ? Math.floor(
      (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    )
    : 0;

  if (accountAgeDays < 30 && params.amount > 2500000) {
    // ₹25,000 for new accounts
    flags.push({
      rule: "LARGE_WITHDRAWAL_NEW_ACCOUNT",
      severity: "HIGH",
      description: "Large withdrawal from account less than 30 days old",
    });
    riskScore += 35;
  }

  // Rule 4: Trust score too low
  if (user && user.trustScore < 40) {
    flags.push({
      rule: "LOW_TRUST_SCORE_WITHDRAWAL",
      severity: "MEDIUM",
      description: `Trust score ${user.trustScore} below threshold`,
    });
    riskScore += 20;
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

// ==================== POST VERIFICATION CHECKS ====================

interface PostVerificationParams {
  dealId: string;
  influencerUserId?: string; // Optional: used to fetch access tokens for deep verification
  postUrl: string;
  requiredTags: string[]; // Brand handles or specific words
  requiredHashtags: string[];
  postingDeadline: Date;
}

export async function checkPostVerification(
  params: PostVerificationParams,
): Promise<FraudCheckResult> {
  const flags: FraudFlag[] = [];
  let riskScore = 0;

  // 1. Official platform API content retrieval
  let verifiedPostData: any = null;

  // Deep Verification: If it's Instagram, try to use Official API if we have a token
  if (params.postUrl.includes("instagram.com") && params.influencerUserId) {
    try {
      const oauth = await prisma.oAuthAccount.findFirst({
        where: { userId: params.influencerUserId, provider: "instagram" },
        select: { accessToken: true },
      });

      if (oauth?.accessToken) {
        const igPost = await findPostByUrl(oauth.accessToken, params.postUrl);
        if (igPost) {
          verifiedPostData = {
            isPublic: true,
            caption: igPost.caption,
            mentions: [...(igPost.caption.match(/@(\w+)/g) || [])].map((m) =>
              m.slice(1),
            ),
            hashtags: [...(igPost.caption.match(/#(\w+)/g) || [])].map((h) =>
              h.slice(1),
            ),
            postTimestamp: new Date(igPost.timestamp),
          };
          logger.info("Deep verification used for Instagram post", {
            dealId: params.dealId,
          });
        }
      }
    } catch (apiError) {
      logger.warn("Instagram official verification failed", {
        error: apiError,
      });
    }
  }

  // Deep Verification: If it's YouTube
  const youtubeId = extractVideoId(params.postUrl);
  if (!verifiedPostData && youtubeId) {
    try {
      // Try with OAuth token first if available
      let accessToken: string | undefined;
      if (params.influencerUserId) {
        const oauth = await prisma.oAuthAccount.findFirst({
          where: {
            userId: params.influencerUserId,
            provider: { in: ["youtube", "google"] },
          },
          select: { accessToken: true },
        });
        accessToken = oauth?.accessToken || undefined;
      }

      const ytVideo = await getYouTubeVideo(youtubeId, accessToken);
      if (ytVideo) {
        verifiedPostData = {
          isPublic: ytVideo.isLive,
          caption: ytVideo.description,
          // YouTube descriptions often use different mention formats, but we'll try the common @username
          mentions: [...(ytVideo.description.match(/@([\w.-]+)/g) || [])].map(
            (m) => m.slice(1),
          ),
          hashtags: [...(ytVideo.description.match(/#(\w+)/g) || [])].map((h) =>
            h.slice(1),
          ),
          postTimestamp: new Date(ytVideo.publishedAt),
        };
        logger.info("Deep verification used for YouTube video", {
          dealId: params.dealId,
        });
      }
    } catch (apiError) {
      logger.warn("YouTube official verification failed", {
        error: apiError,
      });
    }
  }

  if (!verifiedPostData) {
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

  // Rule 1: Post is private
  if (!verifiedPostData.isPublic) {
    flags.push({
      rule: "POST_IS_PRIVATE",
      severity: "CRITICAL",
      description: "Post is not publicly visible",
    });
    riskScore += 100;
  }

  // Rule 2: Brand not tagged
  // Check mentions against required tags
  const brandMentioned = params.requiredTags.some(
    (tag) =>
      verifiedPostData.mentions.some((m: string) =>
        m.toLowerCase().includes(tag.replace("@", "").toLowerCase()),
      ) || verifiedPostData.caption.toLowerCase().includes(tag.toLowerCase()),
  );

  if (params.requiredTags.length > 0 && !brandMentioned) {
    flags.push({
      rule: "BRAND_NOT_TAGGED",
      severity: "HIGH",
      description: `Brand tags missing: ${params.requiredTags.join(", ")}`,
    });
    riskScore += 40;
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
      severity: "MEDIUM",
      description: `Missing hashtags: ${missingHashtags.join(", ")}`,
    });
    riskScore += 20;
  }

  // Rule 4: #ad not in caption (FTC compliance)
  const captionLower = verifiedPostData.caption.toLowerCase();
  const hasAdDisclosure =
    captionLower.includes("#ad") ||
    captionLower.includes("#sponsored") ||
    captionLower.includes("#paidpartnership");

  if (!hasAdDisclosure) {
    flags.push({
      rule: "NO_AD_DISCLOSURE",
      severity: "HIGH",
      description: "#ad or #sponsored disclosure missing",
    });
    riskScore += 35;
  }

  // Rule 5: Posted after deadline
  if (verifiedPostData.postTimestamp > params.postingDeadline) {
    const hoursLate = Math.floor(
      (verifiedPostData.postTimestamp.getTime() - params.postingDeadline.getTime()) /
      (1000 * 60 * 60),
    );
    flags.push({
      rule: "POSTED_LATE",
      severity: "MEDIUM",
      description: `Posted ${hoursLate} hours after deadline`,
    });
    riskScore += 15;
  }

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
  if (params.views > 0) {
    const likeViewRatio = (params.likes / params.views) * 100;
    if (likeViewRatio > 30) {
      flags.push({
        rule: "ABNORMAL_LIKE_VIEW_RATIO",
        severity: "HIGH",
        description: `Like/view ratio ${likeViewRatio.toFixed(1)}% is abnormally high (industry: 3-15%)`,
      });
      riskScore += 35;
    }
    if (likeViewRatio < 0.5 && params.views > 1000) {
      flags.push({
        rule: "LOW_LIKE_VIEW_RATIO",
        severity: "MEDIUM",
        description: `Like/view ratio ${likeViewRatio.toFixed(1)}% is abnormally low — possible bot views`,
      });
      riskScore += 20;
    }
  }

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

    if (oauth?.accessToken) {
      const post = await findPostByUrl(oauth.accessToken, postUrl);
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
      severity: "HIGH",
      description: "Official platform API no longer returns the post as public",
    });
    riskScore += 50;
  } else if (verifiedLive === null) {
    flags.push({
      rule: "OFFICIAL_VERIFICATION_UNAVAILABLE",
      severity: "MEDIUM",
      description: "Official platform API verification is unavailable",
    });
    riskScore += 30;
  }

  let action: FraudCheckResult["action"] = "ALLOW";
  if (riskScore >= 50) action = "REVIEW";
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
  const duplicate = await prisma.deal.findFirst({
    where: {
      verificationHash: contentHash,
      id: currentDealId ? { not: currentDealId } : undefined, // Exclude current deal if updating
      status: { in: ["COMPLETED", "VERIFIED", "POSTED", "CONTENT_APPROVED"] },
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
