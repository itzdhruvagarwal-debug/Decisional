"use client";

import { logger } from "@/lib/logger-client";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function RootError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    // Log the error to console/monitoring service
    logger.error("Root Application Error:", error);
  }, [error]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-center justify-center p-6 min-h-screen"
    >
      <div
        className="card animate-fade-in text-center w-full border-card bg-glass backdrop-blur root-error-card"
      >
        <div
          className="flex items-center justify-center mb-6 bg-rose-subtle rounded-full text-3xl mx-auto text-rose icon-container-64 border-rose-subtle"
        >
          ⚠️
        </div>

        <h1 className="text-xl font-extrabold mb-3 text-primary">
          Application Exception
        </h1>

        <p className="text-sm text-secondary mb-6">
          An unexpected error occurred in this section of the platform.
          Please try to reload/retry or go back to the home page.
        </p>

        {error.digest && (
          <div
            className="text-xs text-muted mb-6 break-all px-3-py-2-5 font-mono bg-glass-light rounded-sm border-card"
          >
            Ref: {error.digest}
          </div>
        )}

        <div className="flex gap-3">
          <Button
            onClick={() => reset()}
            variant="primary"
            aria-label="Try rendering this page again"
            className="flex-1"
          >
            Try Again
          </Button>
          <Button
            href="/"
            variant="secondary"
            className="flex-1"
          >
            Return Home
          </Button>
        </div>
      </div>
    </div>
  );
}

