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
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        marginBottom: "20px",
                    }}
                >
                    <div
                        style={{
                            width: "48px",
                            height: "48px",
                            background:
                                "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)",
                            borderRadius: "var(--radius-md)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "24px",
                        }}
                    >
                        📸
                    </div>
                    <div style={{ flex: 1 }}>
                        <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "4px" }}>
                            Instagram
                        </h3>
                        <div
                            style={{
                                fontSize: "12px",
                                color: socialConnections?.instagram?.connected ? "#10b981" : "var(--color-text-muted)",
                            }}
                        >
                            {socialConnections?.instagram?.connected ? "✅ Connected" : "❌ Not Connected"}
                        </div>
                    </div>
                </div>

                <div style={{ marginBottom: "16px" }}>
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
                        style={{ width: "100%" }}
                        aria-label="Connect Instagram account"
                        onClick={handleInstagramConnect}
                        disabled={isSaving}
                    >
                        Connect Instagram
                    </Button>
                ) : (
                    <div
                        style={{
                            padding: "16px",
                            background: "var(--color-bg-tertiary)",
                            borderRadius: "var(--radius-md)",
                        }}
                    >
                        <div
                            className="grid-2"
                            style={{ gap: "16px", marginBottom: "16px" }}
                        >
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: "24px", fontWeight: 800 }}>
                                    {((profile.instagramFollowers || 0) / 1000).toFixed(0)}K
                                </div>
                                <div
                                    style={{
                                        fontSize: "12px",
                                        color: "var(--color-text-muted)",
                                    }}
                                >
                                    Followers
                                </div>
                            </div>
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: "24px", fontWeight: 800 }}>
                                    {profile.instagramEngagementRate || 0}%
                                </div>
                                <div
                                    style={{
                                        fontSize: "12px",
                                        color: "var(--color-text-muted)",
                                    }}
                                >
                                    Engagement
                                </div>
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                            <Button
                                variant="secondary"
                                style={{ flex: 1, fontSize: "12px", padding: "8px" }}
                                aria-label="Sync Instagram statistics"
                                onClick={() => verifySocial("instagram")}
                                disabled={isSaving}
                            >
                                Sync Stats
                            </Button>
                            <Button
                                variant="secondary"
                                style={{ fontSize: "12px", padding: "8px" }}
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
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        marginBottom: "20px",
                    }}
                >
                    <div
                        style={{
                            width: "48px",
                            height: "48px",
                            background: "#FF0000",
                            borderRadius: "var(--radius-md)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "24px",
                        }}
                    >
                        🎥
                    </div>
                    <div style={{ flex: 1 }}>
                        <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "4px" }}>
                            YouTube
                        </h3>
                        <div
                            style={{
                                fontSize: "12px",
                                color: socialConnections?.youtube?.connected ? "#10b981" : "var(--color-text-muted)",
                            }}
                        >
                            {socialConnections?.youtube?.connected ? "✅ Connected" : "❌ Not Connected"}
                        </div>
                    </div>
                </div>

                <div style={{ marginBottom: "16px" }}>
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
                        style={{
                            padding: "16px",
                            background: "var(--color-bg-tertiary)",
                            borderRadius: "var(--radius-md)",
                        }}
                    >
                        <div
                            className="grid-2"
                            style={{ gap: "16px", marginBottom: "16px" }}
                        >
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: "24px", fontWeight: 800 }}>
                                    {profile.youtubeSubscribers === -1 ? "Hidden" : `${((profile.youtubeSubscribers || 0) / 1000).toFixed(0)}K`}
                                </div>
                                <div
                                    style={{
                                        fontSize: "12px",
                                        color: "var(--color-text-muted)",
                                    }}
                                >
                                    Subscribers
                                </div>
                            </div>
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: "24px", fontWeight: 800 }}>
                                    {profile.youtubeEngagementRate || 0}%
                                </div>
                                <div
                                    style={{
                                        fontSize: "12px",
                                        color: "var(--color-text-muted)",
                                    }}
                                >
                                    Engagement
                                </div>
                            </div>
                        </div>
                        <Button
                            variant="secondary"
                            style={{ width: "100%", fontSize: "12px", padding: "8px" }}
                            aria-label="Verify and sync YouTube channel statistics"
                            onClick={() => verifySocial("youtube")}
                            disabled={isSaving}
                        >
                            Verify &amp; Sync Stats
                        </Button>
                        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                            {socialConnections?.youtube?.connected ? (
                                <Button
                                    variant="secondary"
                                    style={{ flex: 1, fontSize: "12px", padding: "8px" }}
                                    aria-label="Disconnect YouTube channel"
                                    onClick={handleYouTubeDisconnect}
                                    disabled={isSaving}
                                >
                                    Disconnect
                                </Button>
                            ) : (
                                <Button
                                    variant="primary"
                                    style={{ flex: 1, fontSize: "12px", padding: "8px" }}
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
                        style={{ width: "100%" }}
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
