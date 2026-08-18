import prisma from "../db";
import { logger } from "../logger";
import { decrypt } from "../encryption";
import { findPostByUrl, checkIsInstagramPostPublic } from "../instagram";
import { getYouTubeVideo, extractVideoId, getFreshYouTubeAccessToken } from "../youtube";
import { FraudCheckResult, FraudFlag, PaymentCheckParams, VerifiedPostData, PostVerificationParams } from "./types";
import {
checkWithdrawalVelocityAndLimits,
checkDuplicatePayoutAccounts,
checkMultipleBankAccounts,
} from "./application";
import {
checkFakePostTiming,
checkEngagementAnomaly,
checkCommentQuality,
} from "./social";

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


// ==================== POST VERIFICATION CHECKS ====================


export async function fetchInstagramPostData(postUrl: string, userId?: string): Promise<VerifiedPostData | null> {
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
          const caption = igPost.caption ?? "";
          return {
            isPublic: await checkIsInstagramPostPublic(igPost.permalink),
            caption,
            isPaidPartnership: igPost.isPaidPartnership ?? false,
            mentions: [...(caption.match(/@(\w+)/g) || [])].map((m) => m.slice(1)),
            hashtags: [...(caption.match(/#(\w+)/g) || [])].map((h) => h.slice(1)),
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

export async function fetchYouTubePostData(postUrl: string, userId?: string): Promise<VerifiedPostData | null> {
const youtubeId = extractVideoId(postUrl);
if (!youtubeId) return null;
try {
let accessToken: string | undefined;
if (userId) {
accessToken = (await getFreshYouTubeAccessToken(userId)) ?? undefined;
}
    const ytVideo = await getYouTubeVideo(youtubeId, accessToken);
    if (ytVideo) {
      const isPublic = ytVideo.privacyStatus ? ytVideo.privacyStatus === "public" : true;
      return {
        isPublic,
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
  const missingBrandTags = params.requiredTags.filter((tag) => {
    const cleanTag = tag.replace("@", "").toLowerCase();
    const mentionedInList = verifiedPostData.mentions.some((m: string) =>
      m.toLowerCase().includes(cleanTag),
    );
    const mentionedInCaption = verifiedPostData.caption.toLowerCase().includes(cleanTag);
    return !mentionedInList && !mentionedInCaption;
  });

  if (missingBrandTags.length > 0) {
    flags.push({
      rule: "BRAND_NOT_TAGGED",
      severity: "CRITICAL",
      description: `Brand tags missing: ${missingBrandTags.join(", ")}`,
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
"Paid partnership disclosure missing required by FTC and Indian ASCI guidelines. " +
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
description: `Posted ${hoursLate} hour${hoursLate === 1 ? "" : "s"} after deadline requires admin review`,
});
score += 70;
}

return score;
}

export function runVerificationRules(
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

// Rule 7: Engagement anomaly check runs on all deals when engagement data is available
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

