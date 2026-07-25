"use client";

import { logger } from "@/lib/logger-client";
import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function WalletError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  useEffect(() => {
    logger.error("Wallet page error:", error);
  }, [error]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex flex-col items-center justify-center gap-5 text-primary flex-1"
      style={{ minHeight: "60vh" }}
    >
      <div className="text-3xl" aria-hidden="true">⚠️</div>
      <h2 className="text-xl font-extrabold">Wallet failed to load</h2>
      <p className="text-secondary text-sm text-center" style={{ maxWidth: 380 }}>
        Your wallet data could not be fetched. Please try again.
      </p>
      {error.digest && (
        <code className="text-xs text-muted font-mono">Ref: {error.digest}</code>
      )}
      <Button variant="primary" aria-label="Retry loading wallet" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
