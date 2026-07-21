"use client";


import { useState } from "react";
import Image from "next/image";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { Button, Input } from "@/components/ui";

interface TwoFactorAuthPanelProps {
    isSaving: boolean;
    setIsSaving: (val: boolean) => void;
    showToast: (message: string, type?: "success" | "error" | "info") => void;
}

interface SettingsResponse {
  user?: { isTwoFactorEnabled?: boolean };
}

export default function TwoFactorAuthPanel({
    isSaving: _isSaving,
    setIsSaving,
    showToast,
}: Readonly<TwoFactorAuthPanelProps>) {
    const { data: settingsData, mutate: refreshSettings } = useSWR<SettingsResponse>("/api/settings", fetcher);
    const [override2FA, setOverride2FA] = useState<boolean | null>(null);
    const [qrCodeData, setQrCodeData] = useState<{
        secret: string;
        qrCodeUrl: string;
    } | null>(null);
    const [setupCode, setSetupCode] = useState("");
    const [is2FASetupVisible, setIs2FASetupVisible] = useState(false);
    const [disable2FAPassword, setDisable2FAPassword] = useState("");
    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

    const is2FAEnabled = override2FA ?? !!settingsData?.user?.isTwoFactorEnabled;

    const setIs2FAEnabled = (val: boolean) => {
        setOverride2FA(val);
        refreshSettings();
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {/* Recovery Codes Display — shown once after 2FA setup */}
            {recoveryCodes.length > 0 && (
                <div className="card" style={{ border: "2px solid var(--color-accent-amber)", background: "rgba(245, 158, 11, 0.06)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                        <h3 style={{ fontSize: "16px", fontWeight: 800, color: "var(--color-accent-amber)" }}>🔑 Save Your Recovery Codes</h3>
                        <Button variant="ghost" onClick={() => setRecoveryCodes([])} style={{ fontSize: "12px" }}>I've saved them ✓</Button>
                    </div>
                    <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "12px" }}>
                        These codes can be used to access your account if you lose your authenticator. Each code can only be used once. Store them somewhere safe — they won't be shown again.
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
                        {recoveryCodes.map((code) => (
                            <div key={code} style={{ fontFamily: "monospace", fontSize: "14px", fontWeight: 700, padding: "8px 12px", background: "var(--color-bg-tertiary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", letterSpacing: "0.1em" }}>
                                {code}
                            </div>
                        ))}
                    </div>
                    <Button
                        variant="secondary"
                        aria-label="Copy all recovery codes to clipboard"
                        onClick={() => navigator.clipboard.writeText(recoveryCodes.join("\n")).then(() => showToast("Recovery codes copied!", "success"))}
                    >
                        📋 Copy All Codes
                    </Button>
                </div>
            )}

            {/* Two-Factor Authentication */}
            <div className="card">
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: "16px",
                    }}
                >
                    <div>
                        <h3
                            style={{
                                fontSize: "18px",
                                fontWeight: 700,
                                marginBottom: "4px",
                            }}
                        >
                            Two-Factor Authentication
                        </h3>
                        <p
                            style={{
                                fontSize: "13px",
                                color: "var(--color-text-secondary)",
                            }}
                        >
                            Add an extra layer of security to your account.
                        </p>
                    </div>
                    {is2FAEnabled ? (
                        <div className="badge badge-success">Enabled</div>
                    ) : (
                        <div className="badge badge-warning">Disabled</div>
                    )}
                </div>

                {!is2FAEnabled && !is2FASetupVisible && (
                    <Button
                        variant="secondary"
                        style={{ width: "100%" }}
                        onClick={async () => {
                            setIsSaving(true);
                            const res = await fetch("/api/user/2fa/setup", {
                                method: "POST",
                            });
                            const data = await res.json();
                            setIsSaving(false);
                            if (data.qrCodeUrl) {
                                setQrCodeData(data);
                                setIs2FASetupVisible(true);
                            } else {
                                showToast("Failed to initiate 2FA setup", "error");
                            }
                        }}
                    >
                        Enable 2FA
                    </Button>
                )}

                {is2FASetupVisible && qrCodeData && !is2FAEnabled && (
                    <div
                        style={{
                            marginTop: "16px",
                            padding: "16px",
                            background: "var(--color-bg-tertiary)",
                            borderRadius: "var(--radius-md)",
                        }}
                    >
                        <p style={{ fontSize: "14px", marginBottom: "12px" }}>
                            1. Scan this QR code with your authenticator app (e.g. Google Authenticator, Authy):
                        </p>
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "center",
                                marginBottom: "16px",
                                background: "white",
                                padding: "16px",
                                borderRadius: "8px",
                                width: "fit-content",
                                margin: "0 auto 16px auto",
                            }}
                        >
                            <Image
                                src={qrCodeData.qrCodeUrl}
                                alt="2FA QR Code"
                                width={150}
                                height={150}
                                unoptimized
                            />
                        </div>
                        <p
                            style={{
                                fontSize: "12px",
                                color: "var(--color-text-muted)",
                                textAlign: "center",
                                marginBottom: "16px",
                            }}
                        >
                            Or enter code manually: {qrCodeData.secret}
                        </p>
                        <p style={{ fontSize: "14px", marginBottom: "8px" }}>
                            2. Enter the 6-digit code from your app to verify setup:
                        </p>
                        <div style={{ display: "flex", gap: "8px" }}>
                            <Input
                                id="2fa-setup-code"
                                type="text"
                                placeholder="000000"
                                maxLength={6}
                                aria-label="6-digit authenticator code"
                                autoComplete="one-time-code"
                                inputMode="numeric"
                                value={setupCode}
                                onChange={(e) =>
                                    setSetupCode(e.target.value.replace(/\D/g, ""))
                                }
                            />
                            <Button
                                variant="primary"
                                onClick={async () => {
                                    if (setupCode.length !== 6) {
                                        showToast("Enter 6 digit code", "error");
                                        return;
                                    }
                                    setIsSaving(true);
                                    const res = await fetch("/api/user/2fa/verify", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ code: setupCode }),
                                    });
                                    const data = await res.json();
                                    setIsSaving(false);
                                    if (data.success) {
                                        setIs2FAEnabled(true);
                                        setIs2FASetupVisible(false);
                                        setSetupCode("");
                                        if (Array.isArray(data.recoveryCodes)) {
                                            setRecoveryCodes(data.recoveryCodes);
                                        }
                                        showToast(
                                            "Two-Factor Authentication successfully enabled! Save your recovery codes.",
                                            "success",
                                        );
                                    } else {
                                        showToast(data.error || "Invalid code", "error");
                                    }
                                }}
                            >
                                Verify & Enable
                            </Button>
                        </div>
                    </div>
                )}

                    {is2FAEnabled && (
                        <div
                            style={{
                                marginTop: "16px",
                                padding: "16px",
                                background: "var(--color-bg-tertiary)",
                                borderRadius: "var(--radius-md)",
                            }}
                        >
                            <p style={{ fontSize: "14px", marginBottom: "12px" }}>
                                To disable 2FA, please enter your current password:
                            </p>
                            <div
                                style={{
                                    display: "flex",
                                    gap: "8px",
                                    flexDirection: "column",
                                }}
                            >
                                <Input
                                    id="disable-2fa-password"
                                    type="password"
                                    placeholder="Current Password"
                                    aria-label="Current password to disable two-factor authentication"
                                    autoComplete="current-password"
                                    value={disable2FAPassword}
                                    onChange={(e) => setDisable2FAPassword(e.target.value)}
                                    fullWidth
                                />
                                <Button
                                    variant="danger"
                                    onClick={async () => {
                                        if (!disable2FAPassword) {
                                            showToast("Password required", "error");
                                            return;
                                        }
                                        setIsSaving(true);
                                        const res = await fetch("/api/user/2fa/disable", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({
                                                password: disable2FAPassword,
                                            }),
                                        });
                                        const data = await res.json();
                                        setIsSaving(false);
                                        if (data.success) {
                                            setIs2FAEnabled(false);
                                            setDisable2FAPassword("");
                                            showToast(
                                                "Two-Factor Authentication successfully disabled.",
                                                "success",
                                            );
                                        } else {
                                            showToast(data.error || "Failed to disable 2FA", "error");
                                        }
                                    }}
                                >
                                    Disable 2FA
                                </Button>
                            </div>
                        </div>
                    )}
            </div>
        </div>
    );
}
