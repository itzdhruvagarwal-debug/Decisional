"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import { motion } from "framer-motion";

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] font-sans">
      <Navbar />

      <main style={{ paddingTop: "120px", paddingBottom: "80px", overflow: "hidden", position: "relative" }}>
        <div
          style={{ maxWidth: "1000px", margin: "0 auto", padding: "0 20px" }}
        >
          {/* Hero Section - Matching Leaderboard Header */}
          <div style={{ textAlign: "center", marginBottom: "60px" }}>
            <motion.h1
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                fontSize: "48px",
                fontWeight: 800,
                background:
                  "linear-gradient(135deg, var(--color-primary), var(--color-accent-cyan))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                marginBottom: "16px",
              }}
            >
              Transparent Pricing
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              style={{ color: "var(--color-text-secondary)", fontSize: "18px" }}
            >
              No hidden fees. Pay only when you succeed.
            </motion.p>
          </div>

          {/* Pricing Cards - Matching Leaderboard Card/Podium Styles */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "32px",
              marginBottom: "80px",
            }}
          >
            {/* Creator Plan */}
            <PricingCard
              title="Creator"
              icon="✨"
              price="FREE"
              subtitle="To Join & Apply"
              description="Start your journey. Keep 90% of your earnings."
              features={[
                "Create unlimited profile",
                "Apply to any campaign",
                "10% platform fee on earnings",
                "Fast secure payouts",
                "Dispute protection",
              ]}
              ctaText="Join as Creator"
              ctaLink="/register?type=influencer"
              color="var(--color-primary)"
              delay={0.2}
            />

            {/* Brand Plan */}
            <PricingCard
              title="Brand"
              icon="💼"
              price="10%"
              subtitle="Service Fee"
              description="Scale your marketing. Pay only for results."
              features={[
                "Access verified influencers",
                "Post unlimited campaigns",
                "Escrow payment security",
                "Content approval workflow",
                "Dedicated support",
              ]}
              ctaText="Start Hiring"
              ctaLink="/register?type=brand"
              color="var(--color-accent-cyan)"
              delay={0.3}
              isPopular
            />
          </div>

          {/* FAQ Section - Matching Leaderboard List Style */}
          <div style={{ maxWidth: "800px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "40px" }}>
              <h2 style={{ fontSize: "28px", fontWeight: 700 }}>
                Frequently Asked Questions
              </h2>
            </div>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "16px" }}
            >
              <FAQItem
                question="Are there any subscription fees?"
                answer="No! Both brands and influencers can join for free. We only charge a small platform fee when a successful deal is made."
                delay={0.4}
              />
              <FAQItem
                question="How does the 10% fee work?"
                answer="For influencers, we deduct 10% from your earnings. For brands, we add a 10% service fee on top of the campaign budget. This covers payment processing, escrow security, and platform maintenance."
                delay={0.5}
              />
              <FAQItem
                question="Can influencers lower their fees?"
                answer="Yes! By referring others through our 5-Tier Gamified Referral Engine, your platform fee can drop by up to 2%. At the Platinum and Diamond tiers, you also unlock a lifetime 1-2% GMV revenue share for your referrals!"
                delay={0.6}
              />
              <FAQItem
                question="Is my money safe?"
                answer="Absolutely. We use an escrow system where funds are held securely until the work is completed and verified. This protects both parties."
                delay={0.7}
              />
            </div>
          </div>

          {/* Bottom CTA */}
          <div
            style={{
              textAlign: "center",
              marginTop: "60px",
              paddingBottom: "40px",
            }}
          >
            <p
              style={{
                color: "var(--color-text-secondary)",
                marginBottom: "16px",
              }}
            >
              Still have questions?
            </p>
            <Link
              href="/contact"
              style={{
                color: "var(--color-primary)",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Contact Support &rarr;
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function PricingCard({
  title,
  icon,
  price,
  subtitle,
  description,
  features,
  ctaText,
  ctaLink,
  color,
  delay,
  isPopular,
}: any) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      style={{
        background: `linear-gradient(135deg, ${color}11, ${color}05)`, // Very subtle gradient like leaderboard
        border: `1px solid ${color}33`,
        borderRadius: "24px",
        padding: "40px",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: isPopular ? `0 10px 40px -10px ${color}33` : "none",
        transform: isPopular ? "scale(1.02)" : "none",
      }}
    >
      {isPopular && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            background: color,
            color: "#000",
            fontSize: "11px",
            fontWeight: 800,
            padding: "6px 16px",
            borderRadius: "0 0 0 16px",
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}
        >
          Most Popular
        </div>
      )}

      <div style={{ marginBottom: "24px" }}>
        <div
          style={{
            width: "60px",
            height: "60px",
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${color}, ${color}88)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "28px",
            marginBottom: "20px",
            boxShadow: `0 8px 20px ${color}44`,
          }}
        >
          {icon}
        </div>
        <h3 style={{ fontSize: "24px", fontWeight: 800, marginBottom: "8px" }}>
          {title}
        </h3>
        <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
          {description}
        </p>
      </div>

      <div
        style={{
          marginBottom: "32px",
          padding: "20px",
          background: "var(--color-bg-tertiary)",
          borderRadius: "16px",
          textAlign: "center",
          border: "1px solid var(--color-border)",
        }}
      >
        <div
          style={{
            fontSize: "42px",
            fontWeight: 900,
            color: "var(--color-text-primary)",
          }}
        >
          {price}
        </div>
        <div
          style={{
            fontSize: "12px",
            fontWeight: 700,
            color: "var(--color-text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}
        >
          {subtitle}
        </div>
      </div>

      <ul
        style={{
          flex: 1,
          marginBottom: "32px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {features.map((f: string, i: number) => (
          <li
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              fontSize: "14px",
              color: "var(--color-text-secondary)",
            }}
          >
            <span style={{ color: color, fontSize: "16px" }}>✓</span> {f}
          </li>
        ))}
      </ul>

      <Link href={ctaLink} style={{ width: "100%" }}>
        <button
          className="btn"
          style={{
            width: "100%",
            background: isPopular
              ? `linear-gradient(135deg, ${color}, ${color}dd)`
              : "var(--color-bg-secondary)",
            color: isPopular ? "#000" : "var(--color-text-primary)",
            border: isPopular ? "none" : `1px solid ${color}44`,
            padding: "16px",
            fontSize: "16px",
            fontWeight: 700,
            cursor: "pointer",
            transition: "transform 0.2s",
          }}
        >
          {ctaText}
        </button>
      </Link>
    </motion.div>
  );
}

function FAQItem({ question, answer, delay }: any) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      style={{
        background: "var(--color-bg-secondary)",
        borderRadius: "16px",
        border: "1px solid var(--color-border)",
        overflow: "hidden",
        transition: "border-color 0.2s",
      }}
    >
      <details style={{ cursor: "pointer" }} className="group">
        <summary
          style={{
            padding: "20px",
            fontWeight: 600,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            listStyle: "none",
          }}
        >
          <span>{question}</span>
          <span
            style={{ transition: "transform 0.3s" }}
            className="group-open:rotate-180"
          >
            ▼
          </span>
        </summary>
        <div
          style={{
            padding: "0 20px 20px",
            color: "var(--color-text-secondary)",
            fontSize: "14px",
            lineHeight: "1.6",
          }}
        >
          {answer}
        </div>
      </details>
    </motion.div>
  );
}
