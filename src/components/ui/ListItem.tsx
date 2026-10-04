import React from "react";
import Link from "next/link";

export interface ListItemProps {
  readonly leading?: React.ReactNode;
  readonly title?: React.ReactNode;
  readonly subtitle?: React.ReactNode;
  readonly meta?: React.ReactNode;
  readonly trailing?: React.ReactNode;
  readonly children?: React.ReactNode;
  readonly onClick?: (() => void) | undefined;
  readonly href?: string | undefined;
  readonly active?: boolean;
  readonly unread?: boolean;
  readonly className?: string;
  readonly compact?: boolean;
  readonly as?: "div" | "li" | "article";
}

/**
 * Universal ListItem base component for lists, activity feeds, and table-like rows.
 * Implements standard 3-zone responsive pattern: [Leading] [Center / Metadata] [Trailing].
 */
export function ListItem({
  leading,
  title,
  subtitle,
  meta,
  trailing,
  children,
  onClick,
  href,
  active = false,
  unread = false,
  className = "",
  compact = false,
  as = "div",
}: Readonly<ListItemProps>) {
  const Component = as;

  const baseStyles = `group relative rounded-2xl border transition-all ${
    compact ? "p-3 sm:p-3.5" : "p-4 sm:p-5"
  } ${
    active
      ? "bg-card border-primary/50 shadow-xs ring-1 ring-primary/20"
      : unread
      ? "bg-primary/5 border-primary/30"
      : "bg-card border-border hover:border-border/80 hover:shadow-xs"
  } ${onClick || href ? "cursor-pointer" : ""} ${className}`.trim();

  const hasHeader = Boolean(leading || title || subtitle || meta || trailing);

  const content = hasHeader ? (
    <div className="w-full space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 w-full">
        {/* Leading & Center Zone */}
        {(leading || title || subtitle || meta) && (
          <div className="flex items-start sm:items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
            {leading && <div className="shrink-0">{leading}</div>}

            <div className="min-w-0 flex-1">
              {title && (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">
                    {title}
                  </div>
                  {unread && (
                    <span className="w-2 h-2 rounded-full bg-primary shrink-0" aria-label="Unread item" />
                  )}
                </div>
              )}

              {subtitle && (
                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                  {subtitle}
                </div>
              )}

              {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
            </div>
          </div>
        )}

        {/* Trailing Zone */}
        {trailing && (
          <div className="shrink-0 flex items-center gap-2 sm:self-center self-end sm:pt-0 pt-1">
            {trailing}
          </div>
        )}
      </div>

      {/* Extra Arbitrary Children */}
      {children && <div className="w-full">{children}</div>}
    </div>
  ) : (
    <div className="w-full">{children}</div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={baseStyles}
        {...(onClick ? { onClick } : {})}
      >
        {content}
      </Link>
    );
  }

  return (
    <Component
      className={baseStyles}
      {...(onClick ? { onClick, role: "button", tabIndex: 0 } : {})}
    >
      {content}
    </Component>
  );
}
