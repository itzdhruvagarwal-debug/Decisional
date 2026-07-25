"use client";

import { logger } from "@/lib/logger-client";
import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function CampaignsError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  useEffect(() => {
    logger.error("Campaigns page error:", error);
  }, [error]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-col items-center justify-center gap-5 text-primary flex-1"
      style={{ minHeight: "60vh" }}
    >
      <div className="text-3xl" aria-hidden="true">⚠️</div>
      <h2 className="text-xl font-extrabold">Campaigns failed to load</h2>
      <p className="text-secondary text-sm text-center" style={{ maxWidth: 380 }}>
        Something went wrong while loading your campaigns. Please try again.
      </p>
      {error.digest && (
        <code className="text-xs text-muted font-mono">Ref: {error.digest}</code>
      )}
      <Button variant="primary" aria-label="Retry loading campaigns" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
