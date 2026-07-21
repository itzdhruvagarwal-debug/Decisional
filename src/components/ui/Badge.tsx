import React from "react";

export type BadgeVariant = "primary" | "success" | "warning" | "danger" | "ghost";

export interface BadgeProps {
  readonly children: React.ReactNode;
  readonly variant?: BadgeVariant;
  readonly className?: string;
  readonly style?: React.CSSProperties;
  readonly id?: string;
}

export function Badge({
  children,
  variant = "primary",
  className = "",
  style,
  id,
}: BadgeProps) {
  return (
    <span
      id={id}
      className={`badge badge-${variant} ${className}`}
      style={style}
    >
      {children}
    </span>
  );
}
