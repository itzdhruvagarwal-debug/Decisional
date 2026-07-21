import React from "react";

export type SpinnerSize = "sm" | "md" | "lg";

export interface SpinnerProps {
  readonly size?: SpinnerSize;
  readonly className?: string;
  readonly style?: React.CSSProperties;
  readonly "aria-label"?: string;
}

const sizeStyle: Record<SpinnerSize, React.CSSProperties> = {
  sm: { width: "14px", height: "14px" },
  md: { width: "20px", height: "20px" },
  lg: { width: "32px", height: "32px" },
};

export function Spinner({
  size = "md",
  className = "",
  style,
  "aria-label": ariaLabel = "Loading",
}: SpinnerProps) {
  return (
    <span
      className={`loading ${className}`}
      style={{ ...sizeStyle[size], ...style }}
      role="status"
      aria-label={ariaLabel}
    />
  );
}
