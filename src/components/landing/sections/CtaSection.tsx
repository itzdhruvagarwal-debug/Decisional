"use client";

import Link from "next/link";
import { RevealOnScroll } from "@/components/landing/LandingHelpers";

export function CtaSection() {
  return (
    <RevealOnScroll>
      <section className="landing-final-cta section text-center relative overflow-hidden bg-gradient-primary">
        <div className="landing-final-cta-texture absolute inset-0" />
        <div className="container relative z-1">
          <h2 className="landing-cta-title mb-4 font-extrabold tracking-normal">
            Ready to Get Started?
          </h2>
          <p className="landing-cta-copy mb-8 leading-relaxed opacity-90">
            Create a free account, install the PWA, and manage campaigns from web, iOS home
            screen, or Android home screen.
          </p>
          <Link href="/register" className="landing-cta-inverse btn btn-lg font-bold">
            Create Free Account
          </Link>
        </div>
      </section>
    </RevealOnScroll>
  );
}
