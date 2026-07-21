"use client";


import { logger } from "@/lib/logger-client";
import Link from "next/link";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? null;

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  const validatePassword = (value: string): string | null => {
    if (value.length < 8) return "Password must be at least 8 characters";
    if (!/[A-Z]/.test(value)) return "Password must contain an uppercase letter";
    if (!/[a-z]/.test(value)) return "Password must contain a lowercase letter";
    if (!/\d/.test(value)) return "Password must contain a number";
    if (!/[^A-Za-z0-9]/.test(value)) {
      return "Password must contain a special character";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setStatus("error");
      setMessage("Passwords do not match");
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setStatus("error");
      setMessage(passwordError);
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", token, newPassword: password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "Failed to reset password");
      } else {
        setStatus("success");
        setMessage("Password reset successful! Redirecting to login...");
        setTimeout(() => router.push("/login"), 2000);
      }
    } catch (err: unknown) {
      logger.error("[reset-password] submission error:", err);
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  };

  if (!token) {
    return (
      <div className="text-center">
        <h1 className="text-xl font-bold mb-4">Invalid Link</h1>
        <p className="mb-4 text-secondary text-sm">
          This password reset link is invalid or missing a token.
        </p>
        <Link
          href="/forgot-password"
          className="font-semibold"
          style={{ color: "var(--color-primary-light)" }}
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full">
      <h1 className="text-xl font-extrabold mb-2">
        Set New Password
      </h1>
      <p className="text-secondary text-sm mb-8">
        Enter a strong password for your account
      </p>

      {message && (
        <div
          role={status === "error" ? "alert" : "status"}
          aria-live={status === "error" ? "assertive" : "polite"}
          className="text-sm mb-6"
          style={{
            padding: "12px 16px",
            borderRadius: "var(--radius-md)",
            background:
              status === "success"
                ? "rgba(16, 185, 129, 0.1)"
                : "rgba(244, 63, 94, 0.1)",
            border: `1px solid ${status === "success" ? "var(--color-accent-emerald)" : "var(--color-accent-rose)"}`,
            color:
              status === "success"
                ? "var(--color-accent-emerald)"
                : "var(--color-accent-rose)",
          }}
        >
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <Input
            id="password"
            type="password"
            label="New Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Min 8 chars, mixed case & symbols"
            fullWidth
          />
        </div>

        <div className="mb-6">
          <Input
            id="confirmPassword"
            type="password"
            label="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            placeholder="Re-enter password"
            fullWidth
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          disabled={status === "loading" || status === "success"}
          loading={status === "loading"}
          fullWidth
        >
          Reset Password
        </Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div
      className="flex items-center justify-center p-6"
      style={{
        minHeight: "100vh",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background Effects */}
      <div
        style={{
          position: "absolute",
          top: "20%",
          right: "10%",
          width: "400px",
          height: "400px",
          background:
            "radial-gradient(circle, rgba(99, 102, 241, 0.2) 0%, transparent 70%)",
          borderRadius: "50%",
          filter: "blur(80px)",
        }}
      />
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: "420px",
          padding: "40px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <Suspense fallback={<div>Loading...</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}

