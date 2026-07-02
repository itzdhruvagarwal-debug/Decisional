"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console/monitoring service
    console.error("Root Application Error:", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "var(--color-bg-primary, #090d16)",
        color: "var(--color-text-primary, #ffffff)",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        className="card animate-fade-in"
        style={{
          maxWidth: "480px",
          width: "100%",
          padding: "40px 32px",
          textAlign: "center",
          borderRadius: "var(--radius-lg, 12px)",
          border: "1px solid var(--color-border, rgba(255,255,255,0.08))",
          background: "rgba(255, 255, 255, 0.02)",
          backdropFilter: "blur(8px)",
          boxShadow: "0 20px 40px -15px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            width: "64px",
            height: "64px",
            background: "rgba(244, 63, 94, 0.1)",
            color: "var(--color-accent-rose, #f43f5e)",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "32px",
            margin: "0 auto 24px",
            border: "1px solid rgba(244, 63, 94, 0.2)",
          }}
        >
          ⚠️
        </div>

        <h1
          style={{
            fontSize: "24px",
            fontWeight: 800,
            marginBottom: "12px",
            lineHeight: 1.3,
            color: "var(--color-text-primary, #ffffff)",
          }}
        >
          Application Exception
        </h1>

        <p
          style={{
            color: "var(--color-text-secondary, #94a3b8)",
            fontSize: "14px",
            lineHeight: 1.6,
            marginBottom: "28px",
          }}
        >
          An unexpected error occurred in this section of the platform.
          Please try to reload/retry or go back to the home page.
        </p>

        {error.digest && (
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              padding: "10px 14px",
              borderRadius: "var(--radius-sm, 6px)",
              fontFamily: "monospace",
              fontSize: "11px",
              color: "var(--color-text-muted, #64748b)",
              marginBottom: "28px",
              border: "1px solid var(--color-border, rgba(255,255,255,0.08))",
              wordBreak: "break-all",
            }}
          >
            Ref: {error.digest}
          </div>
        )}

        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={() => reset()}
            className="btn btn-primary"
            style={{
              flex: 1,
              background: "var(--color-primary, #6366f1)",
              border: "none",
              color: "#ffffff",
              padding: "12px 24px",
              borderRadius: "var(--radius-md, 8px)",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "transform 0.2s, opacity 0.2s",
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            Try Again
          </button>
          <Link
            href="/"
            className="btn btn-secondary"
            style={{
              flex: 1,
              background: "var(--color-bg-tertiary, #1e293b)",
              border: "1px solid var(--color-border, rgba(255,255,255,0.08))",
              color: "var(--color-text-primary, #ffffff)",
              padding: "12px 24px",
              borderRadius: "var(--radius-md, 8px)",
              fontSize: "14px",
              fontWeight: 600,
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            Return Home
          </Link>
        </div>
      </div>
    </div>
  );
}
