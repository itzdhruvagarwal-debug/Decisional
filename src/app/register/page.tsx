"use client";


import { logger } from "@/lib/logger-client";
import Link from "next/link";
import Image from "next/image";
import Logo from "../../components/Logo";
import { Suspense, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80, "Name cannot exceed 80 characters"),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Please enter a valid 10-digit Indian phone number"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  confirmPassword: z.string(),
  referralCode: z.string().optional(),
  agreeToTerms: z.literal(true, {
    message: "You must agree to the Terms of Service and Privacy Policy",
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type RegisterFormValues = z.infer<typeof registerSchema>;

type UserType = "INFLUENCER" | "BRAND";

function parseUserType(value: string | null): UserType | null {
  const normalized = value?.toUpperCase();
  return normalized === "INFLUENCER" || normalized === "BRAND"
    ? normalized
    : null;
}

function _getPasswordIssue(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password)) return "Password must include one uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must include one lowercase letter";
  if (!/\d/.test(password)) return "Password must include one number";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include one special character";
  return null;
}

function formatOtpChannel(channel: "whatsapp" | "sms" | "dev" | null) {
  if (channel === "sms") return "by SMS";
  if (channel === "dev") return "in development mode";
  return "on WhatsApp";
}

async function getDeviceFingerprint() {
  const raw = [
    navigator.userAgent,
    navigator.language,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen.width,
    screen.height,
    screen.colorDepth,
    navigator.hardwareConcurrency || 0,
    navigator.platform,
  ].join("|");

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const userTypeInfo = {
  INFLUENCER: {
    title: "Influencer",
    icon: "CR",
    description:
      "Create content, grow your audience, and earn money from brand collaborations.",
    benefits: [
      "Apply to unlimited campaigns",
      "Clear payout terms before signing",
      "Build your portfolio",
    ],
  },
  BRAND: {
    title: "Brand",
    icon: "BR",
    description:
      "Find verified influencers, launch campaigns, and track results.",
    benefits: [
      "Access verified creators",
      "Secure pre-auth payments",
      "Content approval flow",
    ],
  },
};

interface UserTypeSelectionProps {
  readonly userType: UserType | null;
  readonly handleUserTypeSelect: (type: UserType) => void;
}

function UserTypeSelection({ userType, handleUserTypeSelect }: Readonly<UserTypeSelectionProps>) {
  return (
    <>
      <h1
        style={{
          fontSize: "28px",
          fontWeight: 800,
          textAlign: "center",
          marginBottom: "8px",
        }}
      >
        Join Decisional
      </h1>
      <p
        style={{
          textAlign: "center",
          color: "var(--color-text-secondary)",
          marginBottom: "40px",
        }}
      >
        Choose how you want to use the platform
      </p>

      <div
        className="grid-2"
        style={{ gap: "16px", maxWidth: "560px", margin: "0 auto" }}
      >
        {(Object.keys(userTypeInfo) as UserType[]).map((type) => (
          <Button
            key={type}
            onClick={() => handleUserTypeSelect(type)}
            className="card hover-lift"
            style={{
              textAlign: "center",
              cursor: "pointer",
              transition: "all var(--transition-normal)",
              border:
                userType === type
                  ? "2px solid var(--color-primary)"
                  : "1px solid var(--color-border)",
            }}
          >
            <div
              className="feature-icon"
              style={{ margin: "0 auto 16px", fontSize: "32px" }}
            >
              {userTypeInfo[type].icon}
            </div>
            <h3
              style={{
                fontSize: "18px",
                fontWeight: 700,
                marginBottom: "8px",
              }}
            >
              {userTypeInfo[type].title}
            </h3>
            <p
              style={{
                fontSize: "13px",
                color: "var(--color-text-secondary)",
                marginBottom: "16px",
                minHeight: "40px",
              }}
            >
              {userTypeInfo[type].description}
            </p>
            <ul
              style={{
                listStyle: "none",
                fontSize: "12px",
                color: "var(--color-text-muted)",
                textAlign: "left",
              }}
            >
              {userTypeInfo[type].benefits.map((benefit) => (
                <li key={benefit} style={{ marginBottom: "6px" }}>
                  <svg
                    style={{
                      color: "var(--color-accent-emerald)",
                      width: "14px",
                      height: "14px",
                      display: "inline-block",
                      verticalAlign: "middle",
                      marginRight: "4px",
                    }}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>{" "}
                  {benefit}
                </li>
              ))}
            </ul>
          </Button>
        ))}
      </div>

      <div className="divider" />

      <p
        style={{
          textAlign: "center",
          color: "var(--color-text-secondary)",
          fontSize: "14px",
        }}
      >
        Already have an account?{" "}
        <Link
          href="/login"
          style={{
            color: "var(--color-primary-light)",
            fontWeight: 600,
          }}
        >
          Sign In
        </Link>
      </p>
    </>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span className="loading" />
        </div>
      }
    >
      <RegisterContent />
    </Suspense>
  );
}



