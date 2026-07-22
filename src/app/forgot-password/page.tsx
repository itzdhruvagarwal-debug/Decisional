"use client";


import { logger } from "@/lib/logger-client";
import Link from "next/link";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const [resetLink, setResetLink] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setResetLink("");

    const validation = z.string().email("Please enter a valid email address").safeParse(email.trim());
    if (!validation.success) {
      setStatus("error");
      setMessage(validation.error.issues[0]?.message || "Invalid email address");
      return;
    }

    setStatus("loading");
    setMessage("");
    setResetLink("");

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "Something went wrong");
      } else {
        setStatus("success");
        setMessage(
          data.message || "If an account exists, a reset link has been sent.",
        );
        if (data.resetLink) {
          setResetLink(data.resetLink);
        }
      }
    } catch (err: unknown) {
      logger.error("[forgot-password] reset request error:", err);
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  };

  return (
    <div
      className="flex items-center justify-center p-6 relative overflow-hidden" style={{ minHeight: "100vh" }}
    >
      {/* Background Effects (Same as Login) */}
      <div
        className="absolute rounded-full" style={{ top: "20%", left: "10%", width: "400px", height: "400px", background:
            "radial-gradient(circle, rgba(99, 102, 241, 0.2) 0%, transparent 70%)", filter: "blur(80px)" }}
      />
      <div
        className="absolute rounded-full" style={{ bottom: "20%", right: "10%", width: "350px", height: "350px", background:
            "radial-gradient(circle, rgba(236, 72, 153, 0.2) 0%, transparent 70%)", filter: "blur(80px)" }}
      />

      <div
        className="card w-full relative p-10" style={{ maxWidth: "420px", zIndex: 1 }}
      >
        <Link
          href="/login"
          className="text-sm text-secondary mb-6 flex"
        >
          ← Back to Login
        </Link>

        <h1 className="text-xl font-extrabold mb-2">
          Forgot Password?
        </h1>
        <p className="text-secondary text-sm mb-6">
          Enter your email to receive a reset link
        </p>

        {message && (
          <div
            role={status === "error" ? "alert" : "status"}
            aria-live={status === "error" ? "assertive" : "polite"}
            className="text-sm mb-6 rounded-md" style={{ padding: "12px 16px", background:
                status === "success"
                  ? "rgba(16, 185, 129, 0.1)"
                  : "rgba(244, 63, 94, 0.1)", border: `1px solid ${status === "success" ? "var(--color-accent-emerald)" : "var(--color-accent-rose)"}`, color:
                status === "success"
                  ? "var(--color-accent-emerald)"
                  : "var(--color-accent-rose)" }}
          >
            {message}
          </div>
        )}

        {resetLink && (
          <div
            className="mb-6 p-3 text-xs rounded-md" style={{ background: "#f3f4f6", wordBreak: "break-all", border: "1px dashed #ccc" }}
          >
            <strong>DEV LINK:</strong>{" "}
            <a
              href={resetLink}
              style={{ color: "blue", textDecoration: "underline" }}
            >
              {resetLink}
            </a>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <Input
              id="email"
              type="email"
              label="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              fullWidth
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={status === "loading"}
            loading={status === "loading"}
            fullWidth
          >
            Send Reset Link
          </Button>
        </form>
      </div>
    </div>
  );
}

