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
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        flexDirection: "column",
        gap: "24px",
        background: "var(--color-bg-primary)",
        color: "var(--color-text-primary)",
      }}
    >
      <h2>Something went wrong!</h2>
      <Button
        variant="primary"
        aria-label="Try rendering the dashboard again"
        onClick={
          // Attempt to recover by trying to re-render the segment
          () => reset()
        }
        style={{
          padding: "12px 24px",
          borderRadius: "8px",
          fontSize: "16px",
        }}
      >
        Try again
      </Button>
    </div>
  );
}
