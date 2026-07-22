"use client";


import { logger } from "@/lib/logger-client";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { Button, Input } from "@/components/ui";
import { z } from "zod";

export const deleteAccountSchema = z.object({
  confirmText: z.literal("DELETE", {
    message: "Please type DELETE to confirm",
  }),
  password: z.string().min(1, "Password is required to delete your account"),
  reason: z.string().max(500, "Reason cannot exceed 500 characters").optional(),
});

export type DeleteAccountValues = z.infer<typeof deleteAccountSchema>;

interface DeleteAccountPanelProps {
    isSaving: boolean;
    setIsSaving: (val: boolean) => void;
    showToast: (message: string, type?: "success" | "error" | "info") => void;
}

export default function DeleteAccountPanel({
    isSaving,
    setIsSaving,
    showToast,
}: Readonly<DeleteAccountPanelProps>) {
    const [isConfirming, setIsConfirming] = useState(false);
    const [password, setPassword] = useState("");
    const [reason, setReason] = useState("");
    const [confirmText, setConfirmText] = useState("");
    const [error, setError] = useState("");

    const handleDelete = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        const validation = deleteAccountSchema.safeParse({
            confirmText,
            password,
            reason: reason || undefined,
        });

        if (!validation.success) {
            setError(validation.error.issues[0]?.message || "Invalid input details.");
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
        } catch (err: unknown) {
            logger.error("[delete-account] error:", err);
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
                    role="alert"
                    aria-live="assertive"
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
                <Button
                    type="button"
                    variant="danger"
                    onClick={() => setIsConfirming(true)}
                    style={{ width: "100%" }}
                >
                    Delete My Account
                </Button>
            ) : (
                <form onSubmit={handleDelete} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <Input
                        label="Enter Password"
                        id="delete-password-input"
                        type="password"
                        placeholder="Enter your current password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={isSaving}
                        fullWidth
                    />

                    <Input
                        label="Reason for Deletion (Optional)"
                        id="delete-reason-input"
                        type="text"
                        placeholder="e.g. No longer using the service"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        disabled={isSaving}
                        fullWidth
                    />

                    <div>
                        <label className="label" htmlFor="delete-confirm-input">
                            Type <strong style={{ color: "var(--color-error)" }}>DELETE</strong> to confirm
                        </label>
                        <Input
                            id="delete-confirm-input"
                            type="text"
                            placeholder="Type DELETE"
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            required
                            disabled={isSaving}
                            fullWidth
                        />
                    </div>

                    <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                        <Button
                            type="submit"
                            variant="danger"
                            style={{ flex: 1 }}
                            disabled={isSaving || confirmText !== "DELETE"}
                        >
                            {isSaving ? <span className="loading" /> : "Permanently Delete Account"}
                        </Button>
                        <Button
                            type="button"
                            variant="secondary"
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
                        </Button>
                    </div>
                </form>
            )}
        </div>
    );
}
