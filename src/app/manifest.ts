import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Decisional",
    short_name: "Decisional",
    description:
      "Decisional helps brands and creators collaborate with secure contracts, payments, and verified workflows.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "browser"],
    background_color: "#0a0a14",
    theme_color: "#6d28ff",
    orientation: "portrait",
    lang: "en-IN",
    categories: ["business", "productivity", "social"],
    shortcuts: [
      {
        name: "Dashboard",
        short_name: "Home",
        description: "Open your Decisional workspace",
        url: "/dashboard",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Campaigns",
        short_name: "Campaigns",
        description: "Browse or manage campaigns",
        url: "/dashboard/campaigns",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Deals",
        short_name: "Deals",
        description: "Open active collaboration deals",
        url: "/dashboard/deals",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Messages",
        short_name: "Messages",
        description: "Open collaboration messages",
        url: "/dashboard/messages",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
