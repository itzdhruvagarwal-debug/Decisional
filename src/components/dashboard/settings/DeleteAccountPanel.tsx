"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

interface DeleteAccountPanelProps {
    isSaving: boolean;
    setIsSaving: (val: boolean) => void;
    showToast: (message: string, type?: "success" | "error" | "info") => void;
}

export default function DeleteAccountPanel({
    isSaving,
    setIsSaving,
    showToast,
}: DeleteAccountPanelProps) {
    const [isConfirming, setIsConfirming] = useState(false);
    const [password, setPassword] = useState("");
    const [reason, setReason] = useState("");
    const [confirmText, setConfirmText] = useState("");
    const [error, setError] = useState("");

    const handleDelete = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (confirmText !== "DELETE") {
            setError("Please type DELETE to confirm");
            return;
        }

        setIsSaving(true);
        try {
            const res = await fetch("/api/user/delete-account", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password, reason }),
            });
            const data = await res.json();
            if (res.ok) {
                showToast("Account deleted successfully. Logging you out...", "success");
                // Wait briefly for the toast to display then sign out and redirect to home
                setTimeout(() => {
                    signOut({ callbackUrl: "/" });
                }, 1500);
            } else {
                setError(data.error || "Failed to delete account");
                setIsSaving(false);
            }
        } catch (_err) {
            setError("An error occurred during account deletion");
            setIsSaving(false);
        }
    };

    return (
        <div className="card" style={{ border: "1px solid rgba(239, 68, 68, 0.2)" }}>
            <h3
                style={{
                    fontSize: "20px",
                    fontWeight: 700,
                    marginBottom: "12px",
                    color: "var(--color-error)",
                }}
            >
                ⚠️ Danger Zone: Delete Account
            </h3>
            <p
                style={{
                    fontSize: "14px",
                    color: "var(--color-text-secondary)",
                    marginBottom: "20px",
                    lineHeight: "1.5",
                }}
            >
                Permanently delete your account. This action is irreversible. All your personal data will be anonymized in compliance with DPDP Act 2023. Financial transactions and tax records will be retained for audit compliance.
            </p>

            {error && (
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
                    {error}
                </div>
            )}

            {!isConfirming ? (
                <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => setIsConfirming(true)}
                    style={{ width: "100%" }}
                >
                    Delete My Account
                </button>
            ) : (
                <form onSubmit={handleDelete} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div>
                        <label className="label">Enter Password</label>
                        <input
                            type="password"
                            className="input"
                            placeholder="Enter your current password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            disabled={isSaving}
                        />
                    </div>

                    <div>
                        <label className="label">Reason for Deletion (Optional)</label>
                        <input
                            type="text"
                            className="input"
                            placeholder="e.g. No longer using the service"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            disabled={isSaving}
                        />
                    </div>

                    <div>
                        <label className="label">
                            Type <strong style={{ color: "var(--color-error)" }}>DELETE</strong> to confirm
                        </label>
                        <input
                            type="text"
                            className="input"
                            placeholder="Type DELETE"
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            required
                            disabled={isSaving}
                        />
                    </div>

                    <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                        <button
                            type="submit"
                            className="btn btn-danger"
                            style={{ flex: 1 }}
                            disabled={isSaving || confirmText !== "DELETE"}
                        >
                            {isSaving ? <span className="loading" /> : "Permanently Delete Account"}
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ flex: 1 }}
                            onClick={() => {
                                setIsConfirming(false);
                                setPassword("");
                                setReason("");
                                setConfirmText("");
                                setError("");
                            }}
                            disabled={isSaving}
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