function useRegistration(
  initialType: UserType | null,
  initialReferralCode: string,
  initialError: string,
  router: ReturnType<typeof useRouter>
) {
  const [step, setStep] = useState(initialType ? 2 : 1);
  const [userType, setUserType] = useState<UserType | null>(initialType);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    referralCode: initialReferralCode,
    agreeToTerms: false,
  });
  const [error, setError] = useState(initialError);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  // OTP verification state
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpVerified, setEmailOtpVerified] = useState(false);
  const [emailOtp, setEmailOtp] = useState("");
  const [emailOtpLoading, setEmailOtpLoading] = useState(false);
  const [emailOtpError, setEmailOtpError] = useState("");
  const [emailCooldown, setEmailCooldown] = useState(0);

  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtpVerified, setPhoneOtpVerified] = useState(false);
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneOtpLoading, setPhoneOtpLoading] = useState(false);
  const [phoneOtpError, setPhoneOtpError] = useState("");
  const [phoneOtpChannel, setPhoneOtpChannel] = useState<"whatsapp" | "sms" | "dev" | null>(null);
  const [phoneCooldown, setPhoneCooldown] = useState(0);

  const getEmailOtpButtonText = () => {
    if (emailOtpLoading) return "Sending...";
    if (emailCooldown > 0) return `Resend (${emailCooldown}s)`;
    if (emailOtpSent) return "Resend OTP";
    return "Send OTP";
  };

  const getPhoneOtpButtonText = () => {
    if (phoneOtpLoading) return "Sending...";
    if (phoneCooldown > 0) return `Resend (${phoneCooldown}s)`;
    if (phoneOtpSent) return "Resend OTP";
    return "Send OTP";
  };

  const getVerificationStatusText = () => {
    if (emailOtpVerified && phoneOtpVerified) {
      return "Both email and phone verified - you can create your account!";
    }
    const remaining = emailOtpVerified ? "Phone" : "Email";
    return `${remaining} verification remaining`;
  };

  const renderSubmitButtonContent = () => {
    if (isLoading) return <span className="loading" />;
    if (!emailOtpVerified || !phoneOtpVerified) return "Verify Email & Phone First";
    return "Create Account";
  };

  // Cooldown timer
  const startCooldown = useCallback(
    (setter: React.Dispatch<React.SetStateAction<number>>, seconds: number) => {
      setter(seconds);
      const interval = setInterval(() => {
        setter((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [],
  );

  // Send email OTP
  const handleSendEmailOtp = async () => {
    if (!formData.email || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(formData.email)) {
      setEmailOtpError("Enter a valid email address first");
      return;
    }
    setEmailOtpLoading(true);
    setEmailOtpError("");
    try {
      const res = await fetch("/api/auth/verify-email-otp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email, type: "registration" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEmailOtpError(data.error || "Failed to send OTP");
        return;
      }
      if (data.otp && process.env.NODE_ENV !== "production") {
        setEmailOtp(data.otp);
      }
      setEmailOtpSent(true);
      startCooldown(setEmailCooldown, 60);
    } catch {
      setEmailOtpError("Network error. Please try again.");
    } finally {
      setEmailOtpLoading(false);
    }
  };

  // Verify email OTP
  const handleVerifyEmailOtp = async () => {
    if (emailOtp?.length !== 6) {
      setEmailOtpError("Enter a 6-digit OTP");
      return;
    }
    setEmailOtpLoading(true);
    setEmailOtpError("");
    try {
      const res = await fetch("/api/auth/verify-email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          otp: emailOtp,
          type: "registration",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEmailOtpError(data.error || "Invalid OTP");
        return;
      }
      setEmailOtpVerified(true);
    } catch {
      setEmailOtpError("Network error. Please try again.");
    } finally {
      setEmailOtpLoading(false);
    }
  };

  // Send phone OTP
  const handleSendPhoneOtp = async () => {
    if (!formData.phone || !/^[6-9]\d{9}$/.test(formData.phone)) {
      setPhoneOtpError("Enter a valid 10-digit Indian mobile number");
      return;
    }
    setPhoneOtpLoading(true);
    setPhoneOtpError("");
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: formData.phone, type: "registration" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhoneOtpError(data.error || "Failed to send OTP");
        return;
      }
      setPhoneOtpChannel(data.channel || null);
      if (data.otp && process.env.NODE_ENV !== "production") {
        setPhoneOtp(data.otp);
      }
      setPhoneOtpSent(true);
      startCooldown(setPhoneCooldown, 60);
    } catch {
      setPhoneOtpError("Network error. Please try again.");
    } finally {
      setPhoneOtpLoading(false);
    }
  };

  // Verify phone OTP
  const handleVerifyPhoneOtp = async () => {
    if (phoneOtp?.length !== 6) {
      setPhoneOtpError("Enter a 6-digit OTP");
      return;
    }
    setPhoneOtpLoading(true);
    setPhoneOtpError("");
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: formData.phone,
          otp: phoneOtp,
          type: "registration",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhoneOtpError(data.error || "Invalid OTP");
        return;
      }
      setPhoneOtpVerified(true);
    } catch {
      setPhoneOtpError("Network error. Please try again.");
    } finally {
      setPhoneOtpLoading(false);
    }
  };

  const handleUserTypeSelect = (type: UserType) => {
    setUserType(type);
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    if (!emailOtpVerified) {
      setError("Please verify your email address first");
      return;
    }
    if (!phoneOtpVerified) {
      setError("Please verify your phone number first");
      return;
    }
    if (!userType) {
      setError("Please choose whether you are joining as a brand or influencer");
      setStep(1);
      return;
    }

    const validation = registerSchema.safeParse({
      name: formData.name.trim(),
      email: formData.email,
      phone: formData.phone,
      password: formData.password,
      confirmPassword: formData.confirmPassword,
      referralCode: formData.referralCode || undefined,
      agreeToTerms: formData.agreeToTerms,
    });

    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.issues.forEach((issue) => {
        const path = issue.path[0];
        if (typeof path === "string") {
          errors[path] = issue.message;
        }
      });
      setFieldErrors(errors);
      setError("Please fix the validation errors below.");
      return;
    }

    setIsLoading(true);

    try {
      const deviceFingerprint = await getDeviceFingerprint().catch(() => undefined);
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email,
          phone: formData.phone,
          password: formData.password,
          userType,
          referralCode: formData.referralCode || undefined,
          emailOtpVerified: true,
          phoneOtpVerified: true,
          deviceFingerprint,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.details?.fieldErrors) {
          const firstField = Object.keys(data.details.fieldErrors)[0];
          const firstError = firstField ? data.details.fieldErrors[firstField]?.[0] : undefined;
          setError(firstError || data.error || "Registration failed");
        } else {
          setError(data.error || "Registration failed");
        }
        return;
      }

      // Redirect to login after creating a verified, active account.
      router.push("/login?registered=true");
    } catch (err: unknown) {
      logger.error("[register] submission error:", err);
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return {
    step,
    setStep,
    userType,
    setUserType,
    showPassword,
    setShowPassword,
    showConfirmPassword,
    setShowConfirmPassword,
    formData,
    setFormData,
    error,
    setError,
    fieldErrors,
    setFieldErrors,
    isLoading,
    setIsLoading,
    emailOtpSent,
    setEmailOtpSent,
    emailOtpVerified,
    setEmailOtpVerified,
    emailOtp,
    setEmailOtp,
    emailOtpLoading,
    setEmailOtpLoading,
    emailOtpError,
    setEmailOtpError,
    emailCooldown,
    setEmailCooldown,
    phoneOtpSent,
    setPhoneOtpSent,
    phoneOtpVerified,
    setPhoneOtpVerified,
    phoneOtp,
    setPhoneOtp,
    phoneOtpLoading,
    setPhoneOtpLoading,
    phoneOtpError,
    setPhoneOtpError,
    phoneOtpChannel,
    setPhoneOtpChannel,
    phoneCooldown,
    setPhoneCooldown,
    getEmailOtpButtonText,
    getPhoneOtpButtonText,
    getVerificationStatusText,
    renderSubmitButtonContent,
    startCooldown,
    handleSendEmailOtp,
    handleVerifyEmailOtp,
    handleSendPhoneOtp,
    handleVerifyPhoneOtp,
    handleUserTypeSelect,
    handleSubmit,
  };
}

