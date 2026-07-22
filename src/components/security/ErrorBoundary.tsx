"use client";


import { logger } from "@/lib/logger-client";
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
import { Button } from "@/components/ui";

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
      logger.error(
        `[ErrorBoundary] Error in ${this.props.componentName || "Unknown"}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
        { componentStack: info?.componentStack }
      );
    } else {
      // Production: minimal, non-sensitive log
      logger.error(
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
          role="alert"
          aria-live="assertive"
          className="text-center flex flex-col items-center justify-center gap-4 rounded-lg" style={{ padding: "40px 24px", minHeight: "200px", background: "rgba(244, 63, 94, 0.04)", border: "1px solid rgba(244, 63, 94, 0.15)", margin: "16px" }}
        >
          <div className="text-3xl">⚠️</div>
          <h3
            className="text-lg font-bold" style={{ color: "var(--color-text, #fff)", margin: 0 }}
          >
            Something went wrong
          </h3>
          <p
            className="text-sm leading-relaxed" style={{ color: "var(--color-text-secondary, #aaa)", maxWidth: "360px", margin: 0 }}
          >
            An unexpected error occurred in this section.
            {this.state.errorId && (
              <>
                {" "}
                Please reference ID{" "}
                <code
                  className="text-xs rounded-sm" style={{ background: "rgba(255,255,255,0.08)", padding: "2px 6px", fontFamily: "monospace" }}
                >
                  ERR-{this.state.errorId}
                </code>{" "}
                if you contact support.
              </>
            )}
          </p>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              aria-label="Try rendering this component again"
              onClick={this.handleRetry}
            >
              Try Again
            </Button>
            <Button
              variant="primary"
              aria-label="Reload the entire page"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
