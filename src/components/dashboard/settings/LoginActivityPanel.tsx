"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import EmptyState from "@/components/ui/EmptyState";
import { Button } from "@/components/ui";
import { useState, useMemo } from "react";

interface LoginActivity {
    device: string;
    location: string;
    time: string;
    success: boolean;
    active?: boolean;
}

interface LoginActivityPanelProps {
    showToast: (message: string, type?: "success" | "error" | "info") => void;
}

interface ActivityResponse {
    activity?: LoginActivity[];
}

export default function LoginActivityPanel({ showToast: _showToast }: Readonly<LoginActivityPanelProps>) {
    const [showAllLogins, setShowAllLogins] = useState(false);

    const { data } = useSWR<ActivityResponse>("/api/user/activity", fetcher);

    const loginActivity = useMemo(() => {
        if (!data?.activity) return [];
        const uniqueDevices = new Map<string, LoginActivity>();
        data.activity.forEach((login: LoginActivity) => {
            if (!uniqueDevices.has(login.device)) {
                uniqueDevices.set(login.device, login);
            }
        });
        return Array.from(uniqueDevices.values());
    }, [data]);

    const visibleLogins = showAllLogins ? loginActivity : loginActivity.slice(0, 3);

    return (
        <div className="card">
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
            }}>
                <h3 style={{ fontSize: "18px", fontWeight: 700 }}>
                    Recent Login Activity
                </h3>
                {loginActivity.length > 3 && (
                    <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                        {loginActivity.length} total sessions
                    </span>
                )}
            </div>
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                }}
            >
                {loginActivity.length === 0 ? (
                    <EmptyState emoji="🔒" title="No Login Activity" description="No recent login sessions found." compact />
                ) : (
                    visibleLogins.map((login) => (
                        <div
                            key={`${login.device}-${login.time}`}
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "12px",
                                background: "var(--color-bg-tertiary)",
                                borderRadius: "var(--radius-sm)",
                                border: login.active
                                    ? "1px solid var(--color-primary)"
                                    : "1px solid transparent",
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                }}
                            >
                                <div style={{ fontSize: "20px" }}>
                                    {login.device.includes("Android") ||
                                        login.device.includes("iPhone")
                                        ? "📱"
                                        : "💻"}
                                </div>
                                <div>
                                    <div style={{ fontSize: "13px", fontWeight: 600 }}>
                                        {login.device}{" "}
                                        <span
                                            style={{
                                                fontWeight: 400,
                                                color: "var(--color-text-muted)",
                                            }}
                                        >
                                            • {login.location}
                                        </span>
                                    </div>
                                    <div
                                        style={{
                                            fontSize: "11px",
                                            color: login.success
                                                ? "var(--color-text-secondary)"
                                                : "var(--color-error)",
                                        }}
                                    >
                                        {new Date(login.time).toLocaleString()}{" "}
                                        {login.success ? "" : "(Failed Attempt)"}
                                    </div>
                                </div>
                            </div>
                            {login.active && (
                                <div
                                    style={{
                                        fontSize: "10px",
                                        fontWeight: 700,
                                        color: "var(--color-accent-emerald)",
                                        background: "rgba(16, 185, 129, 0.1)",
                                        padding: "2px 6px",
                                        borderRadius: "4px",
                                    }}
                                >
                                    ACTIVE
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
            {loginActivity.length > 3 && (
                <Button
                    variant="secondary"
                    onClick={() => setShowAllLogins(!showAllLogins)}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                        width: "100%",
                        marginTop: "12px",
                        padding: "10px",
                        background: "var(--color-bg-tertiary)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-sm)",
                        color: "var(--color-primary-light)",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                    }}
                >
                    {showAllLogins ? "▲ Show Less" : `▼ View All (${loginActivity.length})`}
                </Button>
            )}
        </div>
    );
}