interface Step2RegistrationFormProps {
  readonly registration: ReturnType<typeof useRegistration>;
  readonly setStep: (step: number) => void;
  readonly userType: "BRAND" | "INFLUENCER";
  readonly otpButton: (loading: boolean, cooldown: number, disabled?: boolean) => React.CSSProperties;
  readonly verifiedBadge: React.CSSProperties;
}

interface Step2HeaderProps {
  readonly userType: "BRAND" | "INFLUENCER";
  readonly onBack: () => void;
}

function Step2Header({ userType, onBack }: Step2HeaderProps) {
  return (
    <>
      <Button
        variant="ghost"
        onClick={onBack}
        style={{
          background: "none",
          border: "none",
          color: "var(--color-text-secondary)",
          fontSize: "14px",
          cursor: "pointer",
          marginBottom: "16px",
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}
      >
        Back
      </Button>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        <div style={{ fontSize: "36px" }}>
          {userTypeInfo[userType].icon}
        </div>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 800 }}>
            Create {userTypeInfo[userType].title} Account
          </h1>
          <p
            style={{
              color: "var(--color-text-secondary)",
              fontSize: "14px",
            }}
          >
            Verify your email &amp; phone to get started
          </p>
        </div>
      </div>
    </>
  );
}

interface PasswordFieldProps {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly onChange: (val: string) => void;
  readonly show: boolean;
  readonly setShow: (show: boolean) => void;
  readonly minLength?: number | undefined;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
}

