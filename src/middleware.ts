/**
 * Next.js Edge Middleware - Enterprise WAF + Security Layer
 */

import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Edge-safe auth instance
const { auth } = NextAuth(authConfig);

function hostnameFromUrl(value?: string) {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

const storagePublicHost =
  hostnameFromUrl(process.env.STORAGE_PUBLIC_URL) ||
  hostnameFromUrl(process.env.R2_PUBLIC_URL);
const storageEndpointHost = hostnameFromUrl(process.env.S3_ENDPOINT);
const s3Bucket = process.env.S3_BUCKET;
const s3Region = process.env.S3_REGION || "ap-south-1";

const storageConnectSources = [
  storagePublicHost ? `https://${storagePublicHost}` : null,
  storageEndpointHost ? `https://${storageEndpointHost}` : null,
  s3Bucket ? `https://${s3Bucket}.s3.${s3Region}.amazonaws.com` : null,
].filter(Boolean);

const storageImageSources = [
  storagePublicHost ? `https://${storagePublicHost}` : null,
  s3Bucket ? `https://${s3Bucket}.s3.${s3Region}.amazonaws.com` : null,
].filter(Boolean);

const storageConnectStr = storageConnectSources.length > 0 ? " " + storageConnectSources.join(" ") : "";
const storageImageStr = storageImageSources.length > 0 ? " " + storageImageSources.join(" ") : "";

// Base CSP configuration (without nonce - will be injected per-request)
const isDev = process.env.NODE_ENV === "development";

const BASE_CSP = isDev
  ? [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.google.com https://*.googleapis.com https://checkout.razorpay.com https://*.razorpay.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      `img-src 'self' data: blob: https://lh3.googleusercontent.com https://avatars.githubusercontent.com https://images.unsplash.com${storageImageStr}`,
      "font-src 'self' https://fonts.gstatic.com",
      `connect-src 'self' https://*.googleapis.com https://*.razorpay.com https://api.razorpay.com https://graph.instagram.com https://api.instagram.com https://graph.facebook.com https://api.msg91.com https://surepass.io https://*.surepass.io https://*.ingest.sentry.io https://*.sentry.io${storageConnectStr}`,
      "frame-src 'self' https://checkout.razorpay.com https://*.razorpay.com",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; ")
  : [
      "default-src 'self'",
      `script-src 'self' 'nonce-{NONCE}' https://*.google.com https://*.googleapis.com https://checkout.razorpay.com https://*.razorpay.com`,
      "style-src 'self' 'unsafe-inline' 'nonce-{NONCE}' https://fonts.googleapis.com",
      `img-src 'self' data: blob: https://lh3.googleusercontent.com https://avatars.githubusercontent.com https://images.unsplash.com${storageImageStr}`,
      "font-src 'self' https://fonts.gstatic.com",
      `connect-src 'self' https://*.googleapis.com https://*.razorpay.com https://api.razorpay.com https://graph.instagram.com https://api.instagram.com https://graph.facebook.com https://api.msg91.com https://surepass.io https://*.surepass.io https://*.ingest.sentry.io https://*.sentry.io${storageConnectStr}`,
      "frame-src 'self' https://checkout.razorpay.com https://*.razorpay.com",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
    ].join("; ");

/**
 * Enterprise Middleware Logic
 */
export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Generate unique nonce for this request
  const nonce = crypto.randomUUID();
  const cspWithNonce = BASE_CSP.replace(/\{NONCE\}/g, nonce);

  const redirectTo = (targetPath: string) => {
    const configured =
      process.env.NEXTAUTH_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_BASE_URL ||
      req.nextUrl.origin;
    return new URL(targetPath, configured);
  };

  // Helper to apply CSP headers to response
  const applyCSP = (response: NextResponse) => {
    response.headers.set('Content-Security-Policy', cspWithNonce);
    response.headers.set('x-nonce', nonce);
    return response;
  };

  // 1. WAF - Bot Protection
  const ua = (req.headers.get("user-agent") || "").toLowerCase();
  const requestFingerprint = `${ua} ${pathname.toLowerCase()} ${req.nextUrl.search.toLowerCase()}`;
  const suspiciousPatterns = [
    /\bsqlmap\b/,
    /\bnikto\b/,
    /\bnmap\b/,
    /\bmasscan\b/,
    /\bdirbuster\b/,
    /\bgobuster\b/,
    /\bwp-scan\b/,
    /\bwpscan\b/,
    /\/wp-admin\b/,
    /\/wp-login\.php\b/,
    /\/phpmyadmin\b/,
    /\.\.\/|\.\.\\/,
    /<script\b/,
    /union(?:\s|%20|\+)+select/,
    /sleep\s*\(/,
    /benchmark\s*\(/,
    /\/etc\/passwd/,
  ];
  if (suspiciousPatterns.some((pattern) => pattern.test(requestFingerprint))) {
    return applyCSP(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }

  // 1.5 Dynamic IP Blacklist (Edge check)
  const ip = (req as unknown as { ip?: string }).ip || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (ip !== "unknown") {
    try {
      const { isIpBannedEdge } = await import("./lib/blacklist-edge");
      if (await isIpBannedEdge(ip)) {
        return applyCSP(NextResponse.json({ error: "Access Denied: Your IP is banned." }, { status: 403 }));
      }
    } catch (_err) {
      // Non-blocking in dev if resolver fails
    }
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
      return applyCSP(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    const loginUrl = redirectTo("/login");
    loginUrl.searchParams.set(
      "callbackUrl",
      `${pathname}${req.nextUrl.search || ""}`,
    );
    return applyCSP(NextResponse.redirect(loginUrl));
  }

  if (isAdminPath) {
    const userType = session?.user?.userType;
    if (userType !== "ADMIN") {
      if (pathname.startsWith("/api/")) {
        return applyCSP(NextResponse.json(
          { error: "Forbidden: Admin access required" },
          { status: 403 },
        ));
      }
      return applyCSP(NextResponse.redirect(redirectTo(isAuth ? "/dashboard" : "/login")));
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
    return applyCSP(NextResponse.redirect(redirectTo("/dashboard")));
  }

  // 5. Cron route protection - fallback in case guard import is forgotten
  const isCronRoute = pathname.startsWith("/api/cron/");
  if (isCronRoute) {
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = process.env.CRON_SECRET || "";
    
    // Use timing-safe comparison to prevent timing attacks via Web Crypto (Edge-safe)
    const encoder = new TextEncoder();
    const expectedData = encoder.encode(expectedSecret);
    const actualData = encoder.encode(cronSecret || "");
    const expectedHash = new Uint8Array(await crypto.subtle.digest("SHA-256", expectedData));
    const actualHash = new Uint8Array(await crypto.subtle.digest("SHA-256", actualData));
    
    let comparisonResult = 0;
    for (let i = 0; i < expectedHash.length; i++) {
      comparisonResult |= expectedHash[i]! ^ actualHash[i]!;
    }
    
    if (!cronSecret || comparisonResult !== 0) {
      return applyCSP(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    }
  }

  return applyCSP(NextResponse.next());
});

export const config = {
  matcher: ["/((?!api/auth|api/payments/webhook|api/metrics|_next/static|_next/image|favicon.ico).*)"],
};
