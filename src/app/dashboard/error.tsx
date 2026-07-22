"use client";


import { logger } from "@/lib/logger-client";
import { useEffect } from "react";
import { Button } from "@/components/ui";

interface DashboardErrorProps {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}

export default function DashboardError({
  error,
  reset,
}: DashboardErrorProps) {
  useEffect(() => {
    logger.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex justify-center items-center flex-col gap-6" style={{ height: "100vh", background: "var(--color-bg-primary)", color: "var(--color-text-primary)" }}
    >
      <h2>Something went wrong!</h2>
      <Button
        variant="primary"
        aria-label="Try rendering the dashboard again"
        onClick={
          // Attempt to recover by trying to re-render the segment
          () => reset()
        }
        className="text-base rounded-md" style={{ padding: "12px 24px" }}
      >
        Try again
      </Button>
    </div>
  );
}
