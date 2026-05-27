/**
 * Weekly Challenges System — Rule-Based Rotating Challenge Pool
 *
 * Generates weekly challenges for influencers and brands.
 * Tracks progress and distributes XP, badges, and perks.
 *
 * STRICT RULE-BASED LOGIC ONLY — NO ML.
 */

import prisma from "./db";
import { logger } from "./logger";
import { addUserXp } from "./gamification-engine";

// ==================== TYPES ====================

export type ChallengeType =
  | "DEALS"
  | "EARNINGS"
  | "REVIEWS"
  | "REFERRALS"
  | "SPEED"
  | "QUALITY"
  | "COMMUNITY";
export type ChallengeTarget = "INFLUENCER" | "BRAND" | "ALL";

export interface ChallengeTemplate {
  id: string;
  title: string;
  description: string;
  icon: string;
  type: ChallengeType;
  target: ChallengeTarget;
  goal: number;
  xpReward: number;
  bonusPerk?: string; // e.g., "Featured Creator" or "Priority Listing"
  badgeId?: string; // Badge awarded on completion
  difficulty: "EASY" | "MEDIUM" | "HARD";
}

// ==================== CHALLENGE POOL ====================

const CHALLENGE_POOL: ChallengeTemplate[] = [
  // --- INFLUENCER DEAL CHALLENGES ---
  {
    id: "complete_3_deals",
    title: "Deal Machine",
    description: "Complete 3 deals this week",
    icon: "🤝",
    type: "DEALS",
    target: "INFLUENCER",
    goal: 3,
    xpReward: 300,
    bonusPerk: "Featured Creator for 3 days",
    difficulty: "MEDIUM",
  },
  {
    id: "complete_5_deals",
    title: "Deal Blitz",
    description: "Complete 5 deals this week",
    icon: "⚡",
    type: "DEALS",
    target: "INFLUENCER",
    goal: 5,
    xpReward: 750,
    bonusPerk: "Featured Creator for 7 days",
    difficulty: "HARD",
  },
  {
    id: "complete_1_deal",
    title: "Weekly Win",
    description: "Complete 1 deal this week",
    icon: "✅",
    type: "DEALS",
    target: "INFLUENCER",
    goal: 1,
    xpReward: 100,
    difficulty: "EASY",
  },
  {
    id: "accept_3_deals",
    title: "Opportunity Seeker",
    description: "Get selected for 3 deals",
    icon: "🎯",
    type: "DEALS",
    target: "INFLUENCER",
    goal: 3,
    xpReward: 200,
    difficulty: "MEDIUM",
  },

  // --- QUALITY CHALLENGES ---
  {
    id: "get_2_five_star",
    title: "Star Collector",
    description: "Receive 2 five-star reviews",
    icon: "⭐",
    type: "QUALITY",
    target: "INFLUENCER",
    goal: 2,
    xpReward: 250,
    difficulty: "MEDIUM",
  },
  {
    id: "zero_revision_3",
    title: "Precision Pro",
    description: "Get 3 deals approved with zero revisions",
    icon: "🎯",
    type: "QUALITY",
    target: "INFLUENCER",
    goal: 3,
    xpReward: 400,
    difficulty: "HARD",
  },
  {
    id: "submit_early_2",
    title: "Ahead of Schedule",
    description: "Submit 2 deals before deadline",
    icon: "🌅",
    type: "SPEED",
    target: "INFLUENCER",
    goal: 2,
    xpReward: 200,
    difficulty: "EASY",
  },
  {
    id: "submit_24h",
    title: "Speed Demon",
    description: "Submit content within 24h of deal start",
    icon: "⚡",
    type: "SPEED",
    target: "INFLUENCER",
    goal: 1,
    xpReward: 150,
    difficulty: "MEDIUM",
  },

  // --- EARNINGS CHALLENGES ---
  {
    id: "earn_5k_week",
    title: "Pay Day",
    description: "Earn ₹5,000 this week",
    icon: "💰",
    type: "EARNINGS",
    target: "INFLUENCER",
    goal: 500000,
    xpReward: 200,
    difficulty: "EASY",
  },
  {
    id: "earn_25k_week",
    title: "Big Earner",
    description: "Earn ₹25,000 this week",
    icon: "💎",
    type: "EARNINGS",
    target: "INFLUENCER",
    goal: 2500000,
    xpReward: 500,
    difficulty: "HARD",
  },

  // --- REFERRAL CHALLENGES ---
  {
    id: "refer_1_user",
    title: "Spread the Word",
    description: "Refer 1 new user who signs up",
    icon: "📢",
    type: "REFERRALS",
    target: "ALL",
    goal: 1,
    xpReward: 150,
    difficulty: "EASY",
  },
  {
    id: "refer_3_users",
    title: "Network Builder",
    description: "Refer 3 new users this week",
    icon: "🌐",
    type: "REFERRALS",
    target: "ALL",
    goal: 3,
    xpReward: 500,
    difficulty: "HARD",
  },

  // --- COMMUNITY CHALLENGES ---
  {
    id: "leave_3_reviews",
    title: "Review Guru",
    description: "Leave 3 reviews this week",
    icon: "📝",
    type: "COMMUNITY",
    target: "ALL",
    goal: 3,
    xpReward: 150,
    difficulty: "EASY",
  },
  {
    id: "apply_5_campaigns",
    title: "Go-Getter",
    description: "Apply to 5 campaigns this week",
    icon: "✨",
    type: "DEALS",
    target: "INFLUENCER",
    goal: 5,
    xpReward: 200,
    difficulty: "MEDIUM",
  },

  // --- BRAND CHALLENGES ---
  {
    id: "launch_campaign",
    title: "Campaign Creator",
    description: "Launch a new campaign this week",
    icon: "✨",
    type: "DEALS",
    target: "BRAND",
    goal: 1,
    xpReward: 200,
    difficulty: "EASY",
  },
  {
    id: "approve_fast_3",
    title: "Quick Reviewer",
    description: "Approve 3 submissions within 12 hours",
    icon: "⚡",
    type: "SPEED",
    target: "BRAND",
    goal: 3,
    xpReward: 300,
    difficulty: "MEDIUM",
  },
  {
    id: "select_5_influencers",
    title: "Talent Scout",
    description: "Select 5 influencers this week",
    icon: "🔍",
    type: "DEALS",
    target: "BRAND",
    goal: 5,
    xpReward: 250,
    difficulty: "MEDIUM",
  },
  {
    id: "leave_5_reviews_brand",
    title: "Fair Reviewer",
    description: "Leave 5 detailed reviews",
    icon: "📋",
    type: "COMMUNITY",
    target: "BRAND",
    goal: 5,
    xpReward: 200,
    difficulty: "MEDIUM",
  },
];

