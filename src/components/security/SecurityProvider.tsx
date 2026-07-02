"use client";

/**
 * SecurityProvider - Enterprise Frontend Security Layer
 *
 * Responsibilities:
 * 1. Session health monitoring (detects SessionRevoked, RefreshAccessTokenError)
 * 2. Inactivity auto-logout (30 min, with 5 min countdown warning)
 * 3. Tab-nabbing protection (sets rel=noopener noreferrer on all external links)
 * 4. History pollution prevention (disables browser back after logout)
 * 5. Visibility-based session check (validates session when tab refocuses)
 */

import { useEffect, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useInactivityLogout } from "@/hooks/useInactivityLogout";
import { useSecureSession } from "@/hooks/useSecureSession";
import { useTokenRefreshGuard } from "@/hooks/useTokenRefreshGuard";
import { EnterpriseWatermark } from "./EnterpriseWatermark";

// Inactivity warning modal
function InactivityWarningModal({
  secondsRemaining,
  onExtend,
  onLogout,
}: {
  secondsRemaining: number;
  onExtend: () => void;
  onLogout: () => void;
}) {
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeStr =
    minutes > 0
      ? `${minutes}m ${seconds.toString().padStart(2, "0")}s`
      : `${seconds}s`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="inactivity-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(8px)",
        padding: "24px",
      }}
    >
      <div
        style={{
          background: "var(--color-surface, #111)",
          border: "1px solid rgba(245, 158, 11, 0.3)",
          borderRadius: "16px",
          padding: "36px 32px",
          maxWidth: "400px",
          width: "100%",
          textAlign: "center",
          boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
          animation: "slideDown 0.25s ease-out",
        }}
      >
        <div
          style={{
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            background: "rgba(245, 158, 11, 0.12)",
            border: "2px solid rgba(245, 158, 11, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            fontSize: "28px",
          }}
        >
          !
        </div>

        <h2
          id="inactivity-title"
          style={{
            fontSize: "20px",
            fontWeight: 700,
            color: "var(--color-text, #fff)",
            marginBottom: "12px",
          }}
        >
          Session Expiring Soon
        </h2>

        <p
          style={{
            fontSize: "14px",
            color: "var(--color-text-secondary, #aaa)",
            lineHeight: 1.6,
            marginBottom: "8px",
          }}
        >
          For your security, you&apos;ll be automatically signed out due to
          inactivity in:
        </p>

        <div
          style={{
            fontSize: "36px",
            fontWeight: 800,
            color: secondsRemaining <= 60 ? "#f43f5e" : "#f59e0b",
            letterSpacing: 0,
            marginBottom: "28px",
            fontVariantNumeric: "tabular-nums",
            transition: "color 0.3s",
          }}
        >
          {timeStr}
        </div>

        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={onLogout}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "transparent",
              color: "var(--color-text-secondary, #aaa)",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 500,
            }}
          >
            Sign Out Now
          </button>
          <button
            onClick={onExtend}
            autoFocus
            style={{
              flex: 2,
              padding: "12px",
              borderRadius: "10px",
              border: "none",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              color: "#fff",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 600,
              boxShadow: "0 4px 12px rgba(99,102,241,0.4)",
            }}
          >
            Stay Signed In
          </button>
        </div>
      </div>
    </div>
  );
}

// Main security provider
export function SecurityProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  useSecureSession();
  useTokenRefreshGuard();

  const isAuthenticated = status === "authenticated";
  const isProtectedRoute =
    pathname?.startsWith("/dashboard") || pathname?.startsWith("/admin");

  // Inactivity logout
  const { showWarning, secondsRemaining, extendSession } = useInactivityLogout(
    isAuthenticated && isProtectedRoute,
  );

  const handleLogoutNow = useCallback(async () => {
    await signOut({
      redirect: true,
      callbackUrl: "/login?reason=manual_logout",
    });
  }, []);

  // Session error detection
  useEffect(() => {
    const sessionError = session?.error;

    if (sessionError === "RefreshAccessTokenError") {
      // Token rotation failed, so force sign out.
      signOut({ redirect: true, callbackUrl: "/login?reason=token_expired" });
    }

    if (sessionError === "SessionRevoked") {
      // Session was revoked (new login on another device)
      signOut({ redirect: true, callbackUrl: "/login?reason=session_revoked" });
    }
  }, [session]);

  // Tab-nabbing protection
  // Patches all external links to use rel="noopener noreferrer"
  useEffect(() => {
    const patchExternalLinks = () => {
      const links = document.querySelectorAll<HTMLAnchorElement>("a[href]");
      links.forEach((link) => {
        const href = link.getAttribute("href") || "";
        const isExternal =
          href.startsWith("http") && !href.startsWith(window.location.origin);
        if (isExternal) {
          if (!link.rel.includes("noopener")) {
            link.rel = "noopener noreferrer";
          }
          if (link.target === "_blank" && !link.rel.includes("noopener")) {
            link.rel = "noopener noreferrer";
          }
        }
      });
    };

    // Run immediately and observe DOM mutations for dynamically rendered links
    patchExternalLinks();
    const observer = new MutationObserver(patchExternalLinks);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [pathname]); // Re-run on route change

  // Visibility change: re-validate session when tab refocuses and run periodic heartbeat checks.
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        // Re-check session validity by hitting a lightweight endpoint
        try {
          const res = await fetch("/api/auth/session", {
            credentials: "same-origin",
            cache: "no-store",
            headers: {
              "Content-Type": "application/json",
            },
          });
          if (res.status === 401) {
            await signOut({
              redirect: true,
              callbackUrl: "/login?reason=session_expired",
            });
          }
        } catch {
          // Network error: do not sign out aggressively.
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // --- Enterprise Heartbeat: Periodic session check ---
    const heartbeatInterval = setInterval(
      handleVisibilityChange,
      5 * 60 * 1000,
    ); // Every 5 mins

    // Run once on mount when authenticated
    handleVisibilityChange();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(heartbeatInterval);
    };
  }, [isAuthenticated]);

  // Anti-framing clickjacking defense
  useEffect(() => {
    if (typeof window !== "undefined" && window.self !== window.top) {
      // Best-effort frame busting. Avoid throwing on cross-origin frame access.
      try {
        const topLocation = window.top?.location;
        if (topLocation && topLocation.origin === window.location.origin) {
          topLocation.href = window.location.href;
        }
      } catch {
        // Cross-origin frame access blocked by browser; headers already protect framing.
      }
    }
  }, []);

  // History pollution prevention after logout
  useEffect(() => {
    if (status === "unauthenticated" && isProtectedRoute) {
      // Replace current history entry to block back-button access to protected pages
      router.replace("/login?reason=unauthorized");
    }
  }, [status, isProtectedRoute, router]);

  return (
    <>
      {children}
      {showWarning && isAuthenticated && (
        <InactivityWarningModal
          secondsRemaining={secondsRemaining}
          onExtend={extendSession}
          onLogout={handleLogoutNow}
        />
      )}


      {/* Enterprise Visual Watermark (DOM Tamper Protected) */}
      <EnterpriseWatermark />
    </>
  );
}
