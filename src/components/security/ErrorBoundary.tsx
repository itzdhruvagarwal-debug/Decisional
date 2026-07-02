"use client";

/**
 * ErrorBoundary — Enterprise-Grade React Error Barrier
 *
 * Catches unhandled React rendering errors to prevent:
 * - White screens exposing internal component trees
 * - Stack traces leaking to users in production
 * - Sensitive data visible in error messages
 *
 * In production: shows a generic error UI with a support reference ID.
 * In development: shows full details for debugging.
 */

import React from "react";

interface Props {
  children: React.ReactNode;
  /** Optional custom fallback UI */
  fallback?: React.ReactNode;
  /** Shown in the error UI for support correlation */
  componentName?: string;
}

interface State {
  hasError: boolean;
  errorId: string | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorId: null };
  }

  static getDerivedStateFromError(error: Error): State {
    const errorId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? (crypto.randomUUID().split("-")[0] ?? "000000").toUpperCase()
        // Fallback for environments without crypto.randomUUID — use a timestamp-based ID.
        : Date.now().toString(36).toUpperCase().slice(-6);

    // Prevent white screens / error boundaries for common extension errors
    if (
      error?.message?.includes('Failed to fetch') ||
      error?.stack?.includes('chrome-extension') ||
      error?.stack?.includes('frame_ant')
    ) {
      return { hasError: false, errorId: null };
    }

    return { hasError: true, errorId };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (
      error?.message?.includes('Failed to fetch') ||
      error?.stack?.includes('chrome-extension') ||
      error?.stack?.includes('frame_ant')
    ) {
      // Silently swallow extension-induced rendering errors
      return;
    }
    // In production: never log sensitive info to console
    if (process.env.NODE_ENV === "development") {
      console.error(
        "[ErrorBoundary]",
        this.props.componentName || "Unknown",
        error,
        info,
      );
    } else {
      // Production: minimal, non-sensitive log
      console.error(
        `[ErrorBoundary] Error in ${this.props.componentName || "Component"} [ID: ${this.state.errorId}]`,
      );
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorId: null });
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            padding: "40px 24px",
            textAlign: "center",
            minHeight: "200px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            background: "rgba(244, 63, 94, 0.04)",
            border: "1px solid rgba(244, 63, 94, 0.15)",
            borderRadius: "12px",
            margin: "16px",
          }}
        >
          <div style={{ fontSize: "32px" }}>⚠️</div>
          <h3
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "var(--color-text, #fff)",
              margin: 0,
            }}
          >
            Something went wrong
          </h3>
          <p
            style={{
              fontSize: "14px",
              color: "var(--color-text-secondary, #aaa)",
              maxWidth: "360px",
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            An unexpected error occurred in this section.
            {this.state.errorId && (
              <>
                {" "}
                Please reference ID{" "}
                <code
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    fontFamily: "monospace",
                  }}
                >
                  ERR-{this.state.errorId}
                </code>{" "}
                if you contact support.
              </>
            )}
          </p>
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={this.handleRetry}
              style={{
                padding: "10px 20px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.06)",
                color: "var(--color-text, #fff)",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 500,
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "10px 20px",
                borderRadius: "8px",
                border: "none",
                background: "var(--color-primary, #6366f1)",
                color: "#fff",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 500,
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Functional wrapper for convenient use in JSX without class syntax.
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  componentName?: string,
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary
      componentName={componentName || Component.displayName || Component.name}
    >
      <Component {...props} />
    </ErrorBoundary>
  );
  WrappedComponent.displayName = `withErrorBoundary(${componentName || Component.displayName || Component.name})`;
  return WrappedComponent;
}
