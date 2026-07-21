"use client";
import React from "react";
import { Button } from "./Button";

export interface EmptyStateProps {
  readonly emoji?: string | undefined;
  readonly title: string;
  readonly description: string;
  readonly actionLabel?: string | undefined;
  readonly actionHref?: string | undefined;
  readonly onActionClick?: (() => void) | undefined;
  readonly secondaryActionLabel?: string | undefined;
  readonly secondaryActionHref?: string | undefined;
  readonly onSecondaryActionClick?: (() => void) | undefined;
  readonly compact?: boolean | undefined;
  readonly className?: string | undefined;
  readonly style?: React.CSSProperties | undefined;
}

export default function EmptyState({
  emoji,
  title,
  description,
  actionLabel,
  actionHref,
  onActionClick,
  secondaryActionLabel,
  secondaryActionHref,
  onSecondaryActionClick,
  compact = false,
  className = "",
  style,
}: EmptyStateProps) {
  return (
    <div
      className={`empty-state ${compact ? "compact" : ""} ${className}`}
      style={style}
    >
      {emoji && (
        <div className="empty-state-emoji" aria-hidden="true">
          {emoji}
        </div>
      )}
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-description">{description}</p>
      
      {(actionLabel || secondaryActionLabel) && (
        <div className="flex gap-3 justify-center flex-wrap">
          {actionLabel && (
            <Button
              {...(actionHref ? { href: actionHref } : {})}
              {...(onActionClick ? { onClick: onActionClick } : {})}
              variant="primary"
              size={compact ? "md" : "lg"}
            >
              {actionLabel}
            </Button>
          )}

          {secondaryActionLabel && (
            <Button
              {...(secondaryActionHref ? { href: secondaryActionHref } : {})}
              {...(onSecondaryActionClick ? { onClick: onSecondaryActionClick } : {})}
              variant="secondary"
              size="md"
            >
              {secondaryActionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

