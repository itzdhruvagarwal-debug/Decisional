import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vyaparmedia.in";

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/pricing",
          "/blog",
          "/about",
          "/help",
          "/contact",
          "/terms",
          "/privacy",
          "/refund",
          "/cookie-policy",
          "/legal",
          "/icon-192.png",
          "/icon-512.png",
          "/manifest.webmanifest",
        ],
        disallow: [
          "/api/",
          "/admin/",
          "/dashboard/",
          "/_next/",
          "/reset-password/",
          "/forgot-password/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
