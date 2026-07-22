"use client";


import { logger } from "@/lib/logger-client";
import { useState } from "react";
import type { User } from "./ProfileTab";
import { Button, Input } from "@/components/ui";
import { passwordChangeSchema } from "@/lib/validations/auth";

interface PasswordPanelProps {
    user: User;
    isSaving: boolean;
    setIsSaving: (val: boolean) => void;
    showToast: (message: string, type?: "success" | "error" | "info") => void;
}

function validatePasswordChange(passwordData: { currentPassword: string; newPassword: string; confirmPassword: string }) {
  const result = passwordChangeSchema.safeParse({
    currentPassword: passwordData.currentPassword,
    newPassword: passwordData.newPassword,
    confirmNewPassword: passwordData.confirmPassword,
  });
  if (!result.success) {
    return result.error.issues[0]?.message || "Invalid password data";
  }
  return null;
}

type ForgotPasswordStep = 'method' | 'otp' | 'new_password';
type ForgotPasswordMethod = 'email' | 'phone' | null;

export default function PasswordPanel({
    user,
    isSaving,
    setIsSaving,
    showToast: _showToast,
}: Readonly<PasswordPanelProps>) {
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
        step: ForgotPasswordStep;
        method: ForgotPasswordMethod;
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

        const valErr = validatePasswordChange(passwordData);
        if (valErr) {
            setPasswordError(valErr);
            return;
        }

        setIsSaving(true);

        type OtpType = 'email' | 'phone' | null;

        interface ChangePasswordRequest {
            newPassword: string;
            otpType?: OtpType;
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
            logger.error("Password change error:", _error);
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
            logger.error("Forgot password OTP send error:", _err);
            setPasswordError("Network error. Please try again.");
            setForgotPasswordState({ active: false, step: 'method', method: null, otp: '' });
        } finally {
            setIsSaving(false);
        }
    };

    const setCurrentPassword = (val: string) => {
        setPasswordData(prev => ({ ...prev, currentPassword: val }));
    };

    return (
        <div className="card">
            <h3
                className="text-xl font-bold mb-6"
            >
                Change Password
            </h3>

            {passwordSuccess && (
                <div
                    role="status"
                    aria-live="polite"
                    className="p-3 mb-4" style={{ background: "rgba(16, 185, 129, 0.1)", color: "var(--color-success)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(16, 185, 129, 0.2)" }}
                >
                    {passwordSuccess}
                </div>
            )}

            {passwordError && (
                <div
                    role="alert"
                    aria-live="assertive"
                    className="p-3 mb-4" style={{ background: "rgba(239, 68, 68, 0.1)", color: "var(--color-error)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(239, 68, 68, 0.2)" }}
                >
                    {passwordError}
                </div>
            )}

            <form onSubmit={handlePasswordChange}>
                <ForgotPasswordSection
                    forgotPasswordState={forgotPasswordState}
                    setForgotPasswordState={setForgotPasswordState}
                    handleSendForgotPasswordOtp={handleSendForgotPasswordOtp}
                    isSaving={isSaving}
                    user={user}
                />

                {!forgotPasswordState.active && (
                    <CurrentPasswordSection
                        passwordConfirmPending={passwordConfirmPending}
                        setForgotPasswordState={setForgotPasswordState}
                        showPassword={showPassword}
                        setShowPassword={setShowPassword}
                        currentPassword={passwordData.currentPassword}
                        setCurrentPassword={setCurrentPassword}
                    />
                )}

                {(!forgotPasswordState.active || forgotPasswordState.step === 'otp') && (
                    <>
                        <div className="mb-5">
                            <label className="label" htmlFor="new-password-input">New Password</label>
                            <div className="relative">
                                <Input
                                    id="new-password-input"
                                    type={showPassword.new ? "text" : "password"}
                                    value={passwordData.newPassword}
                                    onChange={(e) =>
                                        setPasswordData({
                                            ...passwordData,
                                            newPassword: e.target.value,
                                        })
                                    }
                                    required
                                    fullWidth
                                />
                                <Button
                                    type="button"
                                    aria-label={showPassword.new ? "Hide new password" : "Show new password"}
                                    onClick={() =>
                                        setShowPassword({
                                            ...showPassword,
                                            new: !showPassword.new,
                                        })
                                    }
                                    className="absolute cursor-pointer text-base" style={{ right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", opacity: 0.7 }}
                                >
                                    {showPassword.new ? "👁️" : "🙈"}
                                </Button>
                            </div>
                        </div>

                        <div className="mb-6">
                            <label className="label" htmlFor="confirm-password-input">Confirm New Password</label>
                            <div className="relative">
                                <Input
                                    id="confirm-password-input"
                                    type={showPassword.confirm ? "text" : "password"}
                                    value={passwordData.confirmPassword}
                                    onChange={(e) =>
                                        setPasswordData({
                                            ...passwordData,
                                            confirmPassword: e.target.value,
                                        })
                                    }
                                    required
                                    fullWidth
                                />
                                <Button
                                    type="button"
                                    aria-label={showPassword.confirm ? "Hide confirm password" : "Show confirm password"}
                                    onClick={() =>
                                        setShowPassword({
                                            ...showPassword,
                                            confirm: !showPassword.confirm,
                                        })
                                    }
                                    className="absolute cursor-pointer text-base" style={{ right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", opacity: 0.7 }}
                                >
                                    {showPassword.confirm ? "👁️" : "🙈"}
                                </Button>
                            </div>
                        </div>

                        {passwordConfirmPending ? (
                            <div className="flex flex-col gap-2 p-3" style={{ background: "rgba(244, 63, 94, 0.08)", borderRadius: "var(--radius-md)", border: "1px solid rgba(244, 63, 94, 0.3)" }}>
                                <p className="text-sm font-semibold" style={{ color: "var(--color-accent-rose)" }}>⚠️ Are you sure you want to update your password?</p>
                                <div className="flex gap-2">
                                    <Button type="submit" variant="danger" className="flex-1" disabled={isSaving}>
                                        {isSaving ? <span className="loading" /> : "Yes, Update Password"}
                                    </Button>
                                    <Button type="button" variant="secondary" className="flex-1" onClick={() => setPasswordConfirmPending(false)}>
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <Button
                                type="submit"
                                variant="primary"
                                disabled={isSaving}
                                className="w-full"
                            >
                                {isSaving ? <span className="loading" /> : "Update Password"}
                            </Button>
                        )}
                    </>
                )}
            </form>
        </div>
    );
}

// ==================== SUBCOMPONENTS ====================

interface ForgotPasswordSectionProps {
  readonly forgotPasswordState: {
    readonly active: boolean;
    readonly step: ForgotPasswordStep;
    readonly method: ForgotPasswordMethod;
    readonly otp: string;
  };
  readonly setForgotPasswordState: React.Dispatch<React.SetStateAction<{
    active: boolean;
    step: ForgotPasswordStep;
    method: ForgotPasswordMethod;
    otp: string;
  }>>;
  readonly handleSendForgotPasswordOtp: (method: 'email' | 'phone') => void;
  readonly isSaving: boolean;
  readonly user: User;
}

function ForgotPasswordSection({
  forgotPasswordState,
  setForgotPasswordState,
  handleSendForgotPasswordOtp,
  isSaving,
  user,
}: ForgotPasswordSectionProps) {
  if (!forgotPasswordState.active) return null;
  return (
    <div className="mb-5 flex flex-col" style={{ gap: "10px" }}>
      {forgotPasswordState.step === 'method' && (
        <>
          <p className="text-sm text-secondary">Choose where to send the OTP:</p>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={() => handleSendForgotPasswordOtp('email')} disabled={isSaving || !user?.email} className="flex-1">{user?.email ? "Send to Email" : "No Email Added"}</Button>
            <Button type="button" variant="secondary" onClick={() => handleSendForgotPasswordOtp('phone')} disabled={isSaving || !user?.phone} className="flex-1">{user?.phone ? "Send to Phone" : "No Phone Added"}</Button>
          </div>
          <Button type="button" className="text-muted text-sm cursor-pointer" style={{ background: "none", border: "none", textDecoration: "underline" }} onClick={() => setForgotPasswordState({ active: false, step: 'method', method: null, otp: '' })}>Cancel</Button>
        </>
      )}
      {forgotPasswordState.step === 'otp' && (
        <>
          <Input
            label={`Enter OTP sent to your ${forgotPasswordState.method}`}
            id="otp-input"
            type="text"
            placeholder="e.g. 123456"
            value={forgotPasswordState.otp}
            onChange={(e) => setForgotPasswordState(prev => ({ ...prev, otp: e.target.value }))}
            required
            autoComplete="one-time-code"
            fullWidth
          />
          <Button type="button" className="text-muted text-sm cursor-pointer" style={{ background: "none", border: "none", textDecoration: "underline", alignSelf: "flex-start" }} onClick={() => setForgotPasswordState({ active: false, step: 'method', method: null, otp: '' })}>Cancel Reset</Button>
        </>
      )}
    </div>
  );
}

interface CurrentPasswordSectionProps {
  readonly passwordConfirmPending: boolean;
  readonly setForgotPasswordState: React.Dispatch<React.SetStateAction<{
    active: boolean;
    step: 'method' | 'otp' | 'new_password';
    method: 'email' | 'phone' | null;
    otp: string;
  }>>;
  readonly showPassword: { current: boolean };
  readonly setShowPassword: React.Dispatch<React.SetStateAction<{ current: boolean; new: boolean; confirm: boolean }>>;
  readonly currentPassword: string;
  readonly setCurrentPassword: (val: string) => void;
}

function CurrentPasswordSection({
  passwordConfirmPending: _confirmPending,
  setForgotPasswordState,
  showPassword,
  setShowPassword,
  currentPassword,
  setCurrentPassword,
}: CurrentPasswordSectionProps) {
  return (
    <div className="mb-5">
      <div className="flex justify-between items-center mb-2">
        <label className="label" htmlFor="current-password-input" style={{ marginBottom: 0 }}>Current Password</label>
        <Button
          type="button"
          onClick={() => setForgotPasswordState({ active: true, step: 'method', method: null, otp: '' })}
          className="text-sm font-semibold cursor-pointer" style={{ background: "none", border: "none", color: "var(--color-primary-light)", padding: 0 }}
        >
          Forgot Password?
        </Button>
      </div>
      <div className="relative">
        <Input
          id="current-password-input"
          type={showPassword.current ? "text" : "password"}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          fullWidth
        />
        <Button
          type="button"
          aria-label={showPassword.current ? "Hide current password" : "Show current password"}
          onClick={() =>
            setShowPassword(prev => ({
              ...prev,
              current: !prev.current,
            }))
          }
          className="absolute cursor-pointer text-base" style={{ right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", opacity: 0.7 }}
        >
          {showPassword.current ? "👁️" : "🙈"}
        </Button>
      </div>
    </div>
  );
}
