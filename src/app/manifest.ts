import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Decisional",
    short_name: "Decisional",
    description:
      "Decisional helps brands and creators collaborate with secure contracts, payments, and verified workflows.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a14",
    theme_color: "#0a0a14",
    orientation: "portrait",
    lang: "en-IN",
    categories: ["business", "productivity", "social"],
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
