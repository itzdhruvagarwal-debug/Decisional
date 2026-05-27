"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<
    "loading" | "success" | "error" | "already"
  >("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      Promise.resolve().then(() => {
        setStatus("error");
        setMessage("No verification token provided.");
      });
      return;
    }

    // Call the verify-email API
    fetch(`/api/auth/verify-email?token=${token}`, {
      method: "GET",
      redirect: "manual",
    })
      .then(async (res) => {
        if (res.status === 200 || res.type === "opaqueredirect") {
          setStatus("success");
          setMessage(
            "Your email has been verified successfully! You can now sign in.",
          );
          setTimeout(() => router.push("/login?verified=true"), 3000);
        } else {
          const data = await res
            .json()
            .catch(() => ({ error: "Verification failed" }));
          setStatus("error");
          setMessage(
            data.error || "Verification failed. The link may be expired.",
          );
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Network error. Please try again.");
      });
  }, [token, router]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-bg-primary, #0f172a)",
        padding: "24px",
      }}
    >
      <div
        style={{
          background: "var(--color-bg-secondary, #1e293b)",
          border: "1px solid var(--color-border, rgba(255,255,255,0.1))",
          borderRadius: "16px",
          padding: "48px",
          maxWidth: "440px",
          width: "100%",
          textAlign: "center",
        }}
      >
        {status === "loading" && (
          <>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>⏳</div>
            <h1
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: "#f1f5f9",
                marginBottom: "8px",
              }}
            >
              Verifying your email...
            </h1>
            <p style={{ color: "#94a3b8" }}>Please wait a moment.</p>
          </>
        )}

        {status === "success" && (
          <>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>✅</div>
            <h1
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: "#f1f5f9",
                marginBottom: "8px",
              }}
            >
              Email Verified!
            </h1>
            <p style={{ color: "#94a3b8", marginBottom: "24px" }}>{message}</p>
            <p style={{ color: "#64748b", fontSize: "14px" }}>
              Redirecting to login...
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>❌</div>
            <h1
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: "#f1f5f9",
                marginBottom: "8px",
              }}
            >
              Verification Failed
            </h1>
            <p style={{ color: "#94a3b8", marginBottom: "24px" }}>{message}</p>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              <Link
                href="/login"
                style={{
                  display: "block",
                  background: "#6366f1",
                  color: "white",
                  padding: "12px 24px",
                  borderRadius: "8px",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                Go to Login
              </Link>
              <Link
                href="/register"
                style={{
                  display: "block",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#94a3b8",
                  padding: "12px 24px",
                  borderRadius: "8px",
                  textDecoration: "none",
                  fontSize: "14px",
                }}
              >
                Create a new account
              </Link>
            </div>
          </>
        )}

        {status === "already" && (
          <>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>ℹ️</div>
            <h1
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: "#f1f5f9",
                marginBottom: "8px",
              }}
            >
              Already Verified
            </h1>
            <p style={{ color: "#94a3b8", marginBottom: "24px" }}>
              Your email is already verified. You can sign in below.
            </p>
            <Link
              href="/login"
              style={{
                display: "block",
                background: "#6366f1",
                color: "white",
                padding: "12px 24px",
                borderRadius: "8px",
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Sign In
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div>Loading verification...</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
