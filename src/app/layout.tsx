import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Decisional - Turning Signals into Decisions",
  description:
    "Decisional helps brands and creators run trusted influencer collaborations with secure payments and clear execution.",
  keywords: [
    "decisional",
    "influencer marketing",
    "brand collaboration",
    "creator marketplace",
    "secure payouts",
  ],
  authors: [{ name: "Decisional" }],
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Decisional",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Decisional - Turning Signals into Decisions",
    description:
      "A trusted influencer marketplace with secure payments, verification, and transparent deal execution.",
    type: "website",
    locale: "en_IN",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a14",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} data-scroll-behavior="smooth">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
