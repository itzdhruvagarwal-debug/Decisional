"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useRef, ReactNode } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

// Stats that animate
const stats = [
  { value: 50000, suffix: "+", label: "Influencers" },
  { value: 2500, suffix: "+", label: "Brands" },
  { value: 10, suffix: "Cr+", label: "Paid Out" },
  { value: 2, suffix: "h", label: "Payment Time" },
];

// Features
const features = [
  {
    icon: "💰",
    title: "Guaranteed Payments",
    description:
      "Money is pre-authorized before work begins. Auto-released within 2 hours of verified posting.",
  },
  {
    icon: "🛡️",
    title: "Fraud Protection",
    description:
      "Multi-layer verification, fake follower detection, and trust scores protect everyone.",
  },
  {
    icon: "📝",
    title: "Smart Contracts",
    description:
      "Clear deliverables, timelines, and revision policies. No room for disputes.",
  },
  {
    icon: "⚡",
    title: "Instant Matching",
    description:
      "Our algorithm matches brands with perfect influencers based on niche, reach, and engagement.",
  },
  {
    icon: "🏆",
    title: "Gamified Experience",
    description:
      "Earn XP, unlock badges, climb leaderboards. The more you work, the more perks you get.",
  },
  {
    icon: "🔍",
    title: "Post Verification",
    description:
      "Automated verification confirms posts are live, properly tagged, and meet requirements.",
  },
];

// How it works steps
const steps = [
  {
    forInfluencer: {
      step: 1,
      title: "Create Profile",
      description: "Connect your social accounts and build your portfolio",
    },
    forBrand: {
      step: 1,
      title: "Launch Campaign",
      description: "Define your goals, budget, and target audience",
    },
  },
  {
    forInfluencer: {
      step: 2,
      title: "Apply to Campaigns",
      description: "Browse opportunities and submit compelling proposals",
    },
    forBrand: {
      step: 2,
      title: "Select Creators",
      description: "Review applications and choose the perfect fit",
    },
  },
  {
    forInfluencer: {
      step: 3,
      title: "Create & Post",
      description: "Deliver amazing content and post when approved",
    },
    forBrand: {
      step: 3,
      title: "Approve Content",
      description: "Review submissions and request revisions if needed",
    },
  },
  {
    forInfluencer: {
      step: 4,
      title: "Get Paid Fast",
      description: "Money auto-releases to your wallet in 2 hours",
    },
    forBrand: {
      step: 4,
      title: "Track Results",
      description: "Monitor engagement and measure campaign ROI",
    },
  },
];

// Testimonials
const testimonials = [
  {
    name: "Priya Sharma",
    role: "Fashion Influencer",
    followers: "120K",
    avatar:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=128&auto=format&fit=crop",
    quote:
      "Finally a platform where I get paid on time! The 2-hour payment release is a game-changer.",
    rating: 5,
  },
  {
    name: "Arjun Mehta",
    role: "Tech Brand Manager",
    avatar:
      "https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=128&auto=format&fit=crop",
    quote:
      "We've run 15 campaigns with zero fraud. The verification system is incredible.",
    rating: 5,
  },
  {
    name: "Rahul Verma",
    role: "Food Creator",
    followers: "85K",
    avatar:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=128&auto=format&fit=crop",
    quote:
      "The Gamified referral system keeps me motivated. I hit Platinum and now I get a solid 2% fee discount plus lifetime GMV shares!",
    rating: 5,
  },
];

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
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
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

