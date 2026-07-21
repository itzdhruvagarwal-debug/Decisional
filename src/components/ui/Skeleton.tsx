import React from "react";

export interface SkeletonProps {
  readonly width?: string | number;
  readonly height?: string | number;
  readonly borderRadius?: string | number;
  readonly className?: string;
  readonly style?: React.CSSProperties;
  /** Render as a circle (e.g. avatar placeholder) */
  readonly circle?: boolean;
}

export function Skeleton({
  width,
  height,
  borderRadius,
  className = "",
  style,
  circle = false,
}: SkeletonProps) {
  const computedStyle: React.CSSProperties = {
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(borderRadius !== undefined ? { borderRadius } : {}),
    ...(circle ? { borderRadius: "50%" } : {}),
    ...style,
  };

  return (
    <div
      className={`skeleton ${className}`}
      style={computedStyle}
      aria-hidden="true"
    />
  );
}
