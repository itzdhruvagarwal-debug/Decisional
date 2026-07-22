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
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold">
                    Recent Login Activity
                </h3>
                {loginActivity.length > 3 && (
                    <span className="text-xs text-muted">
                        {loginActivity.length} total sessions
                    </span>
                )}
            </div>
            <div
                className="flex flex-col gap-3"
            >
                {loginActivity.length === 0 ? (
                    <EmptyState emoji="🔒" title="No Login Activity" description="No recent login sessions found." compact />
                ) : (
                    visibleLogins.map((login) => (
                        <div
                            key={`${login.device}-${login.time}`}
                            className="flex justify-between items-center p-3 bg-tertiary rounded-sm" style={{ border: login.active
                                    ? "1px solid var(--color-primary)"
                                    : "1px solid transparent" }}
                        >
                            <div
                                className="flex items-center gap-3"
                            >
                                <div className="text-xl">
                                    {login.device.includes("Android") ||
                                        login.device.includes("iPhone")
                                        ? "📱"
                                        : "💻"}
                                </div>
                                <div>
                                    <div className="text-sm font-semibold">
                                        {login.device}{" "}
                                        <span
                                            className="font-normal text-muted"
                                        >
                                            • {login.location}
                                        </span>
                                    </div>
                                    <div
                                        className="text-xs" style={{ color: login.success
                                                ? "var(--color-text-secondary)"
                                                : "var(--color-error)" }}
                                    >
                                        {new Date(login.time).toLocaleString()}{" "}
                                        {login.success ? "" : "(Failed Attempt)"}
                                    </div>
                                </div>
                            </div>
                            {login.active && (
                                <div
                                    className="font-bold text-emerald bg-emerald-subtle rounded-sm" style={{ fontSize: "10px", padding: "2px 6px" }}
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
                    className="flex items-center justify-center w-full mt-3 text-sm font-semibold cursor-pointer bg-tertiary border-card rounded-sm text-primary-light" style={{ gap: "6px", padding: "10px", transition: "all 0.2s ease" }}
                >
                    {showAllLogins ? "▲ Show Less" : `▼ View All (${loginActivity.length})`}
                </Button>
            )}
        </div>
    );
}
