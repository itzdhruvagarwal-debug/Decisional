"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

/**
 * Enterprise Features: Visual Security Watermark & DOM Tamper Detection
 * - Renders a faint, repeating watermark (User ID/Email/IP/Time) over the UI.
 * - This acts as a deterrent against unauthorized screenshotting of sensitive data
 *   like brand wallets, pending deals, or influencer PII.
 * - Tamper Detection observes if the watermark node is deleted or display:none is applied via DevTools.
 */
export function EnterpriseWatermark() {
    const { data: session } = useSession();
    const pathname = usePathname();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setTimeout(() => setMounted(true), 0);
    }, []);

    // Only show on protected routes where data leaks matter most
    const isSensitiveRoute =
        pathname?.startsWith("/dashboard/wallet") ||
        pathname?.startsWith("/dashboard/deals") ||
        pathname?.startsWith("/admin");

    useEffect(() => {
        if (!mounted || !isSensitiveRoute || !session?.user) return;

        // --- Enterprise DOM Tamper Detection ---
        const watermarkId = "enterprise-security-watermark";

        // MutationObserver detects if someone tries to delete the watermark from DOM
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                // Did they remove our watermark node?
                Array.from(mutation.removedNodes).forEach((node) => {
                    if ((node as HTMLElement).id === watermarkId) {
                        console.warn("[SECURITY] Tampering detected: Watermark removed.");
                        // Non-destructive: log and continue instead of forcing reload.
                    }
                });

                // Did they change the style to hide it?
                if (mutation.type === "attributes" && mutation.attributeName === "style") {
                    const el = mutation.target as HTMLElement;
                    if (el.id === watermarkId) {
                        if (el.style.opacity === "0" || el.style.display === "none" || el.style.visibility === "hidden") {
                            console.warn("[SECURITY] Tampering detected: Watermark hidden.");
                            // Non-destructive: avoid forced page reload loops.
                        }
                    }
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["style"]
        });

        return () => observer.disconnect();
    }, [mounted, isSensitiveRoute, session]);

    if (!mounted || !isSensitiveRoute || !session?.user) return null;

    return (
        <div
            id="enterprise-security-watermark"
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                pointerEvents: "none",
                zIndex: 99999, // Way above everything
                overflow: "hidden",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "center",
                opacity: 0.03, // Barely visible to the naked eye but catches screenshot scrapers
                userSelect: "none",
            }}
        >
            {/* Generate a grid of repeating watermarks identifying the internal user */}
            {Array.from({ length: 30 }).map((_, i) => (
                <div
                    key={i}
                    style={{
                        transform: "rotate(-35deg)",
                        padding: "40px",
                        fontSize: "14px",
                        fontFamily: "monospace",
                        color: "var(--color-text)",
                        whiteSpace: "pre-line",
                        textAlign: "center"
                    }}
                >
                    {session.user.email} <br />
                    {session.user.id.slice(-8)} <br />
                    {new Date().toISOString().split("T")[0]}
                </div>
            ))}
        </div>
    );
}