function PasswordField({
  id,
  label,
  placeholder,
  value,
  onChange,
  show,
  setShow,
  minLength,
  hint,
  error,
}: PasswordFieldProps) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <div style={{ position: "relative" }}>
        <Input
          id={id}
          label={label}
          type={show ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          minLength={minLength}
          style={{ paddingRight: "40px" }}
          error={error}
          fullWidth
        />
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShow(!show)}
          style={{
            position: "absolute",
            right: "12px",
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text-secondary)",
            padding: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {show ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
          )}
        </Button>
      </div>
      {hint && (
        <p
          style={{
            fontSize: "12px",
            color: "var(--color-text-muted)",
            marginTop: "4px",
          }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

function Step2RegistrationForm({
  registration,
  setStep,
  userType,
  otpButton,
  verifiedBadge,
}: Readonly<Step2RegistrationFormProps>) {
  const {
    formData,
    setFormData,
    error,
    fieldErrors,
    handleSubmit,
    emailOtpVerified,
    phoneOtpVerified,
    showPassword,
    setShowPassword,
    showConfirmPassword,
    setShowConfirmPassword,
    isLoading,
    getVerificationStatusText,
    renderSubmitButtonContent,
  } = registration;

  return (
    <>
      <Step2Header userType={userType} onBack={() => setStep(1)} />

      {error && (
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(244, 63, 94, 0.08)",
            border: "1px solid rgba(244, 63, 94, 0.3)",
            borderRadius: "var(--radius-md)",
            color: "var(--color-accent-rose)",
            fontSize: "14px",
            marginBottom: "24px",
            animation: "slideDown 0.3s ease-out",
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "20px" }}>
          <Input
            id="name"
            label={userType === "BRAND" ? "Brand / Company Name *" : "Full Name *"}
            type="text"
            placeholder={userType === "BRAND" ? "Acme Pvt Ltd" : "Your full name"}
            value={formData.name}
            onChange={(e) =>
              setFormData({ ...formData, name: e.target.value })
            }
            required
            maxLength={80}
            autoComplete={userType === "BRAND" ? "organization" : "name"}
            error={fieldErrors.name}
            fullWidth
          />
        </div>

        {/* Email field + OTP */}
        <EmailOtpField
          registration={registration}
          otpButton={otpButton}
          verifiedBadge={verifiedBadge}
        />

        {/* Phone field + OTP */}
        <PhoneOtpField
          registration={registration}
          otpButton={otpButton}
          verifiedBadge={verifiedBadge}
        />

        {/* Verification status banner */}
        {(emailOtpVerified || phoneOtpVerified) && (
          <div
            style={{
              padding: "12px 16px",
              background:
                emailOtpVerified && phoneOtpVerified
                  ? "rgba(16, 185, 129, 0.08)"
                  : "rgba(245, 158, 11, 0.08)",
              border: `1px solid ${emailOtpVerified && phoneOtpVerified ? "rgba(16, 185, 129, 0.3)" : "rgba(245, 158, 11, 0.3)"}`,
              borderRadius: "var(--radius-md)",
              marginBottom: "20px",
              fontSize: "13px",
              color:
                emailOtpVerified && phoneOtpVerified
                  ? "#10b981"
                  : "#f59e0b",
            }}
          >
            {getVerificationStatusText()}
          </div>
        )}

        {/* Password */}
        <PasswordField
          id="password"
          label="Password *"
          placeholder="Minimum 8 characters"
          value={formData.password}
          onChange={(val) => setFormData({ ...formData, password: val })}
          show={showPassword}
          setShow={setShowPassword}
          minLength={8}
          hint="Must contain 8+ chars, uppercase, lowercase, number & special char."
          error={fieldErrors.password}
        />

        {/* Confirm password */}
        <PasswordField
          id="confirmPassword"
          label="Confirm Password *"
          placeholder="Re-enter password"
          value={formData.confirmPassword}
          onChange={(val) => setFormData({ ...formData, confirmPassword: val })}
          show={showConfirmPassword}
          setShow={setShowConfirmPassword}
          error={fieldErrors.confirmPassword}
        />

        {/* Referral code */}
        <div style={{ marginBottom: "24px" }}>
          <Input
            id="referralCode"
            label="Referral Code (optional)"
            type="text"
            placeholder="Enter if you have one"
            value={formData.referralCode}
            onChange={(e) =>
              setFormData({
                ...formData,
                referralCode: e.target.value.toUpperCase(),
              })
            }
            error={fieldErrors.referralCode}
            fullWidth
          />
        </div>

        {/* Terms */}
        <div style={{ marginBottom: "24px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
            }}
          >
            <input
              id="agreeToTerms"
              type="checkbox"
              checked={formData.agreeToTerms}
              onChange={(e) =>
                setFormData({ ...formData, agreeToTerms: e.target.checked })
              }
              style={{ marginTop: "4px" }}
            />
            <label
              htmlFor="agreeToTerms"
              style={{
                fontSize: "13px",
                color: "var(--color-text-secondary)",
                cursor: "pointer",
              }}
            >
              I agree to the{" "}
              <Link
                href="/terms"
                style={{ color: "var(--color-primary-light)" }}
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                style={{ color: "var(--color-primary-light)" }}
              >
                Privacy Policy
              </Link>
            </label>
          </div>
          {fieldErrors.agreeToTerms && (
            <span
              style={{
                fontSize: "12px",
                color: "var(--color-accent-rose, #f43f5e)",
                marginTop: "4px",
                display: "block",
              }}
            >
              {fieldErrors.agreeToTerms}
            </span>
          )}
        </div>

        {/* Submit */}
        <Button
          type="submit"
          variant="primary"
          disabled={
            isLoading || !emailOtpVerified || !phoneOtpVerified
          }
          style={{
            width: "100%",
            padding: "14px",
            fontSize: "16px",
            marginBottom: "24px",
            opacity:
              !emailOtpVerified || !phoneOtpVerified ? 0.5 : 1,
          }}
        >
          {renderSubmitButtonContent()}
        </Button>
      </form>

      <div className="divider" style={{ marginTop: "12px" }} />

      <p
        style={{
          textAlign: "center",
          color: "var(--color-text-secondary)",
          fontSize: "14px",
        }}
      >
        Already have an account?{" "}
        <Link
          href="/login"
          style={{
            color: "var(--color-primary-light)",
            fontWeight: 600,
          }}
        >
          Sign In
        </Link>
      </p>
    </>
  );
}

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = searchParams?.get("error");
  const initialError = urlError === "OAuthAccountNotRegistered"
    ? "Please create an account before signing in with Google."
    : "";
  const initialType = parseUserType(searchParams.get("type"));
  const initialReferralCode = searchParams.get("ref")?.trim().toUpperCase() || "";

  const registration = useRegistration(initialType, initialReferralCode, initialError, router);

  const {
    step,
    setStep,
    userType,
    handleUserTypeSelect,
  } = registration;

  // Shared styles
  const verifiedBadge = {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    background: "rgba(16, 185, 129, 0.1)",
    color: "#10b981",
    padding: "6px 12px",
    borderRadius: "20px",
    fontSize: "13px",
    fontWeight: 600,
  } as const;

  const otpButton = (loading: boolean, cooldown: number, disabled?: boolean) =>
    ({
      padding: "10px 16px",
      fontSize: "13px",
      fontWeight: 600,
      border: "none",
      borderRadius: "var(--radius-md)",
      cursor: disabled || loading || cooldown > 0 ? "not-allowed" : "pointer",
      opacity: disabled || loading || cooldown > 0 ? 0.5 : 1,
      background: "var(--color-primary)",
      color: "#fff",
      transition: "all 0.2s ease",
      whiteSpace: "nowrap" as const,
    }) as const;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(16px, 5vw, 24px)",
        position: "relative",
        overflowX: "hidden",
      }}
    >
      {/* Realistic Abstract Background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
        }}
      >
        <Image
          src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop"
          alt="Abstract Background"
          fill
          unoptimized
          style={{
            objectFit: "cover",
            opacity: 0.4,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at center, rgba(10, 10, 20, 0.8) 0%, rgba(10, 10, 20, 0.95) 100%)",
          }}
        />
      </div>

      <div
        className="card animate-fade-in-scale"
        style={{
          width: "100%",
          maxWidth:
            step === 1
              ? "min(800px, calc(100vw - 32px))"
              : "min(520px, calc(100vw - 32px))",
          minWidth: 0,
          padding: "clamp(24px, 4vw, 40px)",
          position: "relative",
          zIndex: 1,
          transition: "max-width var(--transition-slow)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: "32px",
          }}
        >
          <Logo />
        </div>

        {/* Step 1: Choose User Type */}
        {step === 1 && (
          <UserTypeSelection
            userType={userType}
            handleUserTypeSelect={handleUserTypeSelect}
          />
        )}

        {/* Step 2: Registration Form */}
        {step === 2 && userType && (
          <Step2RegistrationForm
            registration={registration}
            setStep={setStep}
            userType={userType}
            otpButton={otpButton}
            verifiedBadge={verifiedBadge}
          />
        )}
      </div >
    </div >
  );
}

