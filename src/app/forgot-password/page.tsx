"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ForgotPasswordPage() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const [resetLink, setResetLink] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    } catch (_err) {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background Effects (Same as Login) */}
      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "10%",
          width: "400px",
          height: "400px",
          background:
            "radial-gradient(circle, rgba(99, 102, 241, 0.2) 0%, transparent 70%)",
          borderRadius: "50%",
          filter: "blur(80px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "20%",
          right: "10%",
          width: "350px",
          height: "350px",
          background:
            "radial-gradient(circle, rgba(236, 72, 153, 0.2) 0%, transparent 70%)",
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
        <Link
          href="/login"
          style={{
            display: "block",
            marginBottom: "24px",
            color: "var(--color-text-secondary)",
            fontSize: "14px",
          }}
        >
          ← Back to Login
        </Link>

        <h1
          style={{
            fontSize: "24px",
            fontWeight: 800,
            marginBottom: "8px",
          }}
        >
          Forgot Password?
        </h1>
        <p
          style={{
            color: "var(--color-text-secondary)",
            marginBottom: "24px",
            fontSize: "14px",
          }}
        >
          Enter your email to receive a reset link
        </p>

        {message && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: "var(--radius-md)",
              fontSize: "14px",
              marginBottom: "24px",
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

        {resetLink && (
          <div
            style={{
              marginBottom: "24px",
              padding: "12px",
              background: "#f3f4f6",
              borderRadius: "var(--radius-md)",
              wordBreak: "break-all",
              fontSize: "12px",
              border: "1px dashed #ccc",
            }}
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
          <div style={{ marginBottom: "24px" }}>
            <label className="label" htmlFor="email">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={status === "loading"}
            style={{ width: "100%", padding: "14px" }}
          >
            {status === "loading" ? "Sending..." : "Send Reset Link"}
          </button>
        </form>
      </div>
    </div>
  );
}
