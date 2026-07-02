"use client";

import { useState } from "react";
import type { User } from "./ProfileTab";

interface PasswordPanelProps {
    user: User;
    isSaving: boolean;
    setIsSaving: (val: boolean) => void;
    showToast: (message: string, type?: "success" | "error" | "info") => void;
}

export default function PasswordPanel({
    user,
    isSaving,
    setIsSaving,
    showToast: _showToast,
}: PasswordPanelProps) {
    const [passwordData, setPasswordData] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
    });
    const [showPassword, setShowPassword] = useState({
        current: false,
        new: false,
        confirm: false,
    });
    const [passwordError, setPasswordError] = useState("");
    const [passwordSuccess, setPasswordSuccess] = useState("");

    // Forgot Password State
    const [forgotPasswordState, setForgotPasswordState] = useState<{
        active: boolean;
        step: 'method' | 'otp' | 'new_password';
        method: 'email' | 'phone' | null;
        otp: string;
    }>({ active: false, step: 'method', method: null, otp: '' });

    const [passwordConfirmPending, setPasswordConfirmPending] = useState(false);

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!passwordConfirmPending) {
            setPasswordConfirmPending(true);
            return;
        }
        setPasswordConfirmPending(false);
        setPasswordError("");
        setPasswordSuccess("");

        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setPasswordError("New passwords don't match");
            return;
        }

        if (passwordData.newPassword.length < 8) {
            setPasswordError("Password must be at least 8 characters");
            return;
        }

        setIsSaving(true);

        interface ChangePasswordRequest {
            newPassword: string;
            otpType?: 'email' | 'phone' | null;
            otpCode?: string;
            oldPassword?: string;
        }

        const body: ChangePasswordRequest = {
            newPassword: passwordData.newPassword,
        };

        if (forgotPasswordState.active) {
            body.otpType = forgotPasswordState.method;
            body.otpCode = forgotPasswordState.otp;
        } else {
            body.oldPassword = passwordData.currentPassword;
        }

        try {
            const res = await fetch("/api/auth/change-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (res.ok) {
                setPasswordSuccess("Password updated successfully!");
                setPasswordData({
                    currentPassword: "",
                    newPassword: "",
                    confirmPassword: "",
                });
            } else {
                setPasswordError(data.error || "Failed to update password");
            }
        } catch (_error) {
            setPasswordError("An error occurred");
        } finally {
            setIsSaving(false);
            if (forgotPasswordState.active) {
                setForgotPasswordState({ active: false, step: 'method', method: null, otp: '' });
            }
        }
    };

    const handleSendForgotPasswordOtp = async (method: 'email' | 'phone') => {
        setIsSaving(true);
        setPasswordError("");
        setPasswordSuccess("");
        setForgotPasswordState(prev => ({ ...prev, method, active: true }));

        const contact = method === 'email' ? user?.email : user?.phone;

        if (!contact) {
            setPasswordError(`No ${method} associated with this account`);
            setIsSaving(false);
            return;
        }

        try {
            const res = await fetch("/api/user/send-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: method,
                    contact: contact
                }),
            });
            const data = await res.json();
            if (res.ok) {
                setForgotPasswordState(prev => ({ ...prev, method, step: 'otp', active: true }));
                setPasswordSuccess(`OTP sent to your ${method}`);
            } else {
                setPasswordError(data.error || "Failed to send OTP");
                setForgotPasswordState({ active: false, step: 'method', method: null, otp: '' });
            }
        } catch (_err) {
            setPasswordError("Network error. Please try again.");
            setForgotPasswordState({ active: false, step: 'method', method: null, otp: '' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="card">
            <h3
                style={{
                    fontSize: "20px",
                    fontWeight: 700,
                    marginBottom: "24px",
                }}
            >
                Change Password
            </h3>

            {passwordSuccess && (
                <div
                    style={{
                        padding: "12px",
                        background: "rgba(16, 185, 129, 0.1)",
                        color: "var(--color-success)",
                        borderRadius: "var(--radius-sm)",
                        marginBottom: "16px",
                        border: "1px solid rgba(16, 185, 129, 0.2)",
                    }}
                >
                    {passwordSuccess}
                </div>
            )}

            {passwordError && (
                <div
                    style={{
                        padding: "12px",
                        background: "rgba(239, 68, 68, 0.1)",
                        color: "var(--color-error)",
                        borderRadius: "var(--radius-sm)",
                        marginBottom: "16px",
                        border: "1px solid rgba(239, 68, 68, 0.2)",
                    }}
                >
                    {passwordError}
                </div>
            )}

            <form onSubmit={handlePasswordChange}>
                {forgotPasswordState.active ? (
                    <div style={{ marginBottom: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
                        {forgotPasswordState.step === 'method' && (
                            <>
                                <p style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>Choose where to send the OTP:</p>
                                <div style={{ display: "flex", gap: "12px" }}>
                                    <button type="button" className="btn btn-secondary" onClick={() => handleSendForgotPasswordOtp('email')} disabled={isSaving || !user?.email} style={{ flex: 1 }}>{user?.email ? "Send to Email" : "No Email Added"}</button>
                                    <button type="button" className="btn btn-secondary" onClick={() => handleSendForgotPasswordOtp('phone')} disabled={isSaving || !user?.phone} style={{ flex: 1 }}>{user?.phone ? "Send to Phone" : "No Phone Added"}</button>
                                </div>
                                <button type="button" style={{ background: "none", border: "none", color: "var(--color-text-muted)", fontSize: "14px", cursor: "pointer", textDecoration: "underline" }} onClick={() => setForgotPasswordState({ active: false, step: 'method', method: null, otp: '' })}>Cancel</button>
                            </>
                        )}
                        {forgotPasswordState.step === 'otp' && (
                            <>
                                <label className="label">Enter OTP sent to your {forgotPasswordState.method}</label>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="e.g. 123456"
                                    value={forgotPasswordState.otp}
                                    onChange={(e) => setForgotPasswordState(prev => ({ ...prev, otp: e.target.value }))}
                                    required
                                />
                                <button type="button" style={{ background: "none", border: "none", color: "var(--color-text-muted)", fontSize: "14px", cursor: "pointer", textDecoration: "underline", alignSelf: "flex-start" }} onClick={() => setForgotPasswordState({ active: false, step: 'method', method: null, otp: '' })}>Cancel Reset</button>
                            </>
                        )}
                    </div>
                ) : (
                    <div style={{ marginBottom: "20px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                            <label className="label" style={{ marginBottom: 0 }}>Current Password</label>
                            <button
                                type="button"
                                onClick={() => setForgotPasswordState({ active: true, step: 'method', method: null, otp: '' })}
                                style={{
                                    background: "none",
                                    border: "none",
                                    color: "var(--color-primary-light)",
                                    fontSize: "13px",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    padding: 0
                                }}
                            >
                                Forgot Password?
                            </button>
                        </div>
                        <div style={{ position: "relative" }}>
                            <input
                                type={showPassword.current ? "text" : "password"}
                                className="input"
                                value={passwordData.currentPassword}
                                onChange={(e) =>
                                    setPasswordData({
                                        ...passwordData,
                                        currentPassword: e.target.value,
                                    })
                                }
                                required={!forgotPasswordState.active}
                            />
                            <button
                                type="button"
                                onClick={() =>
                                    setShowPassword({
                                        ...showPassword,
                                        current: !showPassword.current,
                                    })
                                }
                                style={{
                                    position: "absolute",
                                    right: "12px",
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    fontSize: "16px",
                                    opacity: 0.7,
                                }}
                            >
                                {showPassword.current ? "👁️" : "🙈"}
                            </button>
                        </div>
                    </div>
                )}

                {(!forgotPasswordState.active || forgotPasswordState.step === 'otp') && (
                    <>
                        <div style={{ marginBottom: "20px" }}>
                            <label className="label">New Password</label>
                            <div style={{ position: "relative" }}>
                                <input
                                    type={showPassword.new ? "text" : "password"}
                                    className="input"
                                    value={passwordData.newPassword}
                                    onChange={(e) =>
                                        setPasswordData({
                                            ...passwordData,
                                            newPassword: e.target.value,
                                        })
                                    }
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() =>
                                        setShowPassword({
                                            ...showPassword,
                                            new: !showPassword.new,
                                        })
                                    }
                                    style={{
                                        position: "absolute",
                                        right: "12px",
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                        background: "none",
                                        border: "none",
                                        cursor: "pointer",
                                        fontSize: "16px",
                                        opacity: 0.7,
                                    }}
                                >
                                    {showPassword.new ? "👁️" : "🙈"}
                                </button>
                            </div>
                        </div>

                        <div style={{ marginBottom: "24px" }}>
                            <label className="label">Confirm New Password</label>
                            <div style={{ position: "relative" }}>
                                <input
                                    type={showPassword.confirm ? "text" : "password"}
                                    className="input"
                                    value={passwordData.confirmPassword}
                                    onChange={(e) =>
                                        setPasswordData({
                                            ...passwordData,
                                            confirmPassword: e.target.value,
                                        })
                                    }
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() =>
                                        setShowPassword({
                                            ...showPassword,
                                            confirm: !showPassword.confirm,
                                        })
                                    }
                                    style={{
                                        position: "absolute",
                                        right: "12px",
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                        background: "none",
                                        border: "none",
                                        cursor: "pointer",
                                        fontSize: "16px",
                                        opacity: 0.7,
                                    }}
                                >
                                    {showPassword.confirm ? "👁️" : "🙈"}
                                </button>
                            </div>
                        </div>

                        {passwordConfirmPending ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px", background: "rgba(244, 63, 94, 0.08)", borderRadius: "var(--radius-md)", border: "1px solid rgba(244, 63, 94, 0.3)" }}>
                                <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-accent-rose)" }}>⚠️ Are you sure you want to update your password?</p>
                                <div style={{ display: "flex", gap: "8px" }}>
                                    <button type="submit" className="btn btn-danger" style={{ flex: 1 }} disabled={isSaving}>
                                        {isSaving ? <span className="loading" /> : "Yes, Update Password"}
                                    </button>
                                    <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setPasswordConfirmPending(false)}>
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={isSaving}
                                style={{ width: "100%" }}
                            >
                                {isSaving ? <span className="loading" /> : "Update Password"}
                            </button>
                        )}
                    </>
                )}
            </form>
        </div>
    );
}
