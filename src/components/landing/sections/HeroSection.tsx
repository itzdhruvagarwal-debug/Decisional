"use client";

import Link from "next/link";
import PWAInstallButton from "@/components/pwa/PWAInstallButton";
import { Button } from "@/components/ui/Button";
import { HeroProductMockup } from "@/components/landing/HeroProductMockup";

const PROOF_ITEMS = [" Secure sessions", " Protected payments", " Installable PWA"] as const;
const BRAND_CHIPS = ["FitForma", "Myntra", "Mamaearth", "Nykaa", "Boat", "Lenskart"] as const;

function ScrollCue() {
  return (
    <Button
      type="button"
      variant="ghost"
      className="landing-scroll-cue hide-mobile absolute flex flex-col items-center gap-2 cursor-pointer border-none p-0 bg-none opacity-50"
      onClick={() => {
        document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
      }}
    >
      <span className="text-muted font-semibold text-xs uppercase tracking-wider">Explore</span>
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-primary-light"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </Button>
  );
}

export function HeroSection() {
  return (
    <section className="landing-hero relative overflow-hidden pt-30 pb-20">
      <div className="landing-hero-media absolute inset-0" />
      <div className="landing-hero-scrim absolute inset-0 z-0" />

      <div className="container relative z-1">
        <div className="text-center max-w-900 mx-auto">
          <div className="landing-kicker inline-flex items-center gap-2 font-bold rounded-full text-xs uppercase mb-6 tracking-wider bg-indigo-15 text-indigo-light">
            🛡️ India&apos;s Trusted Influencer Commerce &amp; Escrow Platform
          </div>

          <h1 className="landing-hero-title mb-6 font-extrabold">
            <span className="landing-gradient-word inline-block">VyaparMedia</span>
            <span className="landing-hero-tagline block font-semibold mt-3-5">
              Where Brands &amp; Creators Build Trusted Business.
            </span>
          </h1>

          <p className="landing-hero-copy max-w-600 leading-relaxed">
            Scale your brand with 100% upfront escrow safety, verified creator analytics,
            legally binding smart contracts, and guaranteed on-time bank settlements.
          </p>

          <div className="hero-cta-group flex gap-4 justify-center flex-wrap mb-5">
            <Link
              href="/register?type=influencer"
              className="landing-cta landing-cta-primary inline-flex items-center justify-center gap-2 font-bold rounded-lg text-sm no-underline text-white"
            >
              Join as Creator
            </Link>
            <Link
              href="/register?type=brand"
              className="landing-cta landing-cta-secondary inline-flex items-center justify-center gap-2 font-bold rounded-lg text-sm no-underline text-white backdrop-blur"
            >
              Hire Creators
            </Link>
          </div>

          <div className="flex gap-3 justify-center flex-wrap mb-5">
            <PWAInstallButton platform="ios" variant="store" label="Download for iOS" />
            <PWAInstallButton platform="android" variant="store" label="Download for Android" />
          </div>

          <div className="flex gap-6 justify-center flex-wrap mb-2">
            {PROOF_ITEMS.map((item) => (
              <span key={item} className="landing-proof-item text-sm flex items-center gap-1.5">
                {item}
              </span>
            ))}
          </div>

          <HeroProductMockup />

          <div className="landing-trust-strip animate-fade-in w-full text-center">
            <p className="text-xs text-muted mb-4 font-semibold uppercase tracking-wider">
              Trusted by India&apos;s fastest growing brands
            </p>
            <div className="landing-brand-row flex justify-center items-center gap-6 flex-wrap">
              {BRAND_CHIPS.map((brand) => (
                <div
                  key={brand}
                  className="landing-brand-chip text-sm font-bold bg-glass rounded-sm text-primary"
                >
                  {brand}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <ScrollCue />
    </section>
  );
}
