"use client";

import Link from "next/link";
import Logo from "../../components/Logo";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getProviders, signIn } from "next-auth/react";

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
      <LoginContent />
    </Suspense>
  );
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
  const sessionMessage =
    registered
      ? "Account created successfully. Please sign in to continue."
      : reason === "inactivity"
      ? "You were signed out due to inactivity."
      : reason === "session_revoked"
        ? "Your session was terminated because you signed in on another device."
        : reason === "token_expired"
          ? "Your session expired. Please sign in again."
          : reason === "session_expired"
            ? "Your session expired. Please sign in again."
            : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Client-side validation
    if (!formData.email.trim() || !formData.email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!show2FA && formData.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (show2FA && formData.twoFactorCode.length !== 6) {
      setError("Please enter a valid 6-digit 2FA code.");
      return;
    }

    // Client-side lockout: warn after 3 failed attempts
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

      if (result?.error) {
        if (result.error === "2FA_REQUIRED") {
          setShow2FA(true);
          setError(""); // Clear errors, just show prompt
          return;
        }

        if (result.error === "INVALID_2FA") {
          setError("Invalid 2FA Code. Please try again.");
          return;
        }

        // Handle specific server-side errors
        const errorStr = String(result.error);

        if (errorStr.includes("USER_NOT_REGISTERED_ERROR_CODE")) {
          setError("User not found. This email is not registered. Please sign up first.");
          return;
        }

        // Broad fallback for Auth.js obfuscation
        if (errorStr.includes("CredentialsSignin") || errorStr.includes("Readonly")) {
          setError("This email is not registered. Please sign up or check your credentials.");
          return;
        }

        setAttemptCount((prev) => prev + 1);
        const remaining = 5 - (attemptCount + 1);
        setError(
          remaining > 0
            ? `Invalid password. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`
            : "Account temporarily locked due to too many failed attempts.",
        );
      } else {
        // Clear attempt counter on success (stored in component state only)
        setAttemptCount(0);

        // Try soft router navigation first
        router.push(callbackUrl);
        router.refresh();
      }
    } catch (err: any) {
      const errorMsg = err?.message || err?.name || String(err);
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
      console.error("[Login] signIn error:", err);
    } finally {
      setIsLoading(false);
    }
  };

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
        <img
          src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop"
          alt="Abstract Background"
          style={{
            width: "100%",
            height: "100%",
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
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: "32px",
          }}
        >
          <Logo />
        </div>

        <h1
          style={{
            fontSize: "26px",
            fontWeight: 800,
            textAlign: "center",
            marginBottom: "8px",
            letterSpacing: 0,
          }}
        >
          Welcome Back
        </h1>
        <p
          style={{
            textAlign: "center",
            color: "var(--color-text-secondary)",
            marginBottom: "28px",
            fontSize: "14px",
          }}
        >
          Sign in to continue to your dashboard
        </p>

        {/* Session expiry reason banner */}
        {sessionMessage && (
          <div
            style={{
              padding: "12px 16px",
              background: "rgba(99, 102, 241, 0.08)",
              border: "1px solid rgba(99, 102, 241, 0.25)",
              borderRadius: "var(--radius-md)",
              color: "var(--color-primary-light)",
              fontSize: "13px",
              marginBottom: "16px",
              textAlign: "center",
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
            style={{
              padding: "12px 16px",
              background: "rgba(244, 63, 94, 0.08)",
              border: "1px solid rgba(244, 63, 94, 0.3)",
              borderRadius: "var(--radius-md)",
              color: "var(--color-accent-rose)",
              fontSize: "14px",
              marginBottom: "24px",
              textAlign: "center",
              animation: "slideDown 0.3s ease-out",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "20px" }}>
            <label className="label" htmlFor="email">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              className="input"
              placeholder="you@example.com"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              required
              autoComplete="email"
            />
          </div>

          <div style={{ marginBottom: "28px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              <label
                className="label"
                htmlFor="password"
                style={{ marginBottom: 0 }}
              >
                Password
              </label>
              <Link
                href="/forgot-password"
                style={{
                  fontSize: "12px",
                  color: "var(--color-primary-light)",
                  fontWeight: 500,
                }}
              >
                Forgot password?
              </Link>
            </div>
            <div style={{ position: "relative" }}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                className="input"
                placeholder="********"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                required
                autoComplete="current-password"
              />
              <button
                type="button"
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
              </button>
            </div>
          </div>

          {show2FA && (
            <div
              style={{
                marginBottom: "28px",
                animation: "slideDown 0.3s ease-out",
              }}
            >
              <label
                className="label"
                htmlFor="twoFactorCode"
                style={{ marginBottom: "8px" }}
              >
                Authenticator App Code (2FA)
              </label>
              <input
                id="twoFactorCode"
                type="text"
                className="input"
                placeholder="Enter 6-digit code"
                value={formData.twoFactorCode}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    twoFactorCode: e.target.value.replace(/[^0-9]/g, ""),
                  })
                }
                maxLength={6}
                required
                autoComplete="off"
              />
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading}
            style={{
              width: "100%",
              padding: "14px",
              fontSize: "15px",
              marginBottom: "24px",
            }}
          >
            {isLoading ? <span className="loading" /> : "Sign In"}
          </button>
        </form>

        {googleSignInEnabled && (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                margin: "24px 0",
                color: "var(--color-text-muted)",
                fontSize: "14px",
              }}
            >
              <div
                style={{ flex: 1, borderBottom: "1px solid var(--color-border)" }}
              />
              <span style={{ padding: "0 16px" }}>or continue with</span>
              <div
                style={{ flex: 1, borderBottom: "1px solid var(--color-border)" }}
              />
            </div>

            <button
              type="button"
              onClick={() => signIn("google", { callbackUrl })}
              style={{
                width: "100%",
                padding: "14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "12px",
                background: "#fff",
                color: "#333",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                fontSize: "15px",
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.2s ease",
                marginBottom: "24px",
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = "#f9fafb")}
              onMouseOut={(e) => (e.currentTarget.style.background = "#fff")}
            >
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
              Sign in with Google
            </button>
          </>
        )}

        <div className="divider" style={{ marginTop: 0 }} />

        <p
          style={{
            textAlign: "center",
            color: "var(--color-text-secondary)",
            fontSize: "14px",
          }}
        >
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            style={{
              color: "var(--color-primary-light)",
              fontWeight: 600,
            }}
          >
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}
