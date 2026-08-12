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

  let widthCss = "";
  if (width !== undefined) {
    widthCss = `width: ${typeof width === "number" ? `${width}px` : width};`;
  }

  let heightCss = "";
  if (height !== undefined) {
    heightCss = `height: ${typeof height === "number" ? `${height}px` : height};`;
  }

  let radiusCss = "";
  if (circle) {
    radiusCss = "border-radius: 50%;";
  } else if (borderRadius !== undefined) {
    radiusCss = `border-radius: ${typeof borderRadius === "number" ? `${borderRadius}px` : borderRadius};`;
  }

  const styleContent = `
.${skeletonClass} {
  ${widthCss}
  ${heightCss}
  ${radiusCss}
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
