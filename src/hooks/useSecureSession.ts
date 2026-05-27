"use client";

/**
 * useSecureSession - Enterprise Frontend Session Integrity Monitor
 *
 * Provides:
 * 1. Cross-Tab Session Sync: If user logs out on one tab, all tabs log out.
 * 2. Token Integrity Check: On window focus, validates that the server-side
 *    session is still alive and not revoked.
 * 3. Role Guard: Provides helpers to check if the current session has a specific role.
 * 4. Suspicious Activity Detection: Tracks rapid route changes which could indicate
 *    an automated CSRF attack or XSS-based session riding.
 */

import { useSession, signOut } from "next-auth/react";
import { useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";

const CROSS_TAB_LOGOUT_KEY = "decisional:secure:logout";
const SESSION_VALIDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useSecureSession() {
    const { data: session, status } = useSession();
    const pathname = usePathname();
    const routeChangeTimestamps = useRef<number[]>([]);

    // 1. Cross-tab logout sync
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === CROSS_TAB_LOGOUT_KEY && e.newValue === "true") {
                // Another tab triggered a logout, so follow silently.
                localStorage.removeItem(CROSS_TAB_LOGOUT_KEY);
                signOut({ redirect: true, callbackUrl: "/login?reason=cross_tab_logout" });
            }
        };

        window.addEventListener("storage", handleStorageChange);
        return () => window.removeEventListener("storage", handleStorageChange);
    }, []);

    // 2. Server-side session heartbeat validation
    useEffect(() => {
        if (status !== "authenticated") return;

        const validateSession = async () => {
            try {
                const res = await fetch("/api/auth/session", {
                    credentials: "same-origin",
                    cache: "no-store",
                    headers: { "X-Session-Check": "1" },
                });

                if (res.status === 401 || res.status === 403) {
                    console.warn("[SECURITY][useSecureSession] Session validation failed. Signing out.");
                    await signOut({ redirect: true, callbackUrl: "/login?reason=session_expired" });
                }
            } catch {
                // Network failure: do not sign out aggressively on transient errors.
            }
        };

        // Run on mount and then on every window focus
        validateSession();

        const onFocus = () => validateSession();
        window.addEventListener("focus", onFocus);

        // Periodic heartbeat
        const interval = setInterval(validateSession, SESSION_VALIDATE_INTERVAL_MS);

        return () => {
            window.removeEventListener("focus", onFocus);
            clearInterval(interval);
        };
    }, [status]);

    // 3. Suspicious route velocity detection
    useEffect(() => {
        const now = Date.now();
        routeChangeTimestamps.current.push(now);

        // Keep only timestamps from the last 5 seconds
        routeChangeTimestamps.current = routeChangeTimestamps.current.filter(
            (ts) => now - ts < 5000
        );

        // If more than 10 route changes in 5 seconds, something is wrong
        if (routeChangeTimestamps.current.length > 10) {
            console.warn("[SECURITY][useSecureSession] Suspicious rapid navigation detected. Possible XSS automation.");
            // Could sign out or show a CAPTCHA in a real production scenario
        }
    }, [pathname]);

    // 4. Role and permission helpers
    const hasRole = useCallback(
        (role: string) => {
            return (session?.user as any)?.userType === role;
        },
        [session]
    );

    const isAdmin = hasRole("ADMIN");
    const isBrand = hasRole("BRAND");
    const isInfluencer = hasRole("INFLUENCER");

    // 5. Explicit secure logout
    const secureLogout = useCallback(async (reason = "manual_logout") => {
        // Broadcast logout to all other tabs via localStorage event
        localStorage.setItem(CROSS_TAB_LOGOUT_KEY, "true");

        await signOut({
            redirect: true,
            callbackUrl: `/login?reason=${reason}`,
        });
    }, []);

    return {
        session,
        status,
        isAdmin,
        isBrand,
        isInfluencer,
        hasRole,
        secureLogout,
        isAuthenticated: status === "authenticated",
        isLoading: status === "loading",
    };
}
