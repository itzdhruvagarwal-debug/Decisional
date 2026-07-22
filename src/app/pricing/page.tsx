"use client";

import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui";

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
        className="overflow-hidden relative pt-30 pb-20"
      >
        <div className="max-w-1040" style={{ margin: "0 auto", padding: "0 20px" }}>
          <div className="text-center" style={{ marginBottom: "52px" }}>
            <motion.h1
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="font-extrabold mb-4" style={{ fontSize: "clamp(34px, 7vw, 48px)", background:
                  "linear-gradient(135deg, var(--color-primary), var(--color-accent-cyan))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
            >
              Transparent Pricing
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-secondary text-lg max-w-720" style={{ lineHeight: 1.7, margin: "0 auto" }}
            >
              Join for free. Decisional earns when a protected collaboration is
              successfully completed, verified, and paid out.
            </motion.p>
          </div>

          <div
            className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "28px", marginBottom: "72px" }}
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
            <div className="text-center mb-8">
              <h2 className="font-bold text-3xl">
                Frequently Asked Questions
              </h2>
            </div>

            <div className="flex flex-col gap-4">
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
            className="text-center" style={{ marginTop: "60px", paddingBottom: "40px" }}
          >
            <p
              className="text-secondary mb-4"
            >
              Need a custom workflow, enterprise controls, or compliance review?
            </p>
            <Link
              href="/contact"
              className="text-primary font-bold no-underline"
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
}: Readonly<PricingCardProps>) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      className="relative overflow-hidden flex flex-col rounded-2xl" style={{ background: `linear-gradient(135deg, ${color}11, ${color}05)`, border: `1px solid ${color}33`, padding: "34px", boxShadow: isPopular ? `0 10px 40px -10px ${color}33` : "none" }}
    >
      {isPopular && (
        <div
          className="absolute font-extrabold text-xs uppercase" style={{ top: 0, right: 0, background: color, color: "#05030f", padding: "6px 16px", borderRadius: "0 0 0 14px", letterSpacing: 0 }}
        >
          Most Popular
        </div>
      )}

      <div className="mb-6">
        <div
          aria-hidden="true"
          className="flex items-center justify-center text-lg mb-5 font-extrabold" style={{ width: "58px", height: "58px", borderRadius: "18px", background: `linear-gradient(135deg, ${color}, ${color}88)`, color: "#05030f", boxShadow: `0 8px 20px ${color}44` }}
        >
          {marker}
        </div>
        <h3 className="text-2xl font-extrabold mb-2">
          {title}
        </h3>
        <p
          className="text-secondary text-sm" style={{ lineHeight: 1.7 }}
        >
          {description}
        </p>
      </div>

      <div
        className="text-center p-5 bg-tertiary rounded-xl border-card" style={{ marginBottom: "30px" }}
      >
        <div
          className="font-extrabold text-primary" style={{ fontSize: "clamp(34px, 8vw, 42px)" }}
        >
          {price}
        </div>
        <div
          className="text-xs font-bold text-secondary uppercase" style={{ letterSpacing: 0 }}
        >
          {subtitle}
        </div>
      </div>

      <ul
        className="flex-1 flex flex-col gap-3 p-0" style={{ marginBottom: "30px", listStyle: "none" }}
      >
        {features.map((feature) => (
          <li
            key={feature}
            className="flex items-start gap-3 text-sm text-secondary" style={{ lineHeight: 1.55 }}
          >
            <svg
              aria-hidden="true"
              className="flex-shrink-0" style={{ color, width: "16px", height: "16px", marginTop: "3px" }}
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

      <Link href={ctaLink} className="w-full">
        <Button
          className="w-full p-4 text-base font-bold cursor-pointer" style={{ background: isPopular
              ? `linear-gradient(135deg, ${color}, ${color}dd)`
              : "var(--color-bg-secondary)", color: isPopular ? "#05030f" : "var(--color-text-primary)", border: isPopular ? "none" : `1px solid ${color}44`, transition: "transform 0.2s" }}
        >
          {ctaText}
        </Button>
      </Link>
    </motion.article>
  );
}

function FAQItem({ question, answer, delay }: Readonly<FAQItemProps>) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="overflow-hidden bg-secondary rounded-xl border-card"
    >
      <details   className="cursor-pointer group">
        <summary
          className="font-semibold flex justify-between items-center gap-4 p-5" style={{ listStyle: "none" }}
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
          className="text-secondary text-sm" style={{ padding: "0 20px 20px", lineHeight: "1.6" }}
        >
          {answer}
        </div>
      </details>
    </motion.div>
  );
}
