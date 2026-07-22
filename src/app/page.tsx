"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useRef, ReactNode } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PWAInstallButton from "@/components/pwa/PWAInstallButton";
import { Button } from "@/components/ui/Button";
import {
  homeFeatures,
  homeSteps,
  homeTestimonials,
} from "@/lib/home-content";

/* ============ Scroll-triggered animation hook ============ */
function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setIsInView(true);
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, isInView };
}

function RevealOnScroll({
  children,
  delay = 0,
  className = "",
}: Readonly<{
  children: ReactNode;
  delay?: number;
  className?: string;
}>) {
  const { ref, isInView } = useInView();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: isInView ? 1 : 0,
        transform: isInView ? "translateY(0)" : "translateY(32px)",
        transition: `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

// Icon Mapping Function
function getFeatureIcon(iconKey: string) {
  switch (iconKey) {
    case "PAY":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary-light">
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      );
    case "TR":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-secondary-light)" }}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "CT":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-cyan">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    case "MT":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      );
    case "XP":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34" />
          <path d="M12 2a6 6 0 0 1 6 6v3.5a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8a6 6 0 0 1 6-6z" />
        </svg>
      );
    case "PV":
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-accent-purple)" }}>
          <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    default:
      return null;
  }
}

// Gold star ratings renderer
function renderStars(rating: number) {
  const starKeys = ["star-1", "star-2", "star-3", "star-4", "star-5"];
  return (
    <div className="flex justify-center gap-1 mb-4 text-amber">
      {starKeys.slice(0, rating).map((key) => (
        <svg key={key} width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

/* ============ Interactive Mockup Component ============ */
function HeroProductMockup() {
  const [view, setView] = useState<"influencer" | "brand">("influencer");

  return (
    <div
      className="animate-fade-in flex flex-col items-center gap-4 w-full max-w-840" style={{ marginTop: "48px", marginInline: "auto" }}
    >
      {/* Mockup View Selector */}
      <div
        className="inline-flex bg-secondary p-1 border-card rounded-full"
      >
        <Button
          type="button"
          variant="ghost"
          onClick={() => setView("influencer")}
          className="text-sm font-semibold border-none px-4-py-2 rounded-full" style={{ background: view === "influencer" ? "var(--color-bg-tertiary)" : "transparent", color: view === "influencer" ? "white" : "var(--color-text-secondary)", transition: "all var(--transition-fast)" }}
        >
          Influencer View
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setView("brand")}
          className="text-sm font-semibold border-none px-4-py-2 rounded-full" style={{ background: view === "brand" ? "var(--color-bg-tertiary)" : "transparent", color: view === "brand" ? "white" : "var(--color-text-secondary)", transition: "all var(--transition-fast)" }}
        >
          Brand View
        </Button>
      </div>

      {/* Main Glassmorphic Container */}
      <div
        className="w-full p-6 text-left relative overflow-hidden bg-glass rounded-xl backdrop-blur-lg" style={{ WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255, 255, 255, 0.08)", boxShadow: "0 24px 50px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)" }}
      >
        {/* Glow Effects */}
        <div
          className="absolute rounded-full pointer-events-none bg-color-primary" style={{ top: "-50px", right: "-50px", width: "150px", height: "150px", filter: "blur(80px)", opacity: 0.15 }}
        />
        <div
          className="absolute rounded-full pointer-events-none" style={{ bottom: "-50px", left: "-50px", width: "150px", height: "150px", background: "var(--color-secondary)", filter: "blur(80px)", opacity: 0.15 }}
        />

        {/* Mockup Header */}
        <div
          className="flex items-center justify-between mb-5 pb-4" style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}
        >
          <div className="flex items-center gap-2">
            <span
              className="rounded-full" style={{ width: "10px", height: "10px", background: "var(--color-success)", boxShadow: "0 0 8px var(--color-success)" }}
            />
            <span className="text-sm font-bold text-white">
              {view === "influencer" ? "Influencer Workspace" : "Brand Campaign Control"}
            </span>
          </div>
          <span className="text-xs text-muted">
            Live Escrow Protection Active 🔒
          </span>
        </div>

        {view === "influencer" ? (
          /* ============ INFLUENCER DASHBOARD MOCK ============ */
          <div className="flex flex-col gap-5">
            {/* Top Stats Row */}
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
              <div className="bg-glass rounded-lg px-4-py-3" style={{ border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                <span className="text-muted block text-xs">Wallet Balance</span>
                <span className="text-xl font-extrabold text-white">₹42,850</span>
              </div>
              <div className="bg-glass rounded-lg px-4-py-3" style={{ border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                <span className="text-muted block text-xs">Trust Score</span>
                <span className="text-xl font-extrabold text-emerald">98% <span className="text-xs font-normal">(Excellent)</span></span>
              </div>
              <div className="bg-glass rounded-lg px-4-py-3" style={{ border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                <span className="text-muted block text-xs">Gamification Tier</span>
                <span className="text-xl font-extrabold text-amber">Gold IV 🏆</span>
              </div>
            </div>

            {/* Active Deal Status */}
            <div className="p-4 bg-glass rounded-lg" style={{ border: "1px solid rgba(255, 255, 255, 0.06)" }}>
              <div className="flex justify-between mb-3">
                <div>
                  <h4 className="text-sm font-bold mb-1 text-white">Nike India: Air Max Launch</h4>
                  <span className="text-xs text-secondary">Deliverable: 1 Instagram Reel + 1 Story</span>
                </div>
                <div className="inline-flex text-xs font-semibold bg-emerald-subtle text-emerald rounded-sm px-2-py-1" style={{ height: "fit-content" }}>
                  ₹25,000 in Escrow
                </div>
              </div>

              {/* Status Stepper */}
              <div className="flex items-center justify-between relative mt-5">
                {/* Stepper Background Line */}
                <div className="absolute z-0" style={{ left: "20px", right: "20px", height: "2px", background: "rgba(255, 255, 255, 0.1)" }} />
                
                {/* Stepper Active Line */}
                <div className="absolute bg-color-primary z-0" style={{ left: "20px", width: "50%", height: "2px" }} />

                {/* Step 1: Signed */}
                <div className="flex flex-col items-center relative gap-1-5 z-1">
                  <div className="flex items-center justify-center text-xs font-bold rounded-full text-white w-24 h-24 bg-color-primary">✓</div>
                  <span className="font-semibold text-2xs text-white">Signed</span>
                </div>

                {/* Step 2: Escrow Verified */}
                <div className="flex flex-col items-center relative gap-1-5 z-1">
                  <div className="flex items-center justify-center text-xs font-bold rounded-full text-white w-24 h-24 bg-color-primary">✓</div>
                  <span className="font-semibold text-2xs text-white">Escrowed</span>
                </div>

                {/* Step 3: Submission Under Review */}
                <div className="flex flex-col items-center relative gap-1-5 z-1">
                  <div className="flex items-center justify-center text-xs rounded-full bg-tertiary text-white w-24 h-24" style={{ border: "2px solid var(--color-primary)", animation: "pulse 2s infinite" }}>●</div>
                  <span className="font-semibold text-2xs text-white">Reviewing</span>
                </div>

                {/* Step 4: Complete & Disbursed */}
                <div className="flex flex-col items-center relative gap-1-5 z-1">
                  <div className="flex items-center justify-center text-muted rounded-full bg-tertiary text-2xs w-24 h-24" style={{ border: "1px solid rgba(255, 255, 255, 0.2)" }}>🔒</div>
                  <span className="text-muted text-2xs">Payout</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ============ BRAND DASHBOARD MOCK ============ */
          <div className="flex flex-col gap-5">
            {/* Top Stats Row */}
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
              <div className="bg-glass rounded-lg px-4-py-3" style={{ border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                <span className="text-muted block text-xs">Active Campaigns</span>
                <span className="text-xl font-extrabold text-white">3 Campaigns</span>
              </div>
              <div className="bg-glass rounded-lg px-4-py-3" style={{ border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                <span className="text-muted block text-xs">Secured Escrow</span>
                <span className="text-xl font-extrabold text-cyan">₹1,85,000</span>
              </div>
              <div className="bg-glass rounded-lg px-4-py-3" style={{ border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                <span className="text-muted block text-xs">ROI Index</span>
                <span className="text-xl font-extrabold text-emerald">3.8x Profit</span>
              </div>
            </div>

            {/* Campaign Submissions */}
            <div className="p-4 bg-glass rounded-lg" style={{ border: "1px solid rgba(255, 255, 255, 0.06)" }}>
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-sm font-bold text-white">Submissions Awaiting Approval (1)</h4>
                <span className="flex items-center gap-1 text-xs text-amber">
                  <span className="rounded-full h-6" style={{ width: "6px", background: "var(--color-accent-amber)", animation: "pulse 1.5s infinite" }} />{" "}
                  48h Review Timer Running
                </span>
              </div>

              {/* Creator Submission list item */}
              <div className="flex items-center justify-between p-3 flex-wrap bg-glass rounded-md gap-2-5" style={{ border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                <div className="flex items-center gap-2-5">
                  <div className="flex items-center justify-center font-extrabold text-xs rounded-full text-white w-32 h-32 bg-color-primary">
                    AM
                  </div>
                  <div>
                    <span className="text-sm font-semibold block text-white">Ananya Mehta</span>
                    <span className="text-secondary text-xs">Instagram post content ready for review</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" className="text-xs rounded-sm px-3-py-1 bg-none text-white" style={{ border: "1px solid rgba(255, 255, 255, 0.1)" }}>
                    View Draft
                  </Button>
                  <Button type="button" variant="primary" className="font-semibold border-none text-xs rounded-sm px-3-py-1 bg-gradient-primary text-white" style={{ boxShadow: "var(--shadow-glow-primary)" }}>
                    Approve
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============ HOMEPAGE ============ */
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
        {/* Hero Background — CSS background-image avoids Next/Image fill position issues */}
        <div
          className="absolute inset-0" style={{ zIndex: 0, backgroundImage: "url('https://images.unsplash.com/photo-1639762681485-074b7f938ba0?q=80&w=2574&auto=format&fit=crop')", backgroundSize: "cover", backgroundPosition: "center", opacity: 0.18, filter: "blur(4px)", transform: "scale(1.05)" }}
        />
        {/* Gradient Overlay */}
        <div
          className="absolute inset-0" style={{ zIndex: 0, background:
              "radial-gradient(circle at center, rgba(10, 10, 20, 0.6) 0%, var(--color-bg-primary) 95%)" }}
        />

        <div className="container relative z-1">
          <div
            className="text-center max-w-900 mx-auto"
          >
            {/* Badge — fully inline-styled for guaranteed rendering */}
            <div
              className="inline-flex items-center gap-2 font-bold rounded-full text-xs uppercase mb-6 tracking-wider" style={{ background: "rgba(99, 102, 241, 0.15)", border: "1px solid rgba(129, 140, 248, 0.5)", padding: "6px 20px", color: "#a5b4fc" }}
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

            {/* CTA buttons */}
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

            {/* PWA download buttons */}
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

            {/* Security trust badges */}
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

            {/* Product Mockup Component */}
            <HeroProductMockup />

            {/* Social Proof Brand Strip */}
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
          className="hide-mobile absolute flex flex-col items-center gap-2 cursor-pointer border-none p-0 bg-none" style={{ bottom: "32px", left: "50%", transform: "translateX(-50%)", animation: "float 3s ease-in-out infinite", opacity: 0.5 }}
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

          {/* Tab Switcher */}
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

          {/* Steps */}
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
                  
                  {/* Premium star ratings */}
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
          {/* Background pattern */}
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
              className="mb-8 leading-relaxed" style={{ fontSize: "clamp(15px, 2vw, 18px)", opacity: 0.9, maxWidth: "500px", margin: "0 auto 32px" }}
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
