/**
 * Next.js Edge Proxy - Enterprise WAF + Security Layer
 */

import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Edge-safe auth instance
const { auth } = NextAuth(authConfig);

/**
 * Enterprise Proxy Logic
 */
export const proxy = auth(async (req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  const redirectTo = (targetPath: string) => {
    const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost || req.headers.get("host") || req.nextUrl.host;
    const proto = forwardedProto || req.nextUrl.protocol.replace(":", "") || "https";
    return new URL(targetPath, `${proto}://${host}`);
  };

  // 1. WAF - Bot Protection
  const ua = (req.headers.get("user-agent") || "").toLowerCase();
  const suspicious = ["sqlmap", "nikto", "nmap"];
  if (suspicious.some((bot) => ua.includes(bot))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2. Auth Logic
  const isAuth = !!session;
  const isApiRoute = pathname.startsWith("/api/");
  const isStaticAsset =
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    /\.[a-zA-Z0-9]+$/.test(pathname);
  const isDashboardPath =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/");

  // 3. Admin Protection
  const isAdminPath =
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/api/admin" ||
    pathname.startsWith("/api/admin/");

  // Enforce authentication only on sensitive app sections.
  if (!isAuth && !isStaticAsset && (isDashboardPath || isAdminPath)) {
    if (isApiRoute) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = redirectTo("/login");
    loginUrl.searchParams.set(
      "callbackUrl",
      `${pathname}${req.nextUrl.search || ""}`,
    );
    return NextResponse.redirect(loginUrl);
  }

  if (isAdminPath) {
    const userType = (session?.user as any)?.userType;
    if (userType !== "ADMIN") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Forbidden: Admin access required" },
          { status: 403 },
        );
      }
      return NextResponse.redirect(redirectTo("/dashboard"));
    }
  }

  // 4. Prevent logged-in users from seeing /login and /register
  const authPages = new Set([
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
  ]);
  if (isAuth && authPages.has(pathname)) {
    return NextResponse.redirect(redirectTo("/dashboard"));
  }

  // 5. Security Headers
  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");

  return response;
});

export const config = {
  matcher: ["/((?!api/payments/webhook|api/cron|_next/static|_next/image|favicon.ico).*)"],
};
