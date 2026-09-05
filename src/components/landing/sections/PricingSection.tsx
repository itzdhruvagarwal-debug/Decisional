"use client";

import Link from "next/link";
import { RevealOnScroll } from "@/components/landing/LandingHelpers";

const INFLUENCER_FEATURES = [
  "Profile, portfolio, and verification",
  "Campaign discovery and applications",
  "Clear payout before deal signing",
  "Levels, badges, and referral benefits",
  "Protected settlement after approval",
] as const;

const BRAND_FEATURES = [
  "Verified creator discovery",
  "Protected payment escrow workflow",
  "Contract and approval flow",
  "Post verification system",
  "Dispute resolution included",
] as const;

function CheckIcon({ className = "text-primary-light" }: Readonly<{ className?: string | undefined }>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`flex-shrink-0 ${className}`}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function FeatureList({
  items,
  checkClass,
}: Readonly<{
  items: readonly string[];
  checkClass?: string;
}>) {
  return (
    <ul className="text-left mb-6 list-none">
      {items.map((item) => (
        <li
          key={item}
          className="landing-check-row border-b border-card text-secondary text-sm flex items-center gap-2.5"
        >
          <CheckIcon className={checkClass} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function PricingSection() {
  return (
    <section id="pricing" className="section bg-secondary">
      <div className="container">
        <RevealOnScroll>
          <h2 className="section-title">
            Simple, <span className="gradient-text">Transparent</span> Pricing
          </h2>
        </RevealOnScroll>
        <RevealOnScroll delay={0.1}>
          <p className="section-subtitle">
            No hidden fees. No surprises. Just fair pricing for everyone.
          </p>
        </RevealOnScroll>

        <div className="grid-2 max-w-800 mx-auto">
          {/* Influencer Card */}
          <RevealOnScroll delay={0.15}>
            <div className="card hover-lift text-center h-full flex flex-col">
              <div className="flex-1">
                <h3 className="font-extrabold mb-2 text-2xl">For Influencers</h3>
                <div className="landing-price mb-1 font-extrabold">
                  <span className="gradient-text">FREE</span>
                </div>
                <p className="text-muted mb-6 text-sm">to join &amp; apply</p>
                <FeatureList items={INFLUENCER_FEATURES} />
              </div>
              <Link href="/register?type=influencer" className="btn btn-secondary w-full mt-4">
                Join as Influencer
              </Link>
            </div>
          </RevealOnScroll>

          {/* Brand Card */}
          <RevealOnScroll delay={0.25}>
            <div className="card card-gradient pricing-popular hover-lift text-center h-full flex flex-col">
              <div className="flex-1">
                <div className="badge badge-primary mb-4">Popular for teams</div>
                <h3 className="font-extrabold mb-2 text-2xl">For Brands</h3>
                <div className="landing-price mb-1 font-extrabold">
                  <span className="gradient-text">10%</span>
                </div>
                <p className="text-muted mb-6 text-sm">of campaign budget</p>
                <FeatureList items={BRAND_FEATURES} checkClass="text-emerald" />
              </div>
              <Link href="/register?type=brand" className="btn btn-primary w-full mt-4">
                Start Your Campaign
              </Link>
            </div>
          </RevealOnScroll>
        </div>
      </div>
    </section>
  );
}
