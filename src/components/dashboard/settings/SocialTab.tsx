"use client";


import { logger } from "@/lib/logger-client";
import { useEffect, useRef } from "react";
import type { Profile } from "./ProfileTab";
import { Button, Input } from "@/components/ui";

export interface SocialConnections {
    instagram: {
        connected: boolean;
        accessTokenPresent: boolean;
    };
    youtube: {
        connected: boolean;
        accessTokenPresent: boolean;
    };
}

interface SocialTabProps {
    profile: Profile;
    setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
    socialConnections: SocialConnections | null;
    setSocialConnections: React.Dispatch<React.SetStateAction<SocialConnections | null>>;
    isSaving: boolean;
    setIsSaving: (val: boolean) => void;
    showToast: (message: string, type?: "success" | "error" | "info") => void;
}

export default function SocialTab({
    profile,
    setProfile,
    socialConnections,
    setSocialConnections,
    isSaving,
    setIsSaving,
    showToast,
}: Readonly<SocialTabProps>) {
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    const handleInstagramConnect = async () => {
        try {
            const res = await fetch("/api/auth/instagram/authorize");
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            }
        } catch (error) {
            logger.error("[social-tab] Failed to connect Instagram:", error);
            showToast("Failed to connect Instagram. Please try again.", "error");
        }
    };

    const disconnectPlatform = async (platform: "instagram" | "youtube") => {
        const platformLabel = platform === "instagram" ? "Instagram" : "YouTube";
        try {
            const res = await fetch(`/api/auth/${platform}/disconnect`, { method: "POST" });
            if (res.ok) {
                // Refresh settings to reflect disconnected status
                const refreshRes = await fetch("/api/settings");
                const data = await refreshRes.json();
                if (data.socialConnections) {
                    setSocialConnections(data.socialConnections);
                }
                showToast(`${platformLabel} disconnected successfully.`, "info");
            } else {
                showToast(`Failed to disconnect ${platformLabel}.`, "error");
            }
        } catch (error) {
            logger.error(`[social-tab] Failed to disconnect ${platformLabel}:`, error);
            showToast(`Failed to disconnect ${platformLabel}.`, "error");
        }
    };

    const handleInstagramDisconnect = () => disconnectPlatform("instagram");

    const handleYouTubeConnect = async () => {
        try {
            const res = await fetch("/api/auth/youtube/authorize");
            const data = await res.json();
            if (data.url) {
                window.location.href = data.url;
            } else {
                showToast(data.error || "Failed to connect YouTube.", "error");
            }
        } catch (error) {
            logger.error("[social-tab] Failed to connect YouTube:", error);
            showToast("Failed to connect YouTube. Please try again.", "error");
        }
    };

    const handleYouTubeDisconnect = () => disconnectPlatform("youtube");

    const verifySocial = async (platform: "instagram" | "youtube") => {
        const handle =
            platform === "instagram"
                ? profile.instagramHandle
                : profile.youtubeHandle;
        if (!handle) {
            showToast(`Please enter your ${platform} handle first.`, "error");
            return;
        }

        setIsSaving(true);
        try {
            const res = await fetch("/api/social/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ platform, handle }),
            });
            const data = await res.json();

            if (res.ok && data.success) {
                if (typeof window !== "undefined") {
                    window.dispatchEvent(
                        new CustomEvent("social-verified", {
                            detail: { platform, handle, followers: data.followers, engagementRate: data.engagementRate },
                        })
                    );
                }
            }

            if (!isMounted.current) return;

            if (!(res.ok && data.success)) {
                showToast(
                    data.error ||
                    "Verification failed. Make sure the handle is public and correctly spelled.",
                    "error",
                );
            }
        } catch (error) {
            logger.error("[social-tab] Failed to verify social account:", error);
            if (isMounted.current) {
                showToast("Failed to verify social account.", "error");
            }
        } finally {
            if (isMounted.current) {
                setIsSaving(false);
            }
        }
    };

    return (
        <div className="grid-2">
            {/* Instagram Card */}
            <div className="card">
                <div
                    className="flex items-center gap-3 mb-5"
                >
                    <div
                        className="flex items-center justify-center text-2xl rounded-md w-48 h-48" style={{ background:
                                "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)" }}
                    >
                        📸
                    </div>
                    <div className="flex-1">
                        <h3 className="text-base font-bold mb-1">
                            Instagram
                        </h3>
                        <div
                            className="text-xs" style={{ color: socialConnections?.instagram?.connected ? "#10b981" : "var(--color-text-muted)" }}
                        >
                            {socialConnections?.instagram?.connected ? "✅ Connected" : "❌ Not Connected"}
                        </div>
                    </div>
                </div>

                <div className="mb-4">
                    <Input
                        id="instagram-handle-input"
                        label="Instagram Handle"
                        type="text"
                        placeholder="@yourusername"
                        value={profile.instagramHandle || ""}
                        onChange={(e) =>
                            setProfile({ ...profile, instagramHandle: e.target.value })
                        }
                        fullWidth
                    />
                </div>

                {!socialConnections?.instagram?.connected ? (
                    <Button
                        variant="primary"
                        className="w-full"
                        aria-label="Connect Instagram account"
                        onClick={handleInstagramConnect}
                        disabled={isSaving}
                    >
                        Connect Instagram
                    </Button>
                ) : (
                    <div
                        className="p-4 bg-tertiary rounded-md"
                    >
                        <div
                            className="grid-2 gap-4 mb-4"
                        >
                            <div className="text-center">
                                <div className="text-2xl font-extrabold">
                                    {((profile.instagramFollowers || 0) / 1000).toFixed(0)}K
                                </div>
                                <div
                                    className="text-xs text-muted"
                                >
                                    Followers
                                </div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-extrabold">
                                    {profile.instagramEngagementRate || 0}%
                                </div>
                                <div
                                    className="text-xs text-muted"
                                >
                                    Engagement
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="secondary"
                                className="flex-1 text-xs p-2"
                                aria-label="Sync Instagram statistics"
                                onClick={() => verifySocial("instagram")}
                                disabled={isSaving}
                            >
                                Sync Stats
                            </Button>
                            <Button
                                variant="secondary"
                                className="text-xs p-2"
                                aria-label="Disconnect Instagram account"
                                onClick={handleInstagramDisconnect}
                                disabled={isSaving}
                            >
                                Disconnect
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* YouTube Card */}
            <div className="card">
                <div
                    className="flex items-center gap-3 mb-5"
                >
                    <div
                        className="flex items-center justify-center text-2xl rounded-md w-48 h-48" style={{ background: "#FF0000" }}
                    >
                        🎥
                    </div>
                    <div className="flex-1">
                        <h3 className="text-base font-bold mb-1">
                            YouTube
                        </h3>
                        <div
                            className="text-xs" style={{ color: socialConnections?.youtube?.connected ? "#10b981" : "var(--color-text-muted)" }}
                        >
                            {socialConnections?.youtube?.connected ? "✅ Connected" : "❌ Not Connected"}
                        </div>
                    </div>
                </div>

                <div className="mb-4">
                    <Input
                        id="youtube-handle-input"
                        label="YouTube Channel ID or Handle"
                        type="text"
                        placeholder="@yourchannel"
                        value={profile.youtubeHandle || ""}
                        onChange={(e) =>
                            setProfile({ ...profile, youtubeHandle: e.target.value })
                        }
                        fullWidth
                    />
                </div>

                {socialConnections?.youtube?.connected || profile.youtubeHandle ? (
                    <div
                        className="p-4 bg-tertiary rounded-md"
                    >
                        <div
                            className="grid-2 gap-4 mb-4"
                        >
                            <div className="text-center">
                                <div className="text-2xl font-extrabold">
                                    {profile.youtubeSubscribers === -1 ? "Hidden" : `${((profile.youtubeSubscribers || 0) / 1000).toFixed(0)}K`}
                                </div>
                                <div
                                    className="text-xs text-muted"
                                >
                                    Subscribers
                                </div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-extrabold">
                                    {profile.youtubeEngagementRate || 0}%
                                </div>
                                <div
                                    className="text-xs text-muted"
                                >
                                    Engagement
                                </div>
                            </div>
                        </div>
                        <Button
                            variant="secondary"
                            className="w-full text-xs p-2"
                            aria-label="Verify and sync YouTube channel statistics"
                            onClick={() => verifySocial("youtube")}
                            disabled={isSaving}
                        >
                            Verify &amp; Sync Stats
                        </Button>
                        <div className="flex gap-2 mt-2">
                            {socialConnections?.youtube?.connected ? (
                                <Button
                                    variant="secondary"
                                    className="flex-1 text-xs p-2"
                                    aria-label="Disconnect YouTube channel"
                                    onClick={handleYouTubeDisconnect}
                                    disabled={isSaving}
                                >
                                    Disconnect
                                </Button>
                            ) : (
                                <Button
                                    variant="primary"
                                    className="flex-1 text-xs p-2"
                                    aria-label="Connect YouTube channel"
                                    onClick={handleYouTubeConnect}
                                    disabled={isSaving}
                                >
                                    Connect YouTube
                                </Button>
                            )}
                        </div>
                    </div>
                ) : (
                    <Button
                        type="button"
                        variant="primary"
                        className="w-full"
                        aria-label="Connect YouTube channel"
                        onClick={handleYouTubeConnect}
                        disabled={isSaving}
                    >
                        Connect YouTube
                    </Button>
                )}
            </div>
        </div>
    );
}
