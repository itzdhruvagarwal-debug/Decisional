"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import IndiaTaxCompliancePanel from "@/components/dashboard/settings/IndiaTaxCompliancePanel";
import NotificationPreferencesPanel, {
    type NotificationPreferences,
} from "@/components/dashboard/settings/NotificationPreferencesPanel";
import ProfileTab, { type Profile, type User } from "@/components/dashboard/settings/ProfileTab";
import SocialTab, { type SocialConnections } from "@/components/dashboard/settings/SocialTab";
import RatesTab from "@/components/dashboard/settings/RatesTab";
import VerificationTab, { type VerificationData } from "@/components/dashboard/settings/VerificationTab";
import SecurityTab from "@/components/dashboard/settings/SecurityTab";

export default function SettingsPage() {
    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    const { data: session, update } = useSession();
    const [activeTab, setActiveTab] = useState<string>("profile");
    const [toasts, setToasts] = useState<Array<{ id: string; type: "success" | "error" | "info"; message: string }>>([]);
    const toastCounterRef = useRef(0);

    const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
        // Use a monotonic counter instead of Math.random() to generate unique, collision-free IDs.
        toastCounterRef.current += 1;
        const id = `toast-${toastCounterRef.current}`;
        setToasts((prev) => [...prev, { id, type, message }]);
        setTimeout(() => {
            if (isMounted.current) {
                setToasts((prev) => prev.filter((t) => t.id !== id));
            }
        }, 4000);
    };

    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [referralCode, setReferralCode] = useState("");
    const [badgesCount, setBadgesCount] = useState(0);
    const [user, setUser] = useState<User | null>(null);
    const [socialConnections, setSocialConnections] = useState<SocialConnections | null>(null);
    const [verificationData, setVerificationData] = useState<VerificationData | null>(null);
    const [notificationPreferences, setNotificationPreferences] =
        useState<NotificationPreferences>({
            email: { marketing: true, updates: true, security: true },
            push: { marketing: true, updates: true, security: true },
        });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        // Sync social stats verified from child custom event
        const handleSocialVerified = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail) {
                setProfile((prev) => {
                    if (!prev) return prev;
                    if (detail.platform === "instagram") {
                        return {
                            ...prev,
                            instagramHandle: detail.handle,
                            instagramFollowers: detail.followers,
                            instagramEngagementRate: detail.engagementRate,
                        };
                    } else {
                        return {
                            ...prev,
                            youtubeHandle: detail.handle,
                            youtubeSubscribers: detail.followers,
                            youtubeEngagementRate: detail.engagementRate,
                        };
                    }
                });
                showToast(
                    `${detail.platform.toUpperCase()} successfully verified! Stats linked in real.`,
                    "success",
                );
            }
        };

        window.addEventListener("social-verified", handleSocialVerified);
        return () => {
            window.removeEventListener("social-verified", handleSocialVerified);
        };
    }, []);

    useEffect(() => {
        // Check for URL params to show toasts
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get("success") === "instagram_connected") {
            showToast("Instagram connected successfully!", "success");
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (urlParams.get("error")) {
            showToast(`Error: ${urlParams.get("error")}`, "error");
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, []);

    useEffect(() => {
        fetch("/api/settings")
            .then((res) => res.json())
            .then((data) => {
                if (isMounted.current) {
                    if (data.profile) {
                        setProfile({
                            ...data.profile,
                            categories: data.profile.categories || [],
                            languages: data.profile.languages || [],
                        });
                    }
                    setReferralCode(data.user?.referralCode || "");
                    setBadgesCount(data.badges?.length || 0);
                    setUser(data.user);
                    if (data.user?.notificationPreferences) {
                        setNotificationPreferences(data.user.notificationPreferences);
                    }
                    if (data.socialConnections) {
                        setSocialConnections(data.socialConnections);
                    }
                    setLoading(false);
                }
            })
            .catch((err) => {
                if (err?.name !== "AbortError") {
                    console.error("[settings] Failed to load settings:", err);
                }
                if (isMounted.current) {
                    setLoading(false);
                }
            });
    }, []);

    useEffect(() => {
        if (!user?.userType) return;

        const requestedTab = new URLSearchParams(window.location.search).get("tab");
        const allowedTabs = [
            "profile",
            "verification",
            "tax",
            "notifications",
            "security",
            ...(user.userType === "INFLUENCER" ? ["social", "rates"] : []),
        ];

        if (requestedTab && allowedTabs.includes(requestedTab)) {
            setActiveTab(requestedTab);
        }
    }, [user?.userType]);

    useEffect(() => {
        if (activeTab === "verification" && !verificationData) {
            fetch("/api/verification")
                .then((res) => res.json())
                .then((data) => {
                    if (isMounted.current) {
                        setVerificationData(data);
                    }
                })
                .catch((err) => {
                    if (err?.name !== "AbortError") {
                        console.error("[settings] Failed to load verification data:", err);
                    }
                });
        }
    }, [activeTab, verificationData]);

    const handleSave = async () => {
        if (!profile) return;
        setIsSaving(true);
        try {
            const res = await fetch("/api/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(profile),
            });
            const data = await res.json();
            if (res.ok) {
                await update();
                showToast("Profile saved successfully!", "success");
            } else {
                showToast(data.error || "Failed to save profile", "error");
            }
        } catch (error) {
            console.error("[settings] Failed to save profile:", error);
            showToast("Failed to save profile", "error");
        } finally {
            if (isMounted.current) {
                setIsSaving(false);
            }
        }
    };

    const handleNotificationToggle = (
        type: "email" | "push",
        category: "marketing" | "updates" | "security",
    ) => {
        setNotificationPreferences((prev) => ({
            ...prev,
            [type]: {
                ...prev[type],
                [category]: !prev[type][category],
            },
        }));
    };

    const saveNotificationPreferences = async () => {
        setIsSaving(true);
        try {
            const res = await fetch("/api/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ notificationPreferences }),
            });
            if (res.ok) {
                showToast("Preferences saved successfully", "success");
            } else {
                showToast("Failed to save preferences", "error");
            }
        } catch (error) {
            console.error("[settings] Failed to save preferences:", error);
            showToast("An error occurred", "error");
        } finally {
            if (isMounted.current) {
                setIsSaving(false);
            }
        }
    };

    if (loading) {
        return (
            <DashboardShell user={session?.user || user}>
                <div
                    style={{
                        display: "flex",
                        minHeight: "60vh",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <span className="loading" />
                </div>
            </DashboardShell>
        );
    }

    if (!profile || !user) {
        return (
            <div style={{ padding: "40px", textAlign: "center" }}>
                Failed to load profile
            </div>
        );
    }

    return (
        <DashboardShell user={session?.user || user}>
            {/* Toast notifications */}
            {toasts.length > 0 && (
                <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: "8px", maxWidth: "400px" }}>
                    {toasts.map((t) => (
                        <div key={t.id} style={{
                            padding: "12px 20px",
                            borderRadius: "10px",
                            color: "#fff",
                            fontSize: "14px",
                            fontWeight: 500,
                            background: t.type === "success" ? "linear-gradient(135deg, #059669, #10b981)" : t.type === "error" ? "linear-gradient(135deg, #dc2626, #ef4444)" : "linear-gradient(135deg, #2563eb, #3b82f6)",
                            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                            backdropFilter: "blur(12px)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            animation: "slideInRight 0.3s ease-out",
                            cursor: "pointer",
                        }} onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>
                            {t.type === "success" ? "✓ " : t.type === "error" ? "✕ " : "ℹ "}{t.message}
                        </div>
                    ))}
                </div>
            )}

            {/* Header */}
            <div
                style={{
                    marginBottom: "24px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                }}
            >
                <div>
                    <h1 style={{ fontSize: "24px", fontWeight: 800 }}>Settings</h1>
                    <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
                        Manage your profile and preferences
                    </p>
                </div>
                {activeTab !== "notifications" && activeTab !== "tax" && activeTab !== "security" && activeTab !== "verification" && (
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={isSaving}
                    >
                        {isSaving ? <span className="loading" /> : "💾 Save Changes"}
                    </button>
                )}
            </div>

            <div className="dashboard-settings-content">
                {/* Tabs */}
                <div
                    className="scrollable-tabs"
                    style={{
                        display: "flex",
                        gap: "8px",
                        marginBottom: "24px",
                        borderBottom: "1px solid var(--color-border)",
                        paddingBottom: "16px",
                    }}
                >
                    {[
                        { id: "profile", label: "👤 Profile" },
                        ...(user.userType === "INFLUENCER"
                            ? [
                                { id: "social", label: "📱 Social Accounts" },
                                { id: "rates", label: "💰 Rates" },
                            ]
                            : []),
                        { id: "verification", label: "🛡️ Verification" },
                        { id: "tax", label: "📋 Tax" },
                        { id: "notifications", label: "🔔 Notifications" },
                        { id: "security", label: "🔐 Security" },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`btn ${activeTab === tab.id ? "btn-primary" : "btn-ghost"}`}
                            style={{ whiteSpace: "nowrap" }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Profile Tab */}
                {activeTab === "profile" && (
                    <ProfileTab
                        profile={profile}
                        setProfile={setProfile}
                        user={user}
                        referralCode={referralCode}
                        badgesCount={badgesCount}
                        showToast={showToast}
                    />
                )}

                {/* Social Tab */}
                {activeTab === "social" && (
                    <SocialTab
                        profile={profile}
                        setProfile={setProfile}
                        socialConnections={socialConnections}
                        setSocialConnections={setSocialConnections}
                        isSaving={isSaving}
                        setIsSaving={setIsSaving}
                        showToast={showToast}
                    />
                )}

                {/* Rates Tab */}
                {activeTab === "rates" && (
                    <RatesTab
                        profile={profile}
                        setProfile={setProfile}
                    />
                )}

                {/* Verification Tab */}
                {activeTab === "verification" && (
                    <VerificationTab
                        user={user}
                        verificationData={verificationData}
                        setVerificationData={setVerificationData}
                        showToast={showToast}
                    />
                )}

                {/* Tax Tab */}
                {activeTab === "tax" && <IndiaTaxCompliancePanel />}

                {/* Notifications Tab */}
                {activeTab === "notifications" && (
                    <NotificationPreferencesPanel
                        preferences={notificationPreferences}
                        isSaving={isSaving}
                        onToggle={handleNotificationToggle}
                        onSave={saveNotificationPreferences}
                    />
                )}

                {/* Security Tab */}
                {activeTab === "security" && (
                    <SecurityTab
                        user={user}
                        setUser={setUser}
                        isSaving={isSaving}
                        setIsSaving={setIsSaving}
                        showToast={showToast}
                    />
                )}
            </div>
        </DashboardShell>
    );
}
