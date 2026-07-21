"use client";

import { logger } from "@/lib/logger-client";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function GlobalError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    // Log the error to an error reporting service
    logger.error(error);
  }, [error]);

  return (
    <html lang="en">
      <head>
        <title>System Error - Decisional</title>
      </head>
      <body
        className="flex items-center justify-center p-6"
        style={{
          background: "var(--color-bg-primary)",
          color: "var(--color-text-primary)",
          minHeight: "100vh",
          fontFamily: "'Inter', sans-serif"
        }}
      >
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

        <div className="glass col-span-2 text-center" style={{
          maxWidth: "500px",
          width: "100%",
          padding: "48px 32px",
          borderRadius: "var(--radius-xl)",
          border: "1px solid rgba(244, 63, 94, 0.2)",
          position: "relative",
          zIndex: 1
        }}>
          <div
            className="flex items-center justify-center mb-8"
            style={{
              width: "80px",
              height: "80px",
              background: "rgba(244, 63, 94, 0.1)",
              color: "var(--color-accent-rose)",
              borderRadius: "50%",
              fontSize: "40px",
              margin: "0 auto",
              border: "1px solid rgba(244, 63, 94, 0.2)",
              boxShadow: "0 0 30px rgba(244, 63, 94, 0.1)"
            }}
          >
            ⚠️
          </div>

          <h1 className="gradient-text text-xl font-extrabold mb-4" style={{
            background: "linear-gradient(135deg, #f43f5e, #fb923c)"
          }}>
            System Malfunction
          </h1>

          <p className="text-secondary text-sm mb-8">
            We've encountered a critical exception in the core engine.
            Our engineering team has been automatically alerted.
          </p>

          {error.digest && (
            <div className="text-xs text-muted mb-8" style={{
              background: "rgba(255,255,255,0.03)",
              padding: "12px",
              borderRadius: "var(--radius-md)",
              fontFamily: "monospace",
              border: "1px solid var(--color-border)"
            }}>
              Digest: {error.digest}
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={() => reset()}
              variant="danger"
              aria-label="Restart Session"
              style={{ flex: 1, boxShadow: "0 0 20px rgba(244, 63, 94, 0.2)" }}
            >
              🔄 Restart Session
            </Button>
            <Button
              href="/"
              variant="secondary"
              style={{ flex: 1 }}
            >
              🏠 Return Home
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