// ==================== CHALLENGE GENERATION ====================

/**
 * Generate weekly challenges.
 * Selects 3 challenges per user type from the pool with rotation.
 * Uses week number as seed to ensure consistent rotation.
 */
export async function generateWeeklyChallenges(): Promise<{
  influencerChallenges: ChallengeTemplate[];
  brandChallenges: ChallengeTemplate[];
  weekId: string;
}> {
  const now = new Date();
  const weekNumber = getWeekNumber(now);
  const year = now.getFullYear();
  const weekId = `${year}-W${weekNumber}`;

  // Filter pools
  const influencerPool = CHALLENGE_POOL.filter(
    (c) => c.target === "INFLUENCER" || c.target === "ALL",
  );
  const brandPool = CHALLENGE_POOL.filter(
    (c) => c.target === "BRAND" || c.target === "ALL",
  );

  // Rotate selection based on week number (deterministic)
  const influencerChallenges = selectChallenges(influencerPool, 3, weekNumber);
  const brandChallenges = selectChallenges(brandPool, 3, weekNumber + 100); // Offset to differentiate

  // Save to database
  for (const challenge of [...influencerChallenges, ...brandChallenges]) {
    await prisma.weeklyChallenge.upsert({
      where: {
        weekId_challengeId: { weekId, challengeId: challenge.id },
      },
      create: {
        weekId,
        challengeId: challenge.id,
        title: challenge.title,
        description: challenge.description,
        icon: challenge.icon,
        type: challenge.type,
        target: challenge.target === "ALL" ? "INFLUENCER" : challenge.target,
        goal: challenge.goal,
        xpReward: challenge.xpReward,
        bonusPerk: challenge.bonusPerk,
        difficulty: challenge.difficulty,
        startsAt: getWeekStart(now),
        endsAt: getWeekEnd(now),
      },
      update: {}, // No update if already exists
    });
  }

  logger.info("Weekly challenges generated", {
    weekId,
    influencer: influencerChallenges.length,
    brand: brandChallenges.length,
  });

  return { influencerChallenges, brandChallenges, weekId };
}

/**
 * Select N challenges from pool using deterministic rotation.
 */
function selectChallenges(
  pool: ChallengeTemplate[],
  count: number,
  seed: number,
): ChallengeTemplate[] {
  if (pool.length <= count) return pool;

  // Ensure mix of difficulties: 1 easy, 1 medium, 1 hard if possible
  const easy = pool.filter((c) => c.difficulty === "EASY");
  const medium = pool.filter((c) => c.difficulty === "MEDIUM");
  const hard = pool.filter((c) => c.difficulty === "HARD");

  const selected: ChallengeTemplate[] = [];

  if (easy.length > 0) selected.push(easy[seed % easy.length]!);
  if (medium.length > 0) selected.push(medium[seed % medium.length]!);
  if (hard.length > 0) selected.push(hard[seed % hard.length]!);

  // Fill remaining from full pool (avoiding duplicates)
  const remaining = pool.filter((c) => !selected.find((s) => s.id === c.id));
  while (selected.length < count && remaining.length > 0) {
    const idx = (seed + selected.length) % remaining.length;
    selected.push(remaining.splice(idx, 1)[0]!);
  }

  return selected.slice(0, count);
}

