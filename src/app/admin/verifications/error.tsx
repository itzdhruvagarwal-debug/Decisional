"use client";
import { logger } from "@/lib/logger-client";
import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function AdminVerificationsError({
  error,
  reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  useEffect(() => { logger.error("Admin verifications error:", error); }, [error]);
  return (
    <div role="alert" aria-live="assertive" className="admin-page flex flex-col items-center justify-center gap-5 min-h-60vh">
      <div className="text-3xl" aria-hidden="true">⚠️</div>
      <h2 className="text-xl font-extrabold">Verifications failed to load</h2>
      <p className="text-secondary text-sm text-center max-w-400">Verification queue could not be fetched. Try again.</p>
      {error.digest && <code className="text-xs text-muted font-mono">Ref: {error.digest}</code>}
      <Button variant="primary" aria-label="Retry loading verifications" onClick={() => reset()}>Try again</Button>
    </div>
  );
}
