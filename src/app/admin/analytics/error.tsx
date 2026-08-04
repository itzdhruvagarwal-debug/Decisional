"use client";

import { logger } from "@/lib/logger-client";
import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function AdminAnalyticsError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  useEffect(() => {
    logger.error("Admin analytics error:", error);
  }, [error]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="admin-page flex flex-col items-center justify-center gap-5 text-primary min-h-60vh"
    >
      <div className="text-3xl" aria-hidden="true">⚠️</div>
      <h2 className="text-xl font-extrabold">Analytics failed to load</h2>
      <p className="text-secondary text-sm text-center max-w-400">
        Platform analytics could not be fetched. Check service connectivity and try again.
      </p>
      {error.digest && (
        <code className="text-xs text-muted font-mono">Ref: {error.digest}</code>
      )}
      <Button
        variant="primary"
        aria-label="Retry loading admin analytics"
        onClick={() => reset()}
      >
        Try again
      </Button>
    </div>
  );
}
