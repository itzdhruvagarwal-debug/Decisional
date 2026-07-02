"use client";

import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import { motion } from "framer-motion";

type PricingCardProps = {
  title: string;
  marker: string;
  price: string;
  subtitle: string;
  description: string;
  features: string[];
  ctaText: string;
  ctaLink: string;
  color: string;
  delay: number;
  isPopular?: boolean;
};

type FAQItemProps = {
  question: string;
  answer: string;
  delay: number;
};

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] font-sans">
      <Navbar />

      <main
        style={{
          paddingTop: "120px",
          paddingBottom: "80px",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div style={{ maxWidth: "1040px", margin: "0 auto", padding: "0 20px" }}>
          <div style={{ textAlign: "center", marginBottom: "52px" }}>
            <motion.h1
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                fontSize: "clamp(34px, 7vw, 48px)",
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
              style={{
                color: "var(--color-text-secondary)",
                fontSize: "18px",
                lineHeight: 1.7,
                maxWidth: "720px",
                margin: "0 auto",
              }}
            >
              Join for free. Decisional earns when a protected collaboration is
              successfully completed, verified, and paid out.
            </motion.p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "28px",
              marginBottom: "72px",
            }}
          >
            <PricingCard
              title="Influencer"
              marker="IN"
              price="Free"
              subtitle="to join and apply"
              description="Build a verified profile, apply to campaigns, submit content, and receive protected payouts."
              features={[
                "Verified creator profile and portfolio",
                "Campaign discovery and deal workspace",
                "Secure escrow-backed payouts",
                "Referral levels, XP, and badge benefits",
                "Platform fee visible before acceptance",
              ]}
              ctaText="Join as Influencer"
              ctaLink="/register?type=influencer"
              color="var(--color-primary)"
              delay={0.2}
            />

            <PricingCard
              title="Brand"
              marker="BR"
              price="10%"
              subtitle="service fee on deals"
              description="Launch campaigns, shortlist verified creators, approve deliverables, and release payments with audit trails."
              features={[
                "Unlimited campaign drafts",
                "Creator verification and risk signals",
                "Contract, milestone, and approval workflow",
                "Payment protection and dispute handling",
                "GST-ready invoice metadata where applicable",
              ]}
              ctaText="Start Hiring"
              ctaLink="/register?type=brand"
              color="var(--color-accent-cyan)"
              delay={0.3}
              isPopular
            />
          </div>

          <section style={{ maxWidth: "820px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "36px" }}>
              <h2 style={{ fontSize: "28px", fontWeight: 700 }}>
                Frequently Asked Questions
              </h2>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <FAQItem
                question="Are there any subscription fees?"
                answer="No. Brands and influencers can create an account without a subscription. Fees apply only when a collaboration uses Decisional's protected workflow."
                delay={0.4}
              />
              <FAQItem
                question="How does the brand service fee work?"
                answer="The service fee is shown before payment and supports escrow handling, verification signals, approvals, dispute operations, and platform maintenance."
                delay={0.5}
              />
              <FAQItem
                question="What do influencers pay?"
                answer="Influencer platform fees are displayed before deal acceptance and can be affected by program benefits such as referral tiers or promotional waivers."
                delay={0.6}
              />
              <FAQItem
                question="Are taxes included?"
                answer="Taxes, GST, TDS, and income-tax reporting can depend on the parties, invoices, place of supply, registration status, and current law. The platform stores required metadata, but users remain responsible for their own filings."
                delay={0.7}
              />
              <FAQItem
                question="Is payment protected?"
                answer="For eligible deals, brand funds are held through the payment workflow and released after agreed milestones, approval, or dispute resolution."
                delay={0.8}
              />
            </div>
          </section>

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
              Need a custom workflow, enterprise controls, or compliance review?
            </p>
            <Link
              href="/contact"
              style={{
                color: "var(--color-primary)",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Contact support
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
  marker,
  price,
  subtitle,
  description,
  features,
  ctaText,
  ctaLink,
  color,
  delay,
  isPopular,
}: PricingCardProps) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      style={{
        background: `linear-gradient(135deg, ${color}11, ${color}05)`,
        border: `1px solid ${color}33`,
        borderRadius: "20px",
        padding: "34px",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: isPopular ? `0 10px 40px -10px ${color}33` : "none",
      }}
    >
      {isPopular && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            background: color,
            color: "#05030f",
            fontSize: "11px",
            fontWeight: 800,
            padding: "6px 16px",
            borderRadius: "0 0 0 14px",
            textTransform: "uppercase",
            letterSpacing: 0,
          }}
        >
          Most Popular
        </div>
      )}

      <div style={{ marginBottom: "24px" }}>
        <div
          aria-hidden="true"
          style={{
            width: "58px",
            height: "58px",
            borderRadius: "18px",
            background: `linear-gradient(135deg, ${color}, ${color}88)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "18px",
            fontWeight: 900,
            marginBottom: "20px",
            color: "#05030f",
            boxShadow: `0 8px 20px ${color}44`,
          }}
        >
          {marker}
        </div>
        <h3 style={{ fontSize: "24px", fontWeight: 800, marginBottom: "8px" }}>
          {title}
        </h3>
        <p
          style={{
            color: "var(--color-text-secondary)",
            fontSize: "14px",
            lineHeight: 1.7,
          }}
        >
          {description}
        </p>
      </div>

      <div
        style={{
          marginBottom: "30px",
          padding: "20px",
          background: "var(--color-bg-tertiary)",
          borderRadius: "16px",
          textAlign: "center",
          border: "1px solid var(--color-border)",
        }}
      >
        <div
          style={{
            fontSize: "clamp(34px, 8vw, 42px)",
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
            letterSpacing: 0,
          }}
        >
          {subtitle}
        </div>
      </div>

      <ul
        style={{
          flex: 1,
          marginBottom: "30px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          listStyle: "none",
          padding: 0,
        }}
      >
        {features.map((feature) => (
          <li
            key={feature}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
              fontSize: "14px",
              color: "var(--color-text-secondary)",
              lineHeight: 1.55,
            }}
          >
            <svg
              aria-hidden="true"
              style={{
                color,
                width: "16px",
                height: "16px",
                flexShrink: 0,
                marginTop: "3px",
              }}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {feature}
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
            color: isPopular ? "#05030f" : "var(--color-text-primary)",
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
    </motion.article>
  );
}

function FAQItem({ question, answer, delay }: FAQItemProps) {
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
            gap: "16px",
            listStyle: "none",
          }}
        >
          <span>{question}</span>
          <svg
            aria-hidden="true"
            style={{
              width: "12px",
              height: "12px",
              transition: "transform 0.3s",
            }}
            className="group-open:rotate-180"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
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
