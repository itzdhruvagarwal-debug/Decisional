/**
 * Instagram Graph API Integration
 * Fetches profile data, post metrics, and verifies post existence.
 * Add INSTAGRAM_ACCESS_TOKEN or use OAuth flow to activate.
 *
 * Docs: https://developers.facebook.com/docs/instagram-api
 */

import { logger } from "./logger";

const GRAPH_API_BASE = "https://graph.instagram.com";
const GRAPH_API_VERSION = "v18.0";

// ==================== TYPES ====================

export interface InstagramProfile {
  id: string;
  username: string;
  name: string;
  biography: string;
  followersCount: number;
  followingCount: number;
  mediaCount: number;
  profilePicture: string;
  isVerified: boolean;
  website?: string;
}

export interface InstagramPost {
  id: string;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  mediaUrl: string;
  permalink: string;
  caption: string;
  timestamp: string;
  likeCount: number;
  commentsCount: number;
  isLive: boolean;
}

export interface InstagramInsights {
  engagementRate: number;
  avgLikes: number;
  avgComments: number;
  reachEstimate: number;
}

// ==================== OAUTH ====================

/**
 * Generate Instagram OAuth URL for user authorization.
 */
export function getInstagramOAuthUrl(
  redirectUri: string,
  state: string,
): string {
  const baseUrl = "https://api.instagram.com/oauth/authorize";
  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID || "",
    redirect_uri: redirectUri,
    scope: "user_profile,user_media",
    response_type: "code",
    state,
  });

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Exchange auth code for access token.
 */
export async function exchangeInstagramCode(
  code: string,
  redirectUri: string,
): Promise<{
  accessToken: string;
  userId: string;
} | null> {
  const appId = process.env.INSTAGRAM_APP_ID || "";
  const appSecret = process.env.INSTAGRAM_APP_SECRET || "";

  if (!appId || !appSecret) {
    logger.warn("Instagram app credentials not configured");
    return null;
  }

  try {
    const res = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }),
    });

    const data = await res.json();

    if (data.access_token) {
      // Exchange for long-lived token
      const longLived = await getLongLivedToken(data.access_token);
      return {
        accessToken: longLived || data.access_token,
        userId: data.user_id.toString(),
      };
    }

    // Sanitize error response: Remove tokens if present
    const cleanData = { ...data };
    delete cleanData.access_token;
    delete cleanData.client_secret;

    logger.error("Instagram token exchange failed", { response: cleanData });
    return null;
  } catch (error) {
    logger.error("Instagram OAuth error", {
      message: error instanceof Error ? error.message : "Request failed"
    });
    return null;
  }
}

async function getLongLivedToken(shortToken: string): Promise<string | null> {
  try {
    const appSecret = process.env.INSTAGRAM_APP_SECRET || "";
    const res = await fetch(`${GRAPH_API_BASE}/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "ig_exchange_token",
        client_secret: appSecret,
        access_token: shortToken,
      }),
    });
    const data = await res.json();
    return data.access_token || null;
  } catch {
    return null;
  }
}

// ==================== PROFILE DATA ====================

/**
 * Fetch Instagram profile data using access token.
 */
export async function getInstagramProfile(
  accessToken: string,
): Promise<InstagramProfile | null> {
  if (!accessToken) {
    logger.warn("No Instagram access token provided");
    return null;
  }

  try {
    const fields =
      "id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url,is_verified,website";
    const res = await fetch(
      `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/me?fields=${fields}&access_token=${accessToken}`,
    );

    const data = await res.json();

    if (data.error) {
      logger.error("Instagram API error", { message: data.error.message });
      return null;
    }

    return {
      id: data.id,
      username: data.username,
      name: data.name || data.username,
      biography: data.biography || "",
      followersCount: data.followers_count || 0,
      followingCount: data.follows_count || 0,
      mediaCount: data.media_count || 0,
      profilePicture: data.profile_picture_url || "",
      isVerified: data.is_verified || false,
      website: data.website,
    };
  } catch (error) {
    logger.error("Instagram profile fetch error", error);
    return null;
  }
}

// ==================== POST VERIFICATION ====================

/**
 * Fetch recent media (posts) for verification.
 */
export async function getRecentPosts(
  accessToken: string,
  limit: number = 10,
): Promise<InstagramPost[]> {
  if (!accessToken) return [];

  try {
    const fields =
      "id,media_type,media_url,permalink,caption,timestamp,like_count,comments_count";
    const res = await fetch(
      `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/me/media?fields=${fields}&limit=${limit}&access_token=${accessToken}`,
    );

    const data = await res.json();

    if (data.error || !data.data) return [];

    return data.data.map((post: Record<string, unknown>) => ({
      id: post.id,
      mediaType: post.media_type,
      mediaUrl: post.media_url || "",
      permalink: post.permalink || "",
      caption: post.caption || "",
      timestamp: post.timestamp,
      likeCount: post.like_count || 0,
      commentsCount: post.comments_count || 0,
      isLive: true, // If it's returned by API, it's live
    }));
  } catch (error) {
    logger.error("Instagram posts fetch error", error);
    return [];
  }
}

/**
 * Find a specific post by its permalink among recent posts.
 */
export async function findPostByUrl(
  accessToken: string,
  postUrl: string,
): Promise<InstagramPost | null> {
  const posts = await getRecentPosts(accessToken, 50); // Check last 50
  const normalizedUrl = (postUrl.split("?")[0] ?? postUrl).replace(/\/$/, "");

  return (
    posts.find(
      (p) => (p.permalink.split("?")[0] ?? p.permalink).replace(/\/$/, "") === normalizedUrl,
    ) || null
  );
}

/**
 * Check if a specific post URL is still live.
 * Uses the post permalink to verify existence.
 */
export async function verifyPostIsLive(postUrl: string, accessToken?: string): Promise<{
  isLive: boolean;
  error?: string;
}> {
  if (!accessToken) {
    return {
      isLive: false,
      error: "Instagram OAuth token required for official verification",
    };
  }

  const post = await findPostByUrl(accessToken, postUrl);
  return { isLive: Boolean(post) };
}

// ==================== ENGAGEMENT METRICS ====================

/**
 * Calculate engagement rate from recent posts.
 */
export async function calculateEngagement(
  accessToken: string,
): Promise<InstagramInsights | null> {
  const profile = await getInstagramProfile(accessToken);
  const posts = await getRecentPosts(accessToken, 20);

  if (!profile || posts.length === 0) return null;

  const totalLikes = posts.reduce((sum, p) => sum + p.likeCount, 0);
  const totalComments = posts.reduce((sum, p) => sum + p.commentsCount, 0);
  const avgLikes = Math.round(totalLikes / posts.length);
  const avgComments = Math.round(totalComments / posts.length);

  // Engagement rate = (avg likes + avg comments) / followers × 100
  const engagementRate =
    profile.followersCount > 0
      ? ((avgLikes + avgComments) / profile.followersCount) * 100
      : 0;

  return {
    engagementRate: Math.round(engagementRate * 100) / 100,
    avgLikes,
    avgComments,
    reachEstimate: Math.round(
      profile.followersCount * (engagementRate / 100) * 3,
    ),
  };
}