// ==================== PROGRESS TRACKING ====================

/**
 * Check and update challenge progress for a user.
 * Call this after relevant actions (deal completion, review, referral, etc.)
 */
export async function checkChallengeProgress(
  userId: string,
  eventType: ChallengeType,
  incrementBy: number = 1,
): Promise<{ completed: string[]; updated: string[] }> {
  const now = new Date();
  const weekId = `${now.getFullYear()}-W${getWeekNumber(now)}`;

  // Get active challenges for this week
  const activeChallenges = await prisma.weeklyChallenge.findMany({
    where: {
      weekId,
      type: eventType,
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
  });

  const completed: string[] = [];
  const updated: string[] = [];

  for (const challenge of activeChallenges) {
    // Get or create user progress
    let progress = await prisma.userChallengeProgress.findUnique({
      where: {
        userId_challengeId_weekId: {
          userId,
          challengeId: challenge.challengeId,
          weekId,
        },
      },
    });

    if (!progress) {
      progress = await prisma.userChallengeProgress.create({
        data: {
          userId,
          challengeId: challenge.challengeId,
          weekId,
          currentProgress: 0,
          goal: challenge.goal,
          completed: false,
        },
      });
    }

    if (progress.completed) continue; // Already completed

    const newProgress = progress.currentProgress + incrementBy;
    const isCompleted = newProgress >= challenge.goal;

    await prisma.userChallengeProgress.update({
      where: { id: progress.id },
      data: {
        currentProgress: newProgress,
        completed: isCompleted,
        completedAt: isCompleted ? now : undefined,
      },
    });

    if (isCompleted) {
      completed.push(challenge.challengeId);
      await awardChallengeReward(userId, challenge);
    } else {
      updated.push(challenge.challengeId);
    }
  }

  return { completed, updated };
}

// ==================== REWARD DISTRIBUTION ====================

/**
 * Award XP, badges, and perks for completing a challenge.
 */
async function awardChallengeReward(
  userId: string,
  challenge: {
    challengeId: string;
    title: string;
    xpReward: number;
    bonusPerk?: string | null;
  },
) {
  try {
    // 1. Award XP
    await addUserXp(userId, challenge.xpReward, "WEEKLY_CHALLENGE");

    // 2. Notify user
    const perkMsg = challenge.bonusPerk
      ? ` Bonus: ${challenge.bonusPerk}!`
      : "";
    await prisma.notification.create({
      data: {
        userId,
        type: "badge",
        title: `🏆 Challenge Complete: ${challenge.title}`,
        message: `You earned +${challenge.xpReward} XP for completing the weekly challenge!${perkMsg}`,
        data: JSON.parse(
          JSON.stringify({
            challengeId: challenge.challengeId,
            xpReward: challenge.xpReward,
            bonusPerk: challenge.bonusPerk,
          }),
        ),
      },
    });

    // 3. Log activity
    await prisma.activityLog.create({
      data: {
        userId,
        action: "CHALLENGE_COMPLETED",
        metadata: {
          challengeId: challenge.challengeId,
          title: challenge.title,
          xpReward: challenge.xpReward,
        },
      },
    });

    logger.info("Challenge reward awarded", {
      userId,
      challengeId: challenge.challengeId,
      xpReward: challenge.xpReward,
    });
  } catch (error) {
    logger.error("Failed to award challenge reward", error, {
      userId,
      challengeId: challenge.challengeId,
    });
  }
}

// ==================== QUERY HELPERS ====================

/**
 * Get current week's challenges with user progress.
 */
export async function getUserWeeklyChallenges(userId: string) {
  const now = new Date();
  const weekId = `${now.getFullYear()}-W${getWeekNumber(now)}`;

  const challenges = await prisma.weeklyChallenge.findMany({
    where: { weekId },
    orderBy: { difficulty: "asc" },
  });

  const progressRecords = await prisma.userChallengeProgress.findMany({
    where: { userId, weekId },
  });

  const progressMap = new Map<string, any>(
    progressRecords.map((p: any) => [p.challengeId, p]),
  );

  return challenges.map((c: any) => ({
    ...c,
    progress: progressMap.get(c.challengeId)?.currentProgress || 0,
    completed: progressMap.get(c.challengeId)?.completed || false,
    completedAt: progressMap.get(c.challengeId)?.completedAt || null,
  }));
}

// ==================== UTILITY FUNCTIONS ====================

function getWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}
