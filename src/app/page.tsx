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
      <Navbar />

      {/* ==================== HERO ==================== */}
      <section
        className="relative overflow-hidden pt-30 pb-20"
      >
        <div
          className="absolute inset-0" style={{ zIndex: 0, backgroundImage: "url('https://images.unsplash.com/photo-1639762681485-074b7f938ba0?q=80&w=2574&auto=format&fit=crop')", backgroundSize: "cover", backgroundPosition: "center", opacity: 0.18, filter: "blur(4px)", transform: "scale(1.05)" }}
        />
        <div
          className="absolute inset-0 z-0" style={{ background:
              "radial-gradient(circle at center, rgba(10, 10, 20, 0.6) 0%, var(--color-bg-primary) 95%)" }}
        />

        <div className="container relative z-1">
          <div
            className="text-center max-w-900 mx-auto"
          >
            <div
              className="inline-flex items-center gap-2 font-bold rounded-full text-xs uppercase mb-6 tracking-wider bg-indigo-15 text-indigo-light" style={{ border: "1px solid rgba(129, 140, 248, 0.5)", padding: "6px 20px" }}
            >
              🇮🇳 India-first creator collaboration workspace
            </div>

            <h1
              className="mb-6 font-extrabold" style={{ fontSize: "clamp(40px, 6vw, 76px)", lineHeight: 1.06, letterSpacing: "-1px" }}
            >
              <span
                className="inline-block" style={{ background: "linear-gradient(135deg, #818cf8 0%, #ec4899 55%, #06b6d4 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}
              >
                Decisional
              </span>
              <span
                className="block font-semibold mt-3-5" style={{ fontSize: "0.48em", color: "rgba(240, 240, 245, 0.9)", letterSpacing: "0" }}
              >
                Turning Signals into Decisions
              </span>
            </h1>

            <p
              className="max-w-600 leading-relaxed" style={{ fontSize: "clamp(15px, 2vw, 19px)", color: "rgba(161, 161, 181, 0.9)", margin: "0 auto 40px" }}
            >
              Run influencer campaigns with verified profiles, signed
              deliverables, payment protection, content approvals, and dispute
              records in one mobile-ready workspace.
            </p>

            <div
              className="flex gap-4 justify-center flex-wrap mb-5"
            >
              <Link
                href="/register?type=influencer"
                className="inline-flex items-center justify-center gap-2 font-bold rounded-lg text-sm no-underline text-white" style={{ padding: "14px 28px", background: "linear-gradient(135deg, #6366f1, #4f46e5)", boxShadow: "0 4px 20px rgba(99, 102, 241, 0.4)", border: "1px solid rgba(129, 140, 248, 0.3)", transition: "transform 0.2s, box-shadow 0.2s" }}
              >
                I&apos;m an Influencer
              </Link>
              <Link
                href="/register?type=brand"
                className="inline-flex items-center justify-center gap-2 font-bold rounded-lg text-sm no-underline text-white backdrop-blur" style={{ padding: "14px 28px", background: "rgba(255, 255, 255, 0.06)", border: "1px solid rgba(255, 255, 255, 0.15)", transition: "transform 0.2s, background 0.2s" }}
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
                  className="text-sm flex items-center gap-1-5" style={{ color: "rgba(107, 107, 128, 0.9)" }}
                >
                  {item}
                </span>
              ))}
            </div>

            <HeroProductMockup />

            <div
              className="animate-fade-in w-full text-center" style={{ marginTop: "48px", animationDelay: "1.1s" }}
            >
              <p
                className="text-xs text-muted mb-4 font-semibold uppercase tracking-wider"
              >
                Trusted by India&apos;s fastest growing brands
              </p>
              <div
                className="flex justify-center items-center gap-6 flex-wrap" style={{ opacity: 0.6 }}
              >
                {["FitForma", "Myntra", "Mamaearth", "Nykaa", "Boat", "Lenskart"].map((brand) => (
                  <div
                    key={brand}
                    className="text-sm font-bold bg-glass rounded-sm text-primary" style={{ border: "1px solid rgba(255, 255, 255, 0.05)", padding: "6px 14px", letterSpacing: "0.5px", boxShadow: "0 2px 10px rgba(0,0,0,0.1)" }}
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
          className="hide-mobile absolute flex flex-col items-center gap-2 cursor-pointer border-none p-0 bg-none opacity-50" style={{ bottom: "32px", left: "50%", transform: "translateX(-50%)", animation: "float 3s ease-in-out infinite" }}
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
                    className="text-lg font-bold mb-2" style={{ letterSpacing: "-0.01em" }}
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
              className="flex justify-center gap-1 bg-tertiary p-1 mb-10 rounded-full" style={{ maxWidth: "320px", margin: "0 auto 48px" }}
            >
              <Button
                type="button"
                variant="ghost"
                onClick={() => setActiveTab("influencer")}
                className="flex-1 text-sm rounded-full" style={{ background:
                    activeTab === "influencer"
                      ? "var(--gradient-primary)"
                      : "transparent", color:
                    activeTab === "influencer"
                      ? "white"
                      : "var(--color-text-secondary)", boxShadow:
                    activeTab === "influencer"
                      ? "var(--shadow-glow-primary)"
                      : "none", padding: "10px 20px" }}
              >
                For Influencers
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setActiveTab("brand")}
                className="flex-1 text-sm rounded-full" style={{ background:
                    activeTab === "brand"
                      ? "var(--gradient-primary)"
                      : "transparent", color:
                    activeTab === "brand"
                      ? "white"
                      : "var(--color-text-secondary)", boxShadow:
                    activeTab === "brand"
                      ? "var(--shadow-glow-primary)"
                      : "none", padding: "10px 20px" }}
              >
                For Brands
              </Button>
            </div>
          </RevealOnScroll>

          <div
            className="flex flex-col gap-4 mx-auto" style={{ maxWidth: "700px" }}
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
                      className="flex items-center justify-center font-extrabold flex-shrink-0 bg-gradient-primary rounded-full text-2xl" style={{ width: "56px", height: "56px", boxShadow: "var(--shadow-glow-primary)" }}
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
                    className="avatar avatar-xl relative overflow-hidden rounded-full w-80" style={{ margin: "0 auto 16px", border: "2px solid var(--color-primary)", height: "80px" }}
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
                    className="mb-1 font-extrabold" style={{ fontSize: "clamp(40px, 5vw, 48px)" }}
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
                        className="border-b-card text-secondary text-sm flex items-center gap-2-5" style={{ padding: "12px 0" }}
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
                    className="mb-1 font-extrabold" style={{ fontSize: "clamp(40px, 5vw, 48px)" }}
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
                        className="border-b-card text-secondary text-sm flex items-center gap-2-5" style={{ padding: "12px 0" }}
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
          className="section text-center relative overflow-hidden bg-gradient-primary"
        >
          <div
            className="absolute inset-0" style={{ backgroundImage:
                "radial-gradient(circle at 20% 80%, rgba(255,255,255,0.06) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.04) 0%, transparent 50%)" }}
          />

          <div
            className="container relative z-1"
          >
            <h2
              className="mb-4 font-extrabold tracking-normal" style={{ fontSize: "clamp(28px, 4vw, 40px)" }}
            >
              Ready to Get Started?
            </h2>
            <p
              className="mb-8 leading-relaxed opacity-90" style={{ fontSize: "clamp(15px, 2vw, 18px)", maxWidth: "500px", margin: "0 auto 32px" }}
            >
              Create a free account, install the PWA, and manage campaigns from
              web, iOS home screen, or Android home screen.
            </p>
            <Link
              href="/register"
              className="btn btn-lg font-bold" style={{ background: "white", color: "var(--color-primary-dark)", boxShadow: "0 4px 24px rgba(0,0,0,0.2)" }}
            >
              Create Free Account
            </Link>
          </div>
        </section>
      </RevealOnScroll>

      <Footer />
    </div>
  );
}