interface EmailOtpFieldProps {
  readonly registration: ReturnType<typeof useRegistration>;
  readonly otpButton: (loading: boolean, cooldown: number, disabled?: boolean) => React.CSSProperties;
  readonly verifiedBadge: React.CSSProperties;
}

function EmailOtpField({ registration, otpButton, verifiedBadge }: EmailOtpFieldProps) {
  const {
    formData,
    setFormData,
    emailOtpSent,
    setEmailOtpSent,
    emailOtpVerified,
    setEmailOtpVerified,
    emailOtp,
    setEmailOtp,
    emailOtpLoading,
    emailOtpError,
    emailCooldown,
    getEmailOtpButtonText,
    handleSendEmailOtp,
    handleVerifyEmailOtp,
  } = registration;

  return (
    <div style={{ marginBottom: "20px" }}>
      <label className="label" htmlFor="email">
        Email Address *
      </label>
      <div className="auth-otp-row" style={{ display: "flex", gap: "8px" }}>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={formData.email}
          onChange={(e) => {
            setFormData({ ...formData, email: e.target.value });
            if (emailOtpVerified || emailOtpSent) {
              setEmailOtpVerified(false);
              setEmailOtpSent(false);
              setEmailOtp("");
            }
          }}
          required
          disabled={emailOtpVerified}
          style={{ flex: "1 1 220px", minWidth: 0, opacity: emailOtpVerified ? 0.7 : 1 }}
          error={registration.fieldErrors?.email}
        />
        {!emailOtpVerified && (
          <Button
            id="send-email-otp"
            type="button"
            onClick={handleSendEmailOtp}
            disabled={emailOtpLoading || emailCooldown > 0}
            style={otpButton(emailOtpLoading, emailCooldown)}
          >
            {getEmailOtpButtonText()}
          </Button>
        )}
      </div>

      {emailOtpVerified && (
        <div style={{ marginTop: "8px" }}>
          <span style={verifiedBadge}>Email Verified</span>
        </div>
      )}

      {emailOtpSent && !emailOtpVerified && (
        <div style={{ marginTop: "10px" }}>
          <p
            style={{
              fontSize: "12px",
              color: "var(--color-accent-emerald)",
              marginBottom: "8px",
            }}
          >
            OTP sent to {formData.email}
          </p>
          <div className="auth-otp-row" style={{ display: "flex", gap: "8px" }}>
            <Input
              id="email-otp-input"
              type="text"
              placeholder="Enter 6-digit OTP"
              value={emailOtp}
              onChange={(e) =>
                setEmailOtp(
                  e.target.value.replace(/\D/g, "").slice(0, 6),
                )
              }
              maxLength={6}
              style={{
                flex: "1 1 180px",
                minWidth: 0,
                letterSpacing: 0,
                fontFamily: "'Courier New', monospace",
                fontWeight: 700,
                fontSize: "18px",
                textAlign: "center",
              }}
            />
            <Button
              id="verify-email-otp"
              type="button"
              onClick={handleVerifyEmailOtp}
              disabled={emailOtpLoading || emailOtp.length !== 6}
              style={otpButton(
                emailOtpLoading,
                0,
                emailOtp.length !== 6,
              )}
            >
              {emailOtpLoading ? "..." : "Verify"}
            </Button>
          </div>
          {emailOtpError && (
            <p
              style={{
                fontSize: "12px",
                color: "var(--color-accent-rose)",
                marginTop: "4px",
              }}
            >
              {emailOtpError}
            </p>
          )}
        </div>
      )}

      {!emailOtpSent && emailOtpError && (
        <p
          style={{
            fontSize: "12px",
            color: "var(--color-accent-rose)",
            marginTop: "4px",
          }}
        >
          {emailOtpError}
        </p>
      )}
    </div>
  );
}

