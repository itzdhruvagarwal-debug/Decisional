import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Validate environment variables at build time
import "./src/env";

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

const isVercel = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(isVercel ? {} : { output: "standalone" as const }),
  compress: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion", "date-fns", "recharts"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      ...(storagePublicHost
        ? [{ protocol: "https" as const, hostname: storagePublicHost }]
        : []),
      ...(s3Bucket
        ? [
            {
              protocol: "https" as const,
              hostname: `${s3Bucket}.s3.${s3Region}.amazonaws.com`,
            },
          ]
        : []),
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(self)",
          },
        ],
      },
    ];
  },
};

const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

export default withSentryConfig(nextConfig, {
  ...(sentryOrg ? { org: sentryOrg } : {}),
  ...(sentryProject ? { project: sentryProject } : {}),
  ...(sentryAuthToken ? { authToken: sentryAuthToken } : {}),
  silent: !process.env.CI,
  widenClientFileUpload: Boolean(sentryAuthToken && sentryOrg && sentryProject),
  telemetry: false,
});
