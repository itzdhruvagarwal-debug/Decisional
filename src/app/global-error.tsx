"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <head>
        <title>System Error - Decisional</title>
      </head>
      <body style={{
        background: "var(--color-bg-primary)",
        color: "var(--color-text-primary)",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "'Inter', sans-serif"
      }}>
        {/* Abstract Background Elements */}
        <div style={{
          position: "fixed",
          top: "10%",
          left: "5%",
          width: "400px",
          height: "400px",
          background: "radial-gradient(circle, rgba(244, 63, 94, 0.08) 0%, transparent 70%)",
          zIndex: 0
        }} />

        <div className="glass col-span-2" style={{
          maxWidth: "500px",
          width: "100%",
          padding: "48px 32px",
          textAlign: "center",
          borderRadius: "var(--radius-xl)",
          border: "1px solid rgba(244, 63, 94, 0.2)",
          position: "relative",
          zIndex: 1
        }}>
          <div style={{
            width: "80px",
            height: "80px",
            background: "rgba(244, 63, 94, 0.1)",
            color: "var(--color-accent-rose)",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "40px",
            margin: "0 auto 32px",
            border: "1px solid rgba(244, 63, 94, 0.2)",
            boxShadow: "0 0 30px rgba(244, 63, 94, 0.1)"
          }}>
            ⚠️
          </div>

          <h1 className="gradient-text" style={{
            fontSize: "28px",
            fontWeight: 900,
            marginBottom: "16px",
            background: "linear-gradient(135deg, #f43f5e, #fb923c)"
          }}>
            System Malfunction
          </h1>

          <p style={{
            color: "var(--color-text-secondary)",
            fontSize: "15px",
            lineHeight: 1.6,
            marginBottom: "32px"
          }}>
            We've encountered a critical exception in the core engine.
            Our engineering team has been automatically alerted.
          </p>

          {error.digest && (
            <div style={{
              background: "rgba(255,255,255,0.03)",
              padding: "12px",
              borderRadius: "var(--radius-md)",
              fontFamily: "monospace",
              fontSize: "12px",
              color: "var(--color-text-muted)",
              marginBottom: "32px",
              border: "1px solid var(--color-border)"
            }}>
              Digest: {error.digest}
            </div>
          )}

          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={() => reset()}
              className="btn btn-primary"
              style={{ flex: 1, background: "var(--color-accent-rose)", boxShadow: "0 0 20px rgba(244, 63, 94, 0.2)" }}
            >
              🔄 Cold Reboot
            </button>
            <Link
              href="/"
              className="btn btn-secondary"
              style={{ flex: 1 }}
            >
              🏠 Return Home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}

