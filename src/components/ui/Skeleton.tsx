import React from "react";

export interface SkeletonProps {
  readonly width?: string | number;
  readonly height?: string | number;
  readonly borderRadius?: string | number;
  readonly className?: string;
  /** Render as a circle (e.g. avatar placeholder) */
  readonly circle?: boolean;
}

export function Skeleton({
  width,
  height,
  borderRadius,
  className = "",
  circle = false,
}: SkeletonProps) {
  const randomId = React.useId().replace(/:/g, "");
  const skeletonClass = `skeleton-${randomId}`;

  const styleContent = `
    .${skeletonClass} {
      ${width !== undefined ? `width: ${typeof width === "number" ? `${width}px` : width};` : ""}
      ${height !== undefined ? `height: ${typeof height === "number" ? `${height}px` : height};` : ""}
      ${circle ? "border-radius: 50%;" : borderRadius !== undefined ? `border-radius: ${typeof borderRadius === "number" ? `${borderRadius}px` : borderRadius};` : ""}
    }
  `.trim();

  return (
    <>
      <style>{styleContent}</style>
      <div
        className={`skeleton ${skeletonClass} ${className}`}
        aria-hidden="true"
      />
    </>
  );
}
