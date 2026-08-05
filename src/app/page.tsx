"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PWAInstallButton from "@/components/pwa/PWAInstallButton";
import { Button } from "@/components/ui/Button";
import {
  homeFeatures,
  homeSteps,
  homeTestimonials,
} from "@/lib/home-content";
import {
  RevealOnScroll,
  getFeatureIcon,
  renderStars,
} from "@/components/landing/LandingHelpers";
import { HeroProductMockup } from "@/components/landing/HeroProductMockup";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<"influencer" | "brand">(
    "influencer",
  );

  return (
    <div className="min-h-screen">
      {/* Mobile Onboarding view */}
      <div className="mobile-onboarding-screen">
        {/* Onboarding Header */}
        <div className="flex justify-between items-center w-full">
          <div className="flex items-center gap-2">
            <span className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white w-9 h-9 rounded-xl flex items-center justify-center font-black text-xl shadow-[0_4px_14px_rgba(109,40,255,0.3)]">D</span>
            <span className="font-extrabold text-xl tracking-tight text-white">Decisional</span>
          </div>
        </div>

        {/* 3D Illustration Mockup Container */}
        <div className="flex-1 flex items-center justify-center my-6 relative min-h-[260px]">
          <div className="w-full max-w-[290px] aspect-[4/5] rounded-[32px] overflow-hidden shadow-[0_30px_70px_rgba(109,40,255,0.22)] border border-white/10 relative bg-[#120f26]/60 backdrop-blur-md">
            <Image
              src="/onboarding_illustration.jpg"
              alt="Decisional App 3D Onboarding Illustration"
              fill
              style={{ objectFit: "cover" }}
              sizes="(max-width: 768px) 100vw, 290px"
              priority
            />
          </div>
        </div>

        {/* Copy Deck / Content Area */}
        <div className="mb-8 text-left">
          {/* Custom dot slider indicators */}
          <div className="flex justify-start gap-2 mb-6">
            <span className="w-6 h-1.5 rounded-full bg-violet-500 transition-all duration-300" />
            <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
            <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
            <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
          </div>

          <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-white mb-3">
            Smarter collaborations.<br />
            <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">Stronger results.</span>
          </h1>
          <p className="text-gray-400 text-sm leading-relaxed max-w-xs">
            The secure influencer marketing platform that puts trust, transparency and results first.
          </p>
        </div>

        {/* Onboarding Buttons */}
        <div className="flex flex-col gap-4 w-full">
          <Link
            href="/register"
            className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-2 shadow-[0_12px_28px_rgba(109,40,255,0.35)] transition-all transform hover:scale-[1.01] active:scale-[0.98] text-sm no-underline"
          >
            <span>Get Started</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
          <div className="text-center text-xs pb-2">
            <span className="text-gray-400">Already have an account? </span>
            <Link href="/login" className="text-violet-400 font-extrabold hover:underline no-underline ml-1">
              Log in
            </Link>
          </div>
        </div>
      </div>

      <div className="desktop-homepage-content">
        <Navbar />

      {/* ==================== HERO ==================== */}
      <section
        className="landing-hero relative overflow-hidden pt-30 pb-20"
      >
        <div className="landing-hero-media absolute inset-0" />
        <div className="landing-hero-scrim absolute inset-0 z-0" />

        <div className="container relative z-1">
          <div
            className="text-center max-w-900 mx-auto"
          >
            <div
              className="landing-kicker inline-flex items-center gap-2 font-bold rounded-full text-xs uppercase mb-6 tracking-wider bg-indigo-15 text-indigo-light"
            >
              🇮🇳 India-first creator collaboration workspace
            </div>

            <h1
              className="landing-hero-title mb-6 font-extrabold"
            >
              <span
                className="landing-gradient-word inline-block"
              >
                Decisional
              </span>
              <span
                className="landing-hero-tagline block font-semibold mt-3-5"
              >
                Turning Signals into Decisions
              </span>
            </h1>

            <p
              className="landing-hero-copy max-w-600 leading-relaxed"
            >
              Run influencer campaigns with verified profiles, signed
              deliverables, payment protection, content approvals, and dispute
              records in one mobile-ready workspace.
            </p>

            <div
              className="hero-cta-group flex gap-4 justify-center flex-wrap mb-5"
            >
              <Link
                href="/register?type=influencer"
                className="landing-cta landing-cta-primary inline-flex items-center justify-center gap-2 font-bold rounded-lg text-sm no-underline text-white"
              >
                I&apos;m an Influencer
              </Link>
              <Link
                href="/register?type=brand"
                className="landing-cta landing-cta-secondary inline-flex items-center justify-center gap-2 font-bold rounded-lg text-sm no-underline text-white backdrop-blur"
              >
                I&apos;m a Brand
              </Link>
            </div>

            <div
              className="flex gap-3 justify-center flex-wrap mb-5"
            >
              <PWAInstallButton
                platform="ios"
                variant="store"
                label="Download for iOS"
              />
              <PWAInstallButton
                platform="android"
                variant="store"
                label="Download for Android"
              />
            </div>

            <div
              className="flex gap-6 justify-center flex-wrap mb-2"
            >
              {["🔒 Secure sessions", "💳 Protected payments", "📱 Installable PWA"].map((item) => (
                <span
                  key={item}
                  className="landing-proof-item text-sm flex items-center gap-1-5"
                >
                  {item}
                </span>
              ))}
            </div>

            <HeroProductMockup />

            <div
              className="landing-trust-strip animate-fade-in w-full text-center"
            >
              <p
                className="text-xs text-muted mb-4 font-semibold uppercase tracking-wider"
              >
                Trusted by India&apos;s fastest growing brands
              </p>
              <div
                className="landing-brand-row flex justify-center items-center gap-6 flex-wrap"
              >
                {["FitForma", "Myntra", "Mamaearth", "Nykaa", "Boat", "Lenskart"].map((brand) => (
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
      </section>

      {/* ==================== FEATURES ==================== */}
      <section
        id="features"
        className="section mesh-bg relative"
      >
        <div className="container">
          <RevealOnScroll>
            <h2 className="section-title">
              Why Choose <span className="gradient-text">Decisional</span>?
            </h2>
          </RevealOnScroll>
          <RevealOnScroll delay={0.1}>
            <p className="section-subtitle">
              Built with trust as the foundation. Every feature is designed to
              protect both creators and brands.
            </p>
          </RevealOnScroll>

          <div className="grid-3">
            {homeFeatures.map((feature, index) => (
              <RevealOnScroll key={feature.title} delay={index * 0.08}>
                <div className="card hover-lift h-full">
                  <div className="feature-icon">{getFeatureIcon(feature.icon)}</div>
                  <h3
                    className="text-lg font-bold mb-2"
                  >
                    {feature.title}
                  </h3>
                  <p
                    className="text-secondary text-sm leading-relaxed"
                  >
                    {feature.description}
                  </p>
                </div>
              </RevealOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== HOW IT WORKS ==================== */}
      <section
        id="how-it-works"
        className="section bg-secondary"
      >
        <div className="container">
          <RevealOnScroll>
            <h2 className="section-title">
              How It <span className="gradient-text">Works</span>
            </h2>
          </RevealOnScroll>
          <RevealOnScroll delay={0.1}>
            <p className="section-subtitle">
              Simple, transparent, and secure. Here&apos;s your journey on
              Decisional.
            </p>
          </RevealOnScroll>

          <RevealOnScroll delay={0.15}>
            <div
              className="landing-segmented flex justify-center gap-1 bg-tertiary p-1 mb-10 rounded-full"
            >
              <Button
                type="button"
                variant="ghost"
                onClick={() => setActiveTab("influencer")}
                className="landing-segmented-button flex-1 text-sm rounded-full"
                data-active={activeTab === "influencer"}
              >
                For Influencers
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setActiveTab("brand")}
                className="landing-segmented-button flex-1 text-sm rounded-full"
                data-active={activeTab === "brand"}
              >
                For Brands
              </Button>
            </div>
          </RevealOnScroll>

          <div
            className="landing-steps flex flex-col gap-4 mx-auto"
          >
            {homeSteps.map((step, index) => {
              const currentStep =
                activeTab === "influencer" ? step.forInfluencer : step.forBrand;
              return (
                <RevealOnScroll
                  key={`${activeTab}-${index}`}
                  delay={index * 0.1}
                >
                  <div
                    className="card hover-lift step-card flex items-center gap-5"
                  >
                    <div
                      className="landing-step-number flex items-center justify-center font-extrabold flex-shrink-0 bg-gradient-primary rounded-full text-2xl"
                    >
                      {currentStep.step}
                    </div>
                    <div className="flex-1">
                      <h3
                        className="font-bold mb-1 text-base"
                      >
                        {currentStep.title}
                      </h3>
                      <p
                        className="text-secondary text-sm leading-relaxed"
                      >
                        {currentStep.description}
                      </p>
                    </div>
                  </div>
                </RevealOnScroll>
              );
            })}
          </div>
        </div>
      </section>

      {/* ==================== TESTIMONIALS ==================== */}
      <section className="section">
        <div className="container">
          <RevealOnScroll>
            <h2 className="section-title">
              Loved by <span className="gradient-text">Creators & Brands</span>
            </h2>
          </RevealOnScroll>
          <RevealOnScroll delay={0.1}>
            <p className="section-subtitle">
              See how matching profiles, secure escrows, and gamified growth help run trusted partnerships.
            </p>
          </RevealOnScroll>

          <div className="grid-3">
            {homeTestimonials.map((testimonial, index) => (
              <RevealOnScroll key={testimonial.name} delay={index * 0.1}>
                <div
                  className="card hover-lift text-center h-full"
                >
                  <div
                    className="landing-testimonial-avatar avatar avatar-xl relative overflow-hidden rounded-full"
                  >
                    <Image
                      src={testimonial.avatar}
                      alt={testimonial.name}
                      width={80}
                      height={80}
                      className="object-cover w-full h-full rounded-full"
                    />
                  </div>
                  <h4 className="text-base font-bold">
                    {testimonial.name}
                  </h4>
                  <p
                    className="text-xs text-muted mb-1"
                  >
                    {testimonial.role}
                    {testimonial.followers &&
                      testimonial.followers !== "Brand" &&
                      ` - ${testimonial.followers} followers`}
                  </p>
                  
                  {renderStars(testimonial.rating)}

                  <p
                    className="text-secondary text-sm leading-relaxed italic"
                  >
                    &quot;{testimonial.quote}&quot;
                  </p>
                </div>
              </RevealOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== PRICING ==================== */}
      <section
        id="pricing"
        className="section bg-secondary"
      >
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

          <div
            className="grid-2 max-w-800 mx-auto"
          >
            <RevealOnScroll delay={0.15}>
              <div
                className="card hover-lift text-center h-full flex flex-col"
              >
                <div className="flex-1">
                  <h3
                    className="font-extrabold mb-2 text-2xl"
                  >
                    For Influencers
                  </h3>
                  <div
                    className="landing-price mb-1 font-extrabold"
                  >
                    <span className="gradient-text">FREE</span>
                  </div>
                  <p
                    className="text-muted mb-6 text-sm"
                  >
                    to join & apply
                  </p>
                  <ul
                    className="text-left mb-6 list-none"
                  >
                    {[
                      "Profile, portfolio, and verification",
                      "Campaign discovery and applications",
                      "Clear payout before deal signing",
                      "Levels, badges, and referral benefits",
                      "Protected settlement after approval",
                    ].map((item) => (
                      <li
                        key={item}
                        className="landing-check-row border-b-card text-secondary text-sm flex items-center gap-2-5"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="flex-shrink-0 text-primary-light"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Link
                  href="/register?type=influencer"
                  className="btn btn-secondary w-full mt-4"
                >
                  Join as Influencer
                </Link>
              </div>
            </RevealOnScroll>

            <RevealOnScroll delay={0.25}>
              <div
                className="card card-gradient pricing-popular hover-lift text-center h-full flex flex-col"
              >
                <div className="flex-1">
                  <div
                    className="badge badge-primary mb-4"
                  >
                    Popular for teams
                  </div>
                  <h3
                    className="font-extrabold mb-2 text-2xl"
                  >
                    For Brands
                  </h3>
                  <div
                    className="landing-price mb-1 font-extrabold"
                  >
                    <span className="gradient-text">10%</span>
                  </div>
                  <p
                    className="text-muted mb-6 text-sm"
                  >
                    of campaign budget
                  </p>
                  <ul
                    className="text-left mb-6 list-none"
                  >
                    {[
                      "Verified creator discovery",
                      "Protected payment escrow workflow",
                      "Contract and approval flow",
                      "Post verification system",
                      "Dispute resolution included",
                    ].map((item) => (
                      <li
                        key={item}
                        className="landing-check-row border-b-card text-secondary text-sm flex items-center gap-2-5"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="flex-shrink-0 text-emerald"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Link
                  href="/register?type=brand"
                  className="btn btn-primary w-full mt-4"
                >
                  Start Your Campaign
                </Link>
              </div>
            </RevealOnScroll>
          </div>
        </div>
      </section>

      {/* ==================== CTA ==================== */}
      <RevealOnScroll>
        <section
          className="landing-final-cta section text-center relative overflow-hidden bg-gradient-primary"
        >
          <div className="landing-final-cta-texture absolute inset-0" />

          <div
            className="container relative z-1"
          >
            <h2
              className="landing-cta-title mb-4 font-extrabold tracking-normal"
            >
              Ready to Get Started?
            </h2>
            <p
              className="landing-cta-copy mb-8 leading-relaxed opacity-90"
            >
              Create a free account, install the PWA, and manage campaigns from
              web, iOS home screen, or Android home screen.
            </p>
            <Link
              href="/register"
              className="landing-cta-inverse btn btn-lg font-bold"
            >
              Create Free Account
            </Link>
          </div>
        </section>
      </RevealOnScroll>

      <Footer />
      </div>
    </div>
  );
}