interface PhoneOtpFieldProps {
  readonly registration: ReturnType<typeof useRegistration>;
  readonly otpButton: (loading: boolean, cooldown: number, disabled?: boolean) => React.CSSProperties;
  readonly verifiedBadge: React.CSSProperties;
}

function PhoneOtpField({ registration, otpButton, verifiedBadge }: PhoneOtpFieldProps) {
  const {
    formData,
    setFormData,
    phoneOtpSent,
    setPhoneOtpSent,
    phoneOtpVerified,
    setPhoneOtpVerified,
    phoneOtp,
    setPhoneOtp,
    phoneOtpLoading,
    phoneOtpError,
    phoneOtpChannel,
    phoneCooldown,
    getPhoneOtpButtonText,
    handleSendPhoneOtp,
    handleVerifyPhoneOtp,
  } = registration;

  return (
    <div style={{ marginBottom: "20px" }}>
      <label className="label" htmlFor="phone">
        Phone Number *
      </label>
      <div className="auth-otp-row auth-phone-row" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <span
          style={{
            padding: "10px 12px",
            background: "var(--color-surface-elevated)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            color: "var(--color-text-secondary)",
            fontSize: "14px",
            fontWeight: 500,
          }}
        >
          +91
        </span>
        <Input
          id="phone"
          type="tel"
          placeholder="9876543210"
          value={formData.phone}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, "").slice(0, 10);
            setFormData({ ...formData, phone: val });
            if (phoneOtpVerified || phoneOtpSent) {
              setPhoneOtpVerified(false);
              setPhoneOtpSent(false);
              setPhoneOtp("");
            }
          }}
          required
          disabled={phoneOtpVerified}
          maxLength={10}
          style={{ flex: "1 1 160px", minWidth: 0, opacity: phoneOtpVerified ? 0.7 : 1 }}
          error={registration.fieldErrors?.phone}
        />
        {!phoneOtpVerified && (
          <Button
            id="send-phone-otp"
            type="button"
            onClick={handleSendPhoneOtp}
            disabled={phoneOtpLoading || phoneCooldown > 0}
            style={otpButton(phoneOtpLoading, phoneCooldown)}
          >
            {getPhoneOtpButtonText()}
          </Button>
        )}
      </div>

      {phoneOtpVerified && (
        <div style={{ marginTop: "8px" }}>
          <span style={verifiedBadge}>Phone Verified</span>
        </div>
      )}

      {phoneOtpSent && !phoneOtpVerified && (
        <div style={{ marginTop: "10px" }}>
          <p
            style={{
              fontSize: "12px",
              color: "var(--color-accent-emerald)",
              marginBottom: "8px",
            }}
          >
            OTP sent {formatOtpChannel(phoneOtpChannel)} to +91-{formData.phone}
          </p>
          <div className="auth-otp-row" style={{ display: "flex", gap: "8px" }}>
            <Input
              id="phone-otp-input"
              type="text"
              placeholder="Enter 6-digit OTP"
              value={phoneOtp}
              onChange={(e) =>
                setPhoneOtp(
                  e.target.value.replace(/\D/g, "").slice(0, 6),
                )
              }
              maxLength={6}
              style={{
                flex: "1 1 180px",
                minWidth: 0,
                letterSpacing: 0,
                fontFamily: "'Courier New', monospace",
                fontWeight: 700,
                fontSize: "18px",
                textAlign: "center",
              }}
            />
            <Button
              id="verify-phone-otp"
              type="button"
              onClick={handleVerifyPhoneOtp}
              disabled={phoneOtpLoading || phoneOtp.length !== 6}
              style={otpButton(
                phoneOtpLoading,
                0,
                phoneOtp.length !== 6,
              )}
            >
              {phoneOtpLoading ? "..." : "Verify"}
            </Button>
          </div>
          {phoneOtpError && (
            <p
              style={{
                fontSize: "12px",
                color: "var(--color-accent-rose)",
                marginTop: "4px",
              }}
            >
              {phoneOtpError}
            </p>
          )}
        </div>
      )}

      {!phoneOtpSent && phoneOtpError && (
        <p
          style={{
            fontSize: "12px",
            color: "var(--color-accent-rose)",
            marginTop: "4px",
          }}
        >
          {phoneOtpError}
        </p>
      )}
    </div>
  );
}