/* ============ Animated Counter ============ */
function AnimatedCounter({ value, suffix }: { value: number; suffix: string }) {
  const [count, setCount] = useState(0);
  const { ref, isInView } = useInView();

  useEffect(() => {
    if (!isInView) return;
    const duration = 2000;
    const steps = 60;
    const increment = value / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [isInView, value]);

  return (
    <span ref={ref}>
      {count.toLocaleString("en-IN")}
      {suffix}
    </span>
  );
}

/* ============ HOMEPAGE ============ */
export default function HomePage() {
  const [activeTab, setActiveTab] = useState<"influencer" | "brand">(
    "influencer",
  );

  return (
    <div style={{ minHeight: "100vh" }}>
      <Navbar />

      {/* ==================== HERO ==================== */}
      <section
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: "80px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Realistic Hero Background with Overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
          }}
        >
          <img
            src="https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=2574&auto=format&fit=crop"
            alt="Creator Workspace"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: 0.2, // Low opacity to blend with dark theme
              filter: "blur(4px)",
              transform: "scale(1.1)", // Slight zoom for cinematic feel
            }}
          />
          {/* Gradient Overlay */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at center, rgba(10, 10, 20, 0.7) 0%, rgba(10, 10, 20, 1) 90%)",
            }}
          />
        </div>

        {/* Animated Orbs (Subtle on top of image) */}
        <div
          className="bg-orb animate-blob"
          style={{
            top: "20%",
            left: "10%",
            width: "500px",
            height: "500px",
            background:
              "radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)",
            zIndex: 0,
          }}
        />
        <div
          className="bg-orb animate-blob"
          style={{
            bottom: "10%",
            right: "10%",
            width: "450px",
            height: "450px",
            background:
              "radial-gradient(circle, rgba(236, 72, 153, 0.12) 0%, transparent 70%)",
            animationDelay: "2s",
            zIndex: 0,
          }}
        />

        <div className="container" style={{ position: "relative", zIndex: 1 }}>
          <div
            style={{ textAlign: "center", maxWidth: "900px", margin: "0 auto" }}
          >
            <div
              className="badge badge-primary animate-fade-in"
              style={{ marginBottom: "24px", animationDelay: "0.2s" }}
            >
              🎉 Now Live in India
            </div>

            <h1
              className="animate-fade-in"
              style={{
                fontSize: "clamp(36px, 6vw, 72px)",
                fontWeight: 900,
                lineHeight: 1.08,
                marginBottom: "24px",
                letterSpacing: "-0.03em",
                animationDelay: "0.3s",
              }}
            >
              <span className="gradient-text-animated">Decisional</span>
              <span
                style={{
                  display: "block",
                  fontSize: "0.5em",
                  marginTop: "16px",
                  fontWeight: 600,
                  color: "white",
                }}
              >
                Turning Signals into Decisions
              </span>
            </h1>

            <p
              className="animate-fade-in"
              style={{
                fontSize: "clamp(16px, 2.2vw, 20px)",
                color: "var(--color-text-secondary)",
                maxWidth: "620px",
                margin: "0 auto 40px",
                lineHeight: 1.7,
                animationDelay: "0.5s",
              }}
            >
              A system that turns reach, data, and actions into clear
              decisions. Secure pre-authorized payments, verified creators, and
              2-hour payment release guarantee.
            </p>

            <div
              className="animate-fade-in hero-cta-group"
              style={{
                display: "flex",
                gap: "16px",
                justifyContent: "center",
                flexWrap: "wrap",
                animationDelay: "0.7s",
              }}
            >
              <Link
                href="/register?type=influencer"
                className="btn btn-primary btn-lg"
              >
                I&apos;m an Influencer
              </Link>
              <Link
                href="/register?type=brand"
                className="btn btn-secondary btn-lg"
              >
                I&apos;m a Brand
              </Link>
            </div>


            <p
              className="animate-fade-in"
              style={{
                marginTop: "28px",
                fontSize: "13px",
                color: "var(--color-text-muted)",
                display: "flex",
                gap: "16px",
                justifyContent: "center",
                flexWrap: "wrap",
                animationDelay: "0.9s",
              }}
            >
              <span>🔒 100% Secure</span>
              <span>💳 Pre-authorized Payments</span>
              <span>⚡ 2h Payment Release</span>
            </p>
          </div>
        </div>

        {/* Scroll indicator */}
        <div
          className="hide-mobile"
          style={{
            position: "absolute",
            bottom: "32px",
            left: "50%",
            transform: "translateX(-50%)",
            animation: "float 2s ease-in-out infinite",
            opacity: 0.4,
            fontSize: "24px",
          }}
        >
          ↓
        </div>
      </section>

      {/* ==================== STATS ==================== */}
      <section
        style={{
          padding: "60px 0",
          background: "var(--color-bg-secondary)",
          borderTop: "1px solid var(--color-border)",
          borderBottom: "1px solid var(--color-border)",
          position: "relative",
        }}
      >
        <div className="container">
          <div className="grid-4">
            {stats.map((stat, index) => (
              <RevealOnScroll key={index} delay={index * 0.08}>
                <div className="stat-card">
                  <div className="stat-value gradient-text">
                    <AnimatedCounter value={stat.value} suffix={stat.suffix} />
                  </div>
                  <div className="stat-label">{stat.label}</div>
                </div>
              </RevealOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== FEATURES ==================== */}
      <section
        id="features"
        className="section mesh-bg"
        style={{ position: "relative" }}
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
            {features.map((feature, index) => (
              <RevealOnScroll key={index} delay={index * 0.08}>
                <div className="card hover-lift" style={{ height: "100%" }}>
                  <div className="feature-icon">{feature.icon}</div>
                  <h3
                    style={{
                      fontSize: "18px",
                      fontWeight: 700,
                      marginBottom: "10px",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {feature.title}
                  </h3>
                  <p
                    style={{
                      color: "var(--color-text-secondary)",
                      fontSize: "14px",
                      lineHeight: 1.7,
                    }}
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
        className="section"
        style={{
          background: "var(--color-bg-secondary)",
        }}
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
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "4px",
                marginBottom: "48px",
                background: "var(--color-bg-tertiary)",
                borderRadius: "var(--radius-full)",
                padding: "4px",
                maxWidth: "320px",
                margin: "0 auto 48px",
              }}
            >
              <button
                className="btn"
                onClick={() => setActiveTab("influencer")}
                style={{
                  flex: 1,
                  background:
                    activeTab === "influencer"
                      ? "var(--gradient-primary)"
                      : "transparent",
                  color:
                    activeTab === "influencer"
                      ? "white"
                      : "var(--color-text-secondary)",
                  boxShadow:
                    activeTab === "influencer"
                      ? "var(--shadow-glow-primary)"
                      : "none",
                  borderRadius: "var(--radius-full)",
                  padding: "10px 20px",
                  fontSize: "13px",
                }}
              >
                For Influencers
              </button>
              <button
                className="btn"
                onClick={() => setActiveTab("brand")}
                style={{
                  flex: 1,
                  background:
                    activeTab === "brand"
                      ? "var(--gradient-primary)"
                      : "transparent",
                  color:
                    activeTab === "brand"
                      ? "white"
                      : "var(--color-text-secondary)",
                  boxShadow:
                    activeTab === "brand"
                      ? "var(--shadow-glow-primary)"
                      : "none",
                  borderRadius: "var(--radius-full)",
                  padding: "10px 20px",
                  fontSize: "13px",
                }}
              >
                For Brands
              </button>
            </div>
          </RevealOnScroll>

          {/* Steps */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              maxWidth: "700px",
              margin: "0 auto",
            }}
          >
            {steps.map((step, index) => {
              const currentStep =
                activeTab === "influencer" ? step.forInfluencer : step.forBrand;
              return (
                <RevealOnScroll
                  key={`${activeTab}-${index}`}
                  delay={index * 0.1}
                >
                  <div
                    className="card hover-lift"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "20px",
                    }}
                  >
                    <div
                      style={{
                        width: "56px",
                        height: "56px",
                        background: "var(--gradient-primary)",
                        borderRadius: "var(--radius-full)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "22px",
                        fontWeight: 800,
                        flexShrink: 0,
                        boxShadow: "var(--shadow-glow-primary)",
                      }}
                    >
                      {currentStep.step}
                    </div>
                    <div style={{ flex: 1 }}>
                      <h3
                        style={{
                          fontSize: "17px",
                          fontWeight: 700,
                          marginBottom: "4px",
                        }}
                      >
                        {currentStep.title}
                      </h3>
                      <p
                        style={{
                          color: "var(--color-text-secondary)",
                          fontSize: "14px",
                          lineHeight: 1.6,
                        }}
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
              Loved by <span className="gradient-text">Thousands</span>
            </h2>
          </RevealOnScroll>
          <RevealOnScroll delay={0.1}>
            <p className="section-subtitle">
              Don&apos;t just take our word for it. Here&apos;s what our
              community says.
            </p>
          </RevealOnScroll>

          <div className="grid-3">
            {testimonials.map((testimonial, index) => (
              <RevealOnScroll key={index} delay={index * 0.1}>
                <div
                  className="card hover-lift"
                  style={{ textAlign: "center", height: "100%" }}
                >
                  <div
                    className="avatar avatar-xl"
                    style={{
                      margin: "0 auto 16px",
                      border: "2px solid var(--color-primary)",
                      position: "relative",
                      width: "80px",
                      height: "80px",
                      overflow: "hidden",
                      borderRadius: "50%",
                    }}
                  >
                    <Image
                      src={testimonial.avatar}
                      alt={testimonial.name}
                      fill
                      sizes="80px"
                      style={{ objectFit: "cover" }}
                    />
                  </div>
                  <h4 style={{ fontSize: "16px", fontWeight: 700 }}>
                    {testimonial.name}
                  </h4>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "var(--color-text-muted)",
                      marginBottom: "6px",
                    }}
                  >
                    {testimonial.role}
                    {testimonial.followers &&
                      ` • ${testimonial.followers} followers`}
                  </p>
                  {/* Stars */}
                  <div style={{ marginBottom: "16px", fontSize: "14px" }}>
                    {"⭐".repeat(testimonial.rating)}
                  </div>
                  <p
                    style={{
                      color: "var(--color-text-secondary)",
                      fontSize: "14px",
                      lineHeight: 1.7,
                      fontStyle: "italic",
                    }}
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
        className="section"
        style={{
          background: "var(--color-bg-secondary)",
        }}
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
            className="grid-2"
            style={{ maxWidth: "800px", margin: "0 auto" }}
          >
            <RevealOnScroll delay={0.15}>
              <div
                className="card hover-lift"
                style={{ textAlign: "center", height: "100%" }}
              >
                <h3
                  style={{
                    fontSize: "22px",
                    fontWeight: 800,
                    marginBottom: "8px",
                  }}
                >
                  For Influencers
                </h3>
                <div
                  style={{
                    fontSize: "clamp(40px, 5vw, 48px)",
                    fontWeight: 900,
                    marginBottom: "4px",
                  }}
                >
                  <span className="gradient-text">FREE</span>
                </div>
                <p
                  style={{
                    color: "var(--color-text-muted)",
                    marginBottom: "24px",
                    fontSize: "14px",
                  }}
                >
                  to join & apply
                </p>
                <ul
                  style={{
                    listStyle: "none",
                    textAlign: "left",
                    marginBottom: "24px",
                  }}
                >
                  {[
                    "✓ Create unlimited profile",
                    "✓ Apply to any campaign",
                    "✓ 10% fee on earnings",
                    "✓ Lower fees as you level up",
                    "✓ 2-hour payment guarantee",
                  ].map((item, i) => (
                    <li
                      key={i}
                      style={{
                        padding: "10px 0",
                        borderBottom: "1px solid var(--color-border)",
                        color: "var(--color-text-secondary)",
                        fontSize: "14px",
                      }}
                    >
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register?type=influencer"
                  className="btn btn-secondary"
                  style={{ width: "100%" }}
                >
                  Join as Influencer
                </Link>
              </div>
            </RevealOnScroll>

            <RevealOnScroll delay={0.25}>
              <div
                className="card card-gradient pricing-popular hover-lift"
                style={{
                  textAlign: "center",
                  height: "100%",
                }}
              >
                <div
                  className="badge badge-primary"
                  style={{ marginBottom: "16px" }}
                >
                  ⭐ Most Popular
                </div>
                <h3
                  style={{
                    fontSize: "22px",
                    fontWeight: 800,
                    marginBottom: "8px",
                  }}
                >
                  For Brands
                </h3>
                <div
                  style={{
                    fontSize: "clamp(40px, 5vw, 48px)",
                    fontWeight: 900,
                    marginBottom: "4px",
                  }}
                >
                  <span className="gradient-text">10%</span>
                </div>
                <p
                  style={{
                    color: "var(--color-text-muted)",
                    marginBottom: "24px",
                    fontSize: "14px",
                  }}
                >
                  of campaign budget
                </p>
                <ul
                  style={{
                    listStyle: "none",
                    textAlign: "left",
                    marginBottom: "24px",
                  }}
                >
                  {[
                    "✓ Verified influencer pool",
                    "✓ Pre-authorized payments",
                    "✓ Content approval flow",
                    "✓ Post verification system",
                    "✓ Dispute resolution included",
                  ].map((item, i) => (
                    <li
                      key={i}
                      style={{
                        padding: "10px 0",
                        borderBottom: "1px solid var(--color-border)",
                        color: "var(--color-text-secondary)",
                        fontSize: "14px",
                      }}
                    >
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/register?type=brand"
                  className="btn btn-primary"
                  style={{ width: "100%" }}
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
          className="section"
          style={{
            background: "var(--gradient-primary)",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Background pattern */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "radial-gradient(circle at 20% 80%, rgba(255,255,255,0.06) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.04) 0%, transparent 50%)",
            }}
          />

          <div
            className="container"
            style={{ position: "relative", zIndex: 1 }}
          >
            <h2
              style={{
                fontSize: "clamp(28px, 4vw, 40px)",
                fontWeight: 900,
                marginBottom: "16px",
                letterSpacing: "-0.02em",
              }}
            >
              Ready to Get Started?
            </h2>
            <p
              style={{
                fontSize: "clamp(15px, 2vw, 18px)",
                opacity: 0.9,
                marginBottom: "32px",
                maxWidth: "500px",
                margin: "0 auto 32px",
                lineHeight: 1.7,
              }}
            >
              Join thousands of influencers and brands already growing together
              on Decisional.
            </p>
            <Link
              href="/register"
              className="btn btn-lg"
              style={{
                background: "white",
                color: "var(--color-primary-dark)",
                fontWeight: 700,
                boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
              }}
            >
              Create Free Account →
            </Link>
          </div>
        </section>
      </RevealOnScroll>

      <Footer />
    </div>
  );
}
