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
      <h1 className="usertype-title">
        Join Decisional
      </h1>
      <p className="usertype-subtitle">
        Choose how you want to use the platform
      </p>

      <div className="usertype-grid">
        {(Object.keys(userTypeInfo) as UserType[]).map((type) => (
          <Button
            key={type}
            onClick={() => handleUserTypeSelect(type)}
            className={`usertype-card hover-lift ${
              userType === type ? "usertype-card-selected" : ""
            }`}
          >
            <div className="usertype-icon-wrapper">
              {userTypeInfo[type].icon}
            </div>
            <h3 className="usertype-card-name">
              {userTypeInfo[type].title}
            </h3>
            <p className="usertype-card-desc">
              {userTypeInfo[type].description}
            </p>
            <ul className="usertype-benefit-list">
              {userTypeInfo[type].benefits.map((benefit) => (
                <li key={benefit} className="usertype-benefit-item">
                  <svg
                    className="usertype-benefit-icon"
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

      <p className="auth-footer-text">
        Already have an account?{" "}
        <Link
          href="/login"
          className="auth-footer-link"
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
        <div className="auth-fallback">
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
        className="auth-back-btn"
      >
        Back
      </Button>

      <div className="auth-header-container">
        <div className="auth-header-icon">
          {userTypeInfo[userType].icon}
        </div>
        <div>
          <h1 className="auth-header-title">
            Create {userTypeInfo[userType].title} Account
          </h1>
          <p className="auth-header-subtitle">
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
    <div className="auth-form-group">
      <div className="auth-field-relative">
        <Input
          id={id}
          label={label}
          type={show ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          minLength={minLength}
          className="auth-field-password-input"
          error={error}
          fullWidth
        />
        <Button
          type="button"
          variant="ghost"
          onClick={() => setShow(!show)}
          className="auth-field-password-toggle"
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
        <p className="auth-error-msg">
          {hint}
        </p>
      )}
    </div>
  );
}

interface Step2RegistrationFormProps {
  readonly registration: ReturnType<typeof useRegistration>;
  readonly setStep: (step: number) => void;
  readonly userType: "BRAND" | "INFLUENCER";
}

function Step2RegistrationForm({
  registration,
  setStep,
  userType,
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
        <div className="text-center mb-6 auth-error-banner">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="auth-form-group">
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
        <EmailOtpField registration={registration} />

        {/* Phone field + OTP */}
        <PhoneOtpField registration={registration} />

        {/* Verification status banner */}
        {(emailOtpVerified || phoneOtpVerified) && (
          <div className={`auth-otp-status-banner ${emailOtpVerified && phoneOtpVerified ? "verified" : "warning"}`}>
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
        <div className="auth-form-group mb-6">
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
        <div className="auth-form-group mb-6">
          <div className="auth-terms-row">
            <input
              id="agreeToTerms"
              type="checkbox"
              checked={formData.agreeToTerms}
              onChange={(e) =>
                setFormData({ ...formData, agreeToTerms: e.target.checked })
              }
              className="auth-checkbox"
            />
            <label
              htmlFor="agreeToTerms"
              className="text-sm text-secondary cursor-pointer"
            >
              I agree to the{" "}
              <Link
                href="/terms"
                className="auth-link"
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="auth-link"
              >
                Privacy Policy
              </Link>
            </label>
          </div>
          {fieldErrors.agreeToTerms && (
            <span className="auth-validation-error">
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
          className="auth-submit-btn"
        >
          {renderSubmitButtonContent()}
        </Button>
      </form>

      <div className="divider mt-3" />

      <p className="auth-footer-text">
        Already have an account?{" "}
        <Link
          href="/login"
          className="auth-footer-link"
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

  return (
    <div className="flex items-center justify-center p-6 auth-wrapper">
      {/* Realistic Abstract Background */}
      <div className="auth-bg-wrapper">
        <Image
          src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop"
          alt="Abstract Background"
          fill
          unoptimized
          className="auth-bg-image"
        />
        <div className="auth-bg-overlay" />
      </div>

      <div
        className={`card animate-fade-in-scale auth-card ${
          step === 1 ? "register-card-step1" : "register-card-step2"
        }`}
      >
        <div className="auth-logo-row">
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
          />
        )}
      </div >
    </div >
  );
}

interface EmailOtpFieldProps {
  readonly registration: ReturnType<typeof useRegistration>;
}

function EmailOtpField({ registration }: EmailOtpFieldProps) {
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
    <div className="auth-form-group">
      <label className="label" htmlFor="email">
        Email Address *
      </label>
      <div className="auth-otp-row">
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
          className={`flex-grow-220 ${emailOtpVerified ? "auth-input-verified" : ""}`}
          error={registration.fieldErrors?.email}
        />
        {!emailOtpVerified && (
          <Button
            id="send-email-otp"
            type="button"
            onClick={handleSendEmailOtp}
            disabled={emailOtpLoading || emailCooldown > 0}
            className="otp-button"
          >
            {getEmailOtpButtonText()}
          </Button>
        )}
      </div>

      {emailOtpVerified && (
        <div className="mt-2">
          <span className="verified-badge">Email Verified</span>
        </div>
      )}

      {emailOtpSent && !emailOtpVerified && (
        <div className="mt-2">
          <p className="auth-success-msg">
            OTP sent to {formData.email}
          </p>
          <div className="auth-otp-row">
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
              className="flex-grow-180 auth-input-otp"
            />
            <Button
              id="verify-email-otp"
              type="button"
              onClick={handleVerifyEmailOtp}
              disabled={emailOtpLoading || emailOtp.length !== 6}
              className="otp-button"
            >
              {emailOtpLoading ? "..." : "Verify"}
            </Button>
          </div>
          {emailOtpError && (
            <p className="auth-error-msg">
              {emailOtpError}
            </p>
          )}
        </div>
      )}

      {!emailOtpSent && emailOtpError && (
        <p className="auth-error-msg">
          {emailOtpError}
        </p>
      )}
    </div>
  );
}

interface PhoneOtpFieldProps {
  readonly registration: ReturnType<typeof useRegistration>;
}

function PhoneOtpField({ registration }: PhoneOtpFieldProps) {
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
    <div className="auth-form-group">
      <label className="label" htmlFor="phone">
        Phone Number *
      </label>
      <div className="auth-otp-row auth-phone-row">
        <span className="auth-input-phone-prefix">
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
          className={`flex-grow-160 ${phoneOtpVerified ? "auth-input-verified" : ""}`}
          error={registration.fieldErrors?.phone}
        />
        {!phoneOtpVerified && (
          <Button
            id="send-phone-otp"
            type="button"
            onClick={handleSendPhoneOtp}
            disabled={phoneOtpLoading || phoneCooldown > 0}
            className="otp-button"
          >
            {getPhoneOtpButtonText()}
          </Button>
        )}
      </div>

      {phoneOtpVerified && (
        <div className="mt-2">
          <span className="verified-badge">Phone Verified</span>
        </div>
      )}

      {phoneOtpSent && !phoneOtpVerified && (
        <div className="mt-2">
          <p className="auth-success-msg">
            OTP sent {formatOtpChannel(phoneOtpChannel)} to +91-{formData.phone}
          </p>
          <div className="auth-otp-row">
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
              className="flex-grow-180 auth-input-otp"
            />
            <Button
              id="verify-phone-otp"
              type="button"
              onClick={handleVerifyPhoneOtp}
              disabled={phoneOtpLoading || phoneOtp.length !== 6}
              className="otp-button"
            >
              {phoneOtpLoading ? "..." : "Verify"}
            </Button>
          </div>
          {phoneOtpError && (
            <p className="auth-error-msg">
              {phoneOtpError}
            </p>
          )}
        </div>
      )}

      {!phoneOtpSent && phoneOtpError && (
        <p className="auth-error-msg">
          {phoneOtpError}
        </p>
      )}
    </div>
  );
}
