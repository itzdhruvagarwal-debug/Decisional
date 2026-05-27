/**
 * YouTube Data API Integration
 * Fetches channel stats, video data, and verifies video existence.
 * Add YOUTUBE_API_KEY to .env to activate.
 *
 * Docs: https://developers.google.com/youtube/v3
 */

import { logger } from "./logger";

const API_BASE = "https://www.googleapis.com/youtube/v3";

// ==================== TYPES ====================

export interface YouTubeChannel {
  id: string;
  title: string;
  description: string;
  customUrl: string;
  thumbnail: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  country?: string;
  publishedAt: string;
}

export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: string;
  isLive: boolean;
}

export interface YouTubeInsights {
  avgViews: number;
  avgLikes: number;
  avgComments: number;
  engagementRate: number;
  uploadFrequency: string; // e.g., "2 videos/week"
}

// ==================== CHANNEL DATA ====================

/**
 * Fetch YouTube channel info by channel ID or username.
 */
export async function getYouTubeChannel(
  channelIdentifier: string,
  accessToken?: string,
): Promise<YouTubeChannel | null> {
  const apiKey = process.env.YOUTUBE_API_KEY || "";
  if (!apiKey && !accessToken) {
    logger.warn(
      "Neither YOUTUBE_API_KEY nor accessToken provided — channel fetch skipped",
    );
    return null;
  }

  try {
    // Try by ID first, then by forHandle
    const isChannelId = channelIdentifier.startsWith("UC");
    const url = new URL(`${API_BASE}/channels`);
    url.searchParams.set("part", "snippet,statistics");

    if (isChannelId) {
      url.searchParams.set("id", channelIdentifier);
    } else {
      url.searchParams.set(
        "forHandle",
        `@${channelIdentifier.replace("@", "")}`,
      );
    }

    if (apiKey) {
      url.searchParams.set("key", apiKey);
    }

    const headers: Record<string, string> = {};
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const res = await fetch(url.toString(), { headers });
    const data = await res.json();

    if (data.error) {
      // Securely log only the message and reason, not the full request URL or potential metadata
      logger.error("YouTube API error", {
        reason: data.error.errors?.[0]?.reason || "Unknown",
        message: data.error.message
      });
      return null;
    }

    if (!data.items || data.items.length === 0) {
      return null;
    }

    const channel = data.items[0];
    return {
      id: channel.id,
      title: channel.snippet.title,
      description: channel.snippet.description || "",
      customUrl: channel.snippet.customUrl || "",
      thumbnail:
        channel.snippet.thumbnails?.high?.url ||
        channel.snippet.thumbnails?.default?.url ||
        "",
      subscriberCount: parseInt(channel.statistics.subscriberCount || "0"),
      videoCount: parseInt(channel.statistics.videoCount || "0"),
      viewCount: parseInt(channel.statistics.viewCount || "0"),
      country: channel.snippet.country,
      publishedAt: channel.snippet.publishedAt,
    };
  } catch (error) {
    logger.error("YouTube channel fetch error", error, { channelIdentifier });
    return null;
  }
}

/**
 * Fetch the authenticated user's YouTube channel.
 */
export async function getYouTubeChannelByToken(
  accessToken: string,
): Promise<YouTubeChannel | null> {
  if (!accessToken) return null;

  try {
    const url = new URL(`${API_BASE}/channels`);
    url.searchParams.set("part", "snippet,statistics");
    url.searchParams.set("mine", "true");

    const apiKey = process.env.YOUTUBE_API_KEY || "";
    if (apiKey) {
      url.searchParams.set("key", apiKey);
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await res.json();

    if (data.error || !data.items || data.items.length === 0) return null;

    const channel = data.items[0];
    return {
      id: channel.id,
      title: channel.snippet.title,
      description: channel.snippet.description || "",
      customUrl: channel.snippet.customUrl || "",
      thumbnail: channel.snippet.thumbnails?.high?.url || "",
      subscriberCount: parseInt(channel.statistics.subscriberCount || "0"),
      videoCount: parseInt(channel.statistics.videoCount || "0"),
      viewCount: parseInt(channel.statistics.viewCount || "0"),
      country: channel.snippet.country,
      publishedAt: channel.snippet.publishedAt,
    };
  } catch (error) {
    logger.error("YouTube mine channel fetch error", error);
    return null;
  }
}

/**
 * Resolve a YouTube channel URL to channel data.
 * Supports: youtube.com/c/name, youtube.com/@handle, youtube.com/channel/ID
 */
export async function resolveYouTubeUrl(
  url: string,
): Promise<YouTubeChannel | null> {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;

    // Extract identifier from URL
    let identifier = "";

    if (path.startsWith("/channel/")) {
      identifier = path.replace("/channel/", "");
    } else if (path.startsWith("/@")) {
      identifier = path.replace("/@", "");
    } else if (path.startsWith("/c/")) {
      identifier = path.replace("/c/", "");
    } else if (path.startsWith("/user/")) {
      identifier = path.replace("/user/", "");
    }

    if (!identifier) return null;

    return getYouTubeChannel(identifier);
  } catch {
    return null;
  }
}

// ==================== VIDEO DATA ====================

/**
 * Fetch video details by video ID.
 */
