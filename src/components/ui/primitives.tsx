import React from "react";
import Image from "next/image";

// ==========================================
// 1. AVATAR
// ==========================================
export type AvatarSize = "sm" | "md" | "lg" | "xl";

export interface AvatarProps {
  readonly name?: string | null;
  readonly src?: string | null;
  readonly size?: AvatarSize;
  readonly className?: string;
  readonly "aria-hidden"?: boolean;
}

const avatarSizeClass: Record<AvatarSize, string> = {
  sm: "avatar-sm",
  md: "",
  lg: "avatar-lg",
  xl: "avatar-xl",
};

export function Avatar({
  name,
  src,
  size = "md",
  className = "",
  "aria-hidden": ariaHidden,
}: AvatarProps) {
  const initial = name ? (name[0]?.toUpperCase() ?? "U") : "U";
  const classes = `avatar ${avatarSizeClass[size]} ${className}`.trim();

  return (
    <div className={classes} aria-hidden={ariaHidden}>
      {src ? (
        <Image src={src} alt={name ?? "Avatar"} fill className="object-cover" />
      ) : (
        initial
      )}
    </div>
  );
}

// ==========================================
// 2. BADGE
// ==========================================
export type BadgeVariant = "primary" | "success" | "warning" | "danger" | "ghost";

export interface BadgeProps {
  readonly children: React.ReactNode;
  readonly variant?: BadgeVariant;
  readonly className?: string;
  readonly id?: string;
}

export function Badge({
  children,
  variant = "primary",
  className = "",
  id,
}: BadgeProps) {
  return (
    <span
      id={id}
      className={`badge badge-${variant} ${className}`}
    >
      {children}
    </span>
  );
}

// ==========================================
// 3. CARD
// ==========================================
export interface CardProps {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly gradient?: boolean;
  readonly as?: "div" | "article" | "section" | "li";
  readonly onClick?: React.MouseEventHandler<HTMLDivElement>;
  readonly id?: string;
  readonly "aria-label"?: string;
}

export function Card({
  children,
  className = "",
  gradient = false,
  as: Tag = "div",
  onClick,
  id,
  "aria-label": ariaLabel,
}: CardProps) {
  return (
    <Tag
      id={id}
      className={`card ${gradient ? "card-gradient" : ""} ${className}`}
      {...(onClick ? { onClick: onClick as React.MouseEventHandler } : {})}
      {...(ariaLabel ? { "aria-label": ariaLabel } : {})}
    >
      {children}
    </Tag>
  );
}

// ==========================================
// 4. SKELETON
// ==========================================
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
  const style: React.CSSProperties = {};

  if (width !== undefined) {
    style.width = typeof width === "number" ? `${width}px` : width;
  }
  if (height !== undefined) {
    style.height = typeof height === "number" ? `${height}px` : height;
  }
  if (circle) {
    style.borderRadius = "50%";
  } else if (borderRadius !== undefined) {
    style.borderRadius = typeof borderRadius === "number" ? `${borderRadius}px` : borderRadius;
  }

  return (
    <div
      className={`skeleton ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

// ==========================================
// 5. SPINNER
// ==========================================
export type SpinnerSize = "sm" | "md" | "lg";

export interface SpinnerProps {
  readonly size?: SpinnerSize;
  readonly className?: string;
  readonly "aria-label"?: string;
}

const spinnerSizeStyleMap: Record<SpinnerSize, { width: string; height: string }> = {
  sm: { width: "14px", height: "14px" },
  md: { width: "20px", height: "20px" },
  lg: { width: "32px", height: "32px" },
};

export function Spinner({
  size = "md",
  className = "",
  "aria-label": ariaLabel = "Loading",
}: SpinnerProps) {
  const { width, height } = spinnerSizeStyleMap[size];

  return (
    <output
      className={`loading ${className}`}
      style={{ width, height }}
      aria-label={ariaLabel}
    />
  );
}
