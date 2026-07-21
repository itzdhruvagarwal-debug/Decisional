"use client";


import { logger } from "@/lib/logger-client";
import Link from "next/link";
import Image from "next/image";
import { loginSchema } from "@/lib/validations/auth";
import Logo from "../../components/Logo";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getProviders, signIn, type SignInResponse } from "next-auth/react";

function resolveSafeCallbackUrl(rawCallbackUrl: string | null | undefined): string {
  if (!rawCallbackUrl) return "/dashboard";
  if (rawCallbackUrl.startsWith("//")) return "/dashboard";
  if (rawCallbackUrl.startsWith("/") && !rawCallbackUrl.startsWith("//")) {
    return rawCallbackUrl;
  }
  if (typeof window === "undefined") return "/dashboard";

  try {
    const parsed = new URL(rawCallbackUrl, window.location.origin);
    if (parsed.origin !== window.location.origin) return "/dashboard";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/dashboard";
  }
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex items-center justify-center"
          style={{ minHeight: "100vh" }}
        >
          <span className="loading" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}

function getSessionMessage(registered: boolean, reason: string | null): string | null {
  if (registered) return "Account created successfully. Please sign in to continue.";
  if (reason === "inactivity") return "You were signed out due to inactivity.";
  if (reason === "session_revoked") return "Your session was terminated because you signed in on another device.";
  if (reason === "token_expired") return "Your session expired. Please sign in again.";
  if (reason === "session_expired") return "Your session expired. Please sign in again.";
  return null;
}

