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
        <div className="fixed" style={{ top: "10%", left: "5%", width: "400px", height: "400px", background: "radial-gradient(circle, rgba(244, 63, 94, 0.08) 0%, transparent 70%)", zIndex: 0 }} />

        <div className="glass col-span-2 text-center w-full relative rounded-xl" style={{ maxWidth: "500px", padding: "48px 32px", border: "1px solid rgba(244, 63, 94, 0.2)", zIndex: 1 }}>
          <div
            className="flex items-center justify-center mb-8 bg-rose-subtle text-rose rounded-full text-3xl" style={{ width: "80px", height: "80px", margin: "0 auto", border: "1px solid rgba(244, 63, 94, 0.2)", boxShadow: "0 0 30px rgba(244, 63, 94, 0.1)" }}
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
            <div className="text-xs text-muted mb-8 p-3 rounded-md border-card" style={{ background: "rgba(255,255,255,0.03)", fontFamily: "monospace" }}>
              Digest: {error.digest}
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={() => reset()}
              variant="danger"
              aria-label="Restart Session"
              className="flex-1" style={{ boxShadow: "0 0 20px rgba(244, 63, 94, 0.2)" }}
            >
              🔄 Restart Session
            </Button>
            <Button
              href="/"
              variant="secondary"
              className="flex-1"
            >
              🏠 Return Home
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