export async function getYouTubeVideo(
  videoId: string,
  accessToken?: string,
): Promise<YouTubeVideo | null> {
  const apiKey = process.env.YOUTUBE_API_KEY || "";
  if (!apiKey && !accessToken) {
    logger.warn(
      "Neither YOUTUBE_API_KEY nor accessToken provided — video fetch skipped",
    );
    return null;
  }

  try {
    const url = new URL(`${API_BASE}/videos`);
    url.searchParams.set("part", "snippet,statistics,contentDetails,status");
    url.searchParams.set("id", videoId);

    const apiKey = process.env.YOUTUBE_API_KEY || "";
    if (apiKey) {
      url.searchParams.set("key", apiKey);
    }

    const headers: Record<string, string> = {};
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const res = await fetch(url.toString(), { headers });
    const data = await res.json();

    if (data.error || !data.items || data.items.length === 0) {
      return null;
    }

    const video = data.items[0];
    return {
      id: video.id,
      title: video.snippet.title,
      description: video.snippet.description || "",
      thumbnail:
        video.snippet.thumbnails?.high?.url ||
        video.snippet.thumbnails?.default?.url ||
        "",
      publishedAt: video.snippet.publishedAt,
      viewCount: parseInt(video.statistics.viewCount || "0"),
      likeCount: parseInt(video.statistics.likeCount || "0"),
      commentCount: parseInt(video.statistics.commentCount || "0"),
      duration: video.contentDetails.duration,
      isLive: video.status?.privacyStatus === "public",
    };
  } catch (error) {
    logger.error("YouTube video fetch error", error, { videoId });
    return null;
  }
}

/**
 * Extract video ID from various YouTube URL formats.
 */
export function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);

    // youtube.com/watch?v=ID
    if (
      parsed.hostname.includes("youtube.com") &&
      parsed.searchParams.has("v")
    ) {
      return parsed.searchParams.get("v");
    }

    // youtu.be/ID
    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.slice(1);
    }

    // youtube.com/shorts/ID
    if (parsed.pathname.startsWith("/shorts/")) {
      return parsed.pathname.replace("/shorts/", "").split("/")[0] || null;
    }

    // youtube.com/embed/ID
    if (parsed.pathname.startsWith("/embed/")) {
      return parsed.pathname.replace("/embed/", "").split("/")[0] || null;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Verify a YouTube video URL is live and public.
 */
export async function verifyYouTubeVideoIsLive(videoUrl: string): Promise<{
  isLive: boolean;
  video?: YouTubeVideo;
  error?: string;
}> {
  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    return { isLive: false, error: "Invalid YouTube URL" };
  }

  const video = await getYouTubeVideo(videoId);
  if (!video) {
    return { isLive: false, error: "Video not found or private" };
  }

  return { isLive: video.isLive, video };
}

// ==================== RECENT VIDEOS ====================

/**
 * Fetch recent videos from a channel.
 */
export async function getRecentVideos(
  channelId: string,
  maxResults: number = 10,
): Promise<YouTubeVideo[]> {
  const apiKey = process.env.YOUTUBE_API_KEY || "";
  if (!apiKey) return [];

  try {
    // Step 1: Search for recent uploads
    const searchRes = await fetch(
      `${API_BASE}/search?part=id&channelId=${channelId}&order=date&type=video&maxResults=${maxResults}&key=${apiKey}`,
    );

    const searchData = await searchRes.json();

    if (searchData.error || !searchData.items) return [];

    // Step 2: Get full video details
    const videoIds = searchData.items
      .map((item: { id: { videoId: string } }) => item.id.videoId)
      .join(",");

    const videosRes = await fetch(
      `${API_BASE}/videos?part=snippet,statistics,contentDetails,status&id=${videoIds}&key=${apiKey}`,
    );

    const videosData = await videosRes.json();

    if (!videosData.items) return [];

    return videosData.items.map((video: Record<string, any>) => ({
      id: video.id,
      title: video.snippet.title,
      description: video.snippet.description || "",
      thumbnail: video.snippet.thumbnails?.high?.url || "",
      publishedAt: video.snippet.publishedAt,
      viewCount: parseInt(video.statistics.viewCount || "0"),
      likeCount: parseInt(video.statistics.likeCount || "0"),
      commentCount: parseInt(video.statistics.commentCount || "0"),
      duration: video.contentDetails.duration,
      isLive: video.status?.privacyStatus === "public",
    }));
  } catch (error) {
    logger.error("YouTube recent videos fetch error", error, { channelId });
    return [];
  }
}

// ==================== ENGAGEMENT METRICS ====================

/**
 * Calculate channel engagement from recent videos.
 */
export async function calculateYouTubeEngagement(
  channelId: string,
): Promise<YouTubeInsights | null> {
  const channel = await getYouTubeChannel(channelId);
  const videos = await getRecentVideos(channelId, 20);

  if (!channel || videos.length === 0) return null;

  const totalViews = videos.reduce((sum, v) => sum + v.viewCount, 0);
  const totalLikes = videos.reduce((sum, v) => sum + v.likeCount, 0);
  const totalComments = videos.reduce((sum, v) => sum + v.commentCount, 0);

  const avgViews = Math.round(totalViews / videos.length);
  const avgLikes = Math.round(totalLikes / videos.length);
  const avgComments = Math.round(totalComments / videos.length);

  // Engagement rate = (avg likes + avg comments) / avg views × 100
  const engagementRate =
    avgViews > 0 ? ((avgLikes + avgComments) / avgViews) * 100 : 0;

  // Calculate upload frequency
  const dates = videos.map((v) => new Date(v.publishedAt).getTime()).sort();
  const daySpan =
    dates.length > 1
      ? (dates[dates.length - 1]! - dates[0]!) / (1000 * 60 * 60 * 24)
      : 30;
  const videosPerWeek = daySpan > 0 ? (videos.length / daySpan) * 7 : 0;
  const uploadFrequency =
    videosPerWeek >= 1
      ? `${Math.round(videosPerWeek)} videos/week`
      : `${Math.round(videosPerWeek * 4)} videos/month`;

  return {
    avgViews,
    avgLikes,
    avgComments,
    engagementRate: Math.round(engagementRate * 100) / 100,
    uploadFrequency,
  };
}