function validateLoginForm(formData: { email: string; password: string; twoFactorCode: string }, show2FA: boolean): string | null {
  if (!formData.email.trim() || !formData.email.includes("@")) {
    return "Please enter a valid email address.";
  }
  if (!show2FA && formData.password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (show2FA && formData.twoFactorCode.length !== 6) {
    return "Please enter a valid 6-digit 2FA code.";
  }
  return null;
}

function handleSignInResult(
  result: SignInResponse | undefined,
  attemptCount: number,
  setAttemptCount: React.Dispatch<React.SetStateAction<number>>,
  setShow2FA: (val: boolean) => void
): { error: string | null; success: boolean } {
  if (!result?.error) {
    return { error: null, success: true };
  }
  if (result.error === "2FA_REQUIRED") {
    setShow2FA(true);
    return { error: null, success: false };
  }
  if (result.error === "INVALID_2FA") {
    return { error: "Invalid 2FA Code. Please try again.", success: false };
  }
  const errorStr = String(result.error);
  if (errorStr.includes("CredentialsSignin") || errorStr.includes("Readonly")) {
    return { error: "Invalid email or password. Please try again.", success: false };
  }
  setAttemptCount((prev) => prev + 1);
  const remaining = 5 - (attemptCount + 1);
  const attemptsPlural = remaining !== 1 ? "s" : "";
  const errorMsg = remaining > 0
    ? `Invalid email or password. ${remaining} attempt${attemptsPlural} remaining.`
    : "Account temporarily locked due to too many failed attempts.";
  return { error: errorMsg, success: false };
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = resolveSafeCallbackUrl(searchParams?.get("callbackUrl"));
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    twoFactorCode: "",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [show2FA, setShow2FA] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [googleSignInEnabled, setGoogleSignInEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    getProviders()
      .then((providers) => {
        if (active) setGoogleSignInEnabled(Boolean(providers?.google));
      })
      .catch(() => {
        if (active) setGoogleSignInEnabled(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Show contextual messages from session events
  const reason = searchParams?.get("reason");
  const registered = searchParams?.get("registered") === "true";
  const sessionMessage = getSessionMessage(registered, reason);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const validationError = validateLoginForm(formData, show2FA);
    if (validationError) {
      setError(validationError);
      return;
    }

    // Client-side Zod Validation
    const validation = loginSchema.safeParse({
      email: formData.email.trim(),
      password: formData.password,
      twoFactorCode: show2FA ? formData.twoFactorCode : "",
    });

    if (!validation.success) {
      const firstIssue = validation.error.issues[0];
      setError(firstIssue?.message || "Invalid input details.");
      return;
    }

    // Client-side lockout: warn after 5 failed attempts
    if (attemptCount >= 5) {
      setError(
        "Too many failed attempts. Please wait a few minutes before trying again.",
      );
      return;
    }

    setIsLoading(true);

    try {
      const result = await signIn("credentials", {
        email: formData.email.toLowerCase().trim(),
        password: formData.password,
        twoFactorCode: show2FA ? formData.twoFactorCode : "",
        redirect: false,
      });

      const processRes = handleSignInResult(result, attemptCount, setAttemptCount, setShow2FA);
      if (processRes.error) {
        setError(processRes.error);
      } else if (processRes.success) {
        // Clear attempt counter on success (stored in component state only)
        setAttemptCount(0);
        // Try soft router navigation first
        router.push(callbackUrl);
        router.refresh();
      }
    } catch (err: unknown) {
      const errorMsg = (err instanceof Error ? err.message : String(err)) || (err instanceof Error ? err.name : 'Error') || String(err);
      const isExtensionBlock =
        errorMsg.toLowerCase().includes("clientfetcherror") ||
        errorMsg.toLowerCase().includes("failed to fetch") ||
        errorMsg.toLowerCase().includes("frame_ant");

      if (isExtensionBlock) {
        // Enterprise Graceful Degradation:
        // The backend successfully set the HTTP-only session cookie, but a browser extension 
        // crashed the client-side NextAuth 'fetch' that verifies the session state.
        // Bypassing the client router and forcing a hard navigation resolves this seamlessly.
        window.location.href = callbackUrl;
        return;
      }

      setError("A network error occurred. Please check your connection.");
      logger.error("[Login] signIn error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="flex items-center justify-center p-6"
      style={{
        minHeight: "100vh",
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
          width: "min(100%, 420px)",
          maxWidth: "calc(100vw - 32px)",
          minWidth: 0,
          padding: "clamp(24px, 4vw, 40px)",
          position: "relative",
          zIndex: 1,
          border: "1px solid var(--color-border)",
        }}
      >
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <Logo />
        </div>

        <h1 className="text-xl font-extrabold text-center mb-2">
          Welcome Back
        </h1>
        <p className="text-center text-secondary mb-6 text-sm">
          Sign in to continue to your dashboard
        </p>

        {/* Session expiry reason banner */}
        {sessionMessage && (
          <div
            className="text-center text-primary text-sm mb-4"
            style={{
              padding: "12px 16px",
              background: "rgba(99, 102, 241, 0.08)",
              border: "1px solid rgba(99, 102, 241, 0.25)",
              borderRadius: "var(--radius-md)",
              lineHeight: 1.5,
            }}
          >
            {sessionMessage}
          </div>
        )}

        {error && (
          <div
            role="alert"
            aria-live="polite"
            className="text-center mb-6"
            style={{
              padding: "12px 16px",
              background: "rgba(244, 63, 94, 0.08)",
              border: "1px solid rgba(244, 63, 94, 0.3)",
              borderRadius: "var(--radius-md)",
              color: "var(--color-accent-rose)",
              fontSize: "14px",
              animation: "slideDown 0.3s ease-out",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <Input
              id="email"
              type="email"
              label="Email Address"
              placeholder="you@example.com"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              required
              autoComplete="email"
              fullWidth
            />
          </div>

          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <label
                className="label"
                htmlFor="password"
                style={{ marginBottom: 0 }}
              >
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs font-semibold"
                style={{ color: "var(--color-primary-light)" }}
              >
                Forgot password?
              </Link>
            </div>
            <div style={{ position: "relative" }}>
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="********"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                required
                autoComplete="current-password"
                fullWidth
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "0",
                  cursor: "pointer",
                  color: "var(--color-primary-light)",
                  fontSize: "12px",
                  fontWeight: 700,
                  zIndex: 10,
                }}
              >
                {showPassword ? "Hide" : "Show"}
              </Button>
            </div>
          </div>

          {show2FA && (
            <div
              className="mb-6"
              style={{ animation: "slideDown 0.3s ease-out" }}
            >
              <Input
                id="twoFactorCode"
                type="text"
                label="Authenticator App Code (2FA)"
                placeholder="Enter 6-digit code"
                value={formData.twoFactorCode}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    twoFactorCode: e.target.value.replace(/\D/g, ""),
                  })
                }
                maxLength={6}
                required
                autoComplete="off"
                fullWidth
              />
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={isLoading}
            loading={isLoading}
            fullWidth
            style={{ marginBottom: "24px" }}
          >
            Sign In
          </Button>
        </form>

        {googleSignInEnabled && (
          <>
            <div
              className="flex items-center text-muted text-sm"
              style={{ margin: "24px 0" }}
            >
              <div
                style={{ flex: 1, borderBottom: "1px solid var(--color-border)" }}
              />
              <span style={{ padding: "0 16px" }}>or continue with</span>
              <div
                style={{ flex: 1, borderBottom: "1px solid var(--color-border)" }}
              />
            </div>

            <Button
              variant="secondary"
              onClick={() => signIn("google", { callbackUrl })}
              fullWidth
              style={{
                background: "#fff",
                color: "#333",
                marginBottom: "24px",
                gap: "12px",
              }}
              leftIcon={
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              }
            >
              Sign in with Google
            </Button>
          </>
        )}

        <div className="divider" style={{ marginTop: 0 }} />

        <p className="text-center text-secondary text-sm">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-semibold"
            style={{ color: "var(--color-primary-light)" }}
          >
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}

