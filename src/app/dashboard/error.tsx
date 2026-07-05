"use client";

import { useEffect } from "react";

interface DashboardErrorProps {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}

export default function DashboardError({
  error,
  reset,
}: DashboardErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
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
      <button
        onClick={
          // Attempt to recover by trying to re-render the segment
          () => reset()
        }
        style={{
          background: "var(--color-primary)",
          color: "white",
          padding: "12px 24px",
          borderRadius: "8px",
          border: "none",
          fontSize: "16px",
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}
