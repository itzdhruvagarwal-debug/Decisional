"use client";

import { logger } from "@/lib/logger-client";
import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function AdminDisputesError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  useEffect(() => {
    logger.error("Admin disputes error:", error);
  }, [error]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="admin-page flex flex-col items-center justify-center gap-5 text-primary"
      style={{ minHeight: "60vh" }}
    >
      <div className="text-3xl" aria-hidden="true">⚠️</div>
      <h2 className="text-xl font-extrabold">Dispute queue failed to load</h2>
      <p className="text-secondary text-sm text-center" style={{ maxWidth: 400 }}>
        The dispute resolution queue could not be fetched. Check database connectivity and try again.
      </p>
      {error.digest && (
        <code className="text-xs text-muted font-mono">Ref: {error.digest}</code>
      )}
      <Button
        variant="primary"
        aria-label="Retry loading admin disputes"
        onClick={() => reset()}
      >
        Try again
      </Button>
    </div>
  );
}
