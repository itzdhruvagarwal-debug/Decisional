"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";

const contactRows = [
  {
    title: "Support",
    body: "Account access, OTP, campaign, payout, and dashboard issues.",
    href: "mailto:support@decisional.in",
    label: "support@decisional.in",
  },
  {
    title: "Partnerships",
    body: "Brand onboarding, agency accounts, creator programs, and enterprise plans.",
    href: "mailto:partnerships@decisional.in",
    label: "partnerships@decisional.in",
  },
  {
    title: "Legal and privacy",
    body: "Legal notices, privacy requests, data correction, and compliance escalation.",
    href: "mailto:legal@decisional.in",
    label: "legal@decisional.in",
  },
];

export default function ContactPage() {
  return (
    <div className="flex flex-col" style={{ minHeight: "100vh" }}>
      <Navbar />

      <main className="flex-1" style={{ paddingTop: "80px" }}>
        <section className="section">
          <div className="container" style={{ maxWidth: "1040px" }}>
            <div className="text-center" style={{ marginBottom: "56px" }}>
              <h1 className="section-title">
                Contact <span className="gradient-text">Decisional</span>
              </h1>
              <p className="section-subtitle">
                Reach the right team for support, partnerships, privacy, or legal requests.
              </p>
            </div>

            <div className="grid-2 gap-8" style={{ alignItems: "start" }}>
              <div className="grid" style={{ gap: "18px" }}>
                {contactRows.map((row) => (
                  <article key={row.title} className="card">
                    <h2 className="text-xl font-extrabold" style={{ marginBottom: "10px" }}>
                      {row.title}
                    </h2>
                    <p className="text-secondary mb-3" style={{ lineHeight: 1.7 }}>
                      {row.body}
                    </p>
                    <a href={row.href} style={linkStyle}>
                      {row.label}
                    </a>
                  </article>
                ))}
              </div>

              <div className="card">
                <h2 className="text-2xl font-extrabold mb-4">
                  Fastest support path
                </h2>
                <p className="text-secondary mb-5" style={{ lineHeight: 1.7 }}>
                  Logged-in users should use the dashboard so we can attach the right account,
                  campaign, deal, payout, or dispute record to the request.
                </p>
                <div className="grid gap-3">
                  <Link href="/dashboard/messages" className="btn btn-primary justify-center">
                    Open Dashboard Messages
                  </Link>
                  <Link href="/dashboard/disputes" className="btn btn-secondary justify-center">
                    Open Dispute Center
                  </Link>
                </div>
                <div className="mt-6 border-top" style={{ paddingTop: "20px" }}>
                  <h3 className="text-base font-extrabold mb-2">
                    Response windows
                  </h3>
                  <p className="text-secondary" style={{ lineHeight: 1.7 }}>
                    Support: 1 to 2 business days. Payment or security escalations are prioritized.
                    Legal notices should be sent by email and include account identifiers where relevant.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

const linkStyle = {
  color: "var(--color-primary)",
  fontWeight: 700,
  textDecoration: "none",
};
