"use client";

import { useEffect, useRef } from "react";
import type { Profile } from "./ProfileTab";

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
}: SocialTabProps) {
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
            console.error("[social-tab] Failed to connect Instagram:", error);
            showToast("Failed to connect Instagram. Please try again.", "error");
        }
    };

    const handleInstagramDisconnect = async () => {
        try {
            const res = await fetch("/api/auth/instagram/disconnect", { method: "POST" });
            if (res.ok) {
                // Refresh settings to reflect disconnected status
                const refreshRes = await fetch("/api/settings");
                const data = await refreshRes.json();
                if (data.socialConnections) {
                    setSocialConnections(data.socialConnections);
                }
                showToast("Instagram disconnected successfully.", "info");
            } else {
                showToast("Failed to disconnect Instagram.", "error");
            }
        } catch (error) {
            console.error("[social-tab] Failed to disconnect Instagram:", error);
            showToast("Failed to disconnect Instagram.", "error");
        }
    };

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
            console.error("[social-tab] Failed to connect YouTube:", error);
            showToast("Failed to connect YouTube. Please try again.", "error");
        }
    };

    const handleYouTubeDisconnect = async () => {
        try {
            const res = await fetch("/api/auth/youtube/disconnect", { method: "POST" });
            if (res.ok) {
                const refreshRes = await fetch("/api/settings");
                const data = await refreshRes.json();
                if (data.socialConnections) {
                    setSocialConnections(data.socialConnections);
                }
                showToast("YouTube disconnected successfully.", "info");
            } else {
                showToast("Failed to disconnect YouTube.", "error");
            }
        } catch (error) {
            console.error("[social-tab] Failed to disconnect YouTube:", error);
            showToast("Failed to disconnect YouTube.", "error");
        }
    };

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
            console.error("[social-tab] Failed to verify social account:", error);
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
                    <label className="label">Instagram Handle</label>
                    <input
                        type="text"
                        className="input"
                        placeholder="@yourusername"
                        value={profile.instagramHandle || ""}
                        onChange={(e) =>
                            setProfile({ ...profile, instagramHandle: e.target.value })
                        }
                    />
                </div>

                {!socialConnections?.instagram?.connected ? (
                    <button
                        className="btn btn-primary"
                        style={{ width: "100%" }}
                        onClick={handleInstagramConnect}
                        disabled={isSaving}
                    >
                        Connect Instagram
                    </button>
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
                            <button
                                className="btn btn-secondary"
                                style={{ flex: 1, fontSize: "12px", padding: "8px" }}
                                onClick={() => verifySocial("instagram")}
                                disabled={isSaving}
                            >
                                Sync Stats
                            </button>
                            <button
                                className="btn btn-secondary"
                                style={{ fontSize: "12px", padding: "8px" }}
                                onClick={handleInstagramDisconnect}
                                disabled={isSaving}
                            >
                                Disconnect
                            </button>
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
                    <label className="label">YouTube Channel ID or Handle</label>
                    <input
                        type="text"
                        className="input"
                        placeholder="@yourchannel"
                        value={profile.youtubeHandle || ""}
                        onChange={(e) =>
                            setProfile({ ...profile, youtubeHandle: e.target.value })
                        }
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
                        <button
                            className="btn btn-secondary"
                            style={{ width: "100%", fontSize: "12px", padding: "8px" }}
                            onClick={() => verifySocial("youtube")}
                            disabled={isSaving}
                        >
                            Verify & Sync Stats
                        </button>
                        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                            {socialConnections?.youtube?.connected ? (
                                <button
                                    className="btn btn-secondary"
                                    style={{ flex: 1, fontSize: "12px", padding: "8px" }}
                                    onClick={handleYouTubeDisconnect}
                                    disabled={isSaving}
                                >
                                    Disconnect
                                </button>
                            ) : (
                                <button
                                    className="btn btn-primary"
                                    style={{ flex: 1, fontSize: "12px", padding: "8px" }}
                                    onClick={handleYouTubeConnect}
                                    disabled={isSaving}
                                >
                                    Connect YouTube
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <button
                        type="button"
                        className="btn btn-primary"
                        style={{ width: "100%" }}
                        onClick={handleYouTubeConnect}
                        disabled={isSaving}
                    >
                        Connect YouTube
                    </button>
                )}
            </div>
        </div>
    );
}
