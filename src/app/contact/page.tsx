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
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar />

      <main style={{ flex: 1, paddingTop: "80px" }}>
        <section className="section">
          <div className="container" style={{ maxWidth: "1040px" }}>
            <div style={{ textAlign: "center", marginBottom: "56px" }}>
              <h1 className="section-title">
                Contact <span className="gradient-text">Decisional</span>
              </h1>
              <p className="section-subtitle">
                Reach the right team for support, partnerships, privacy, or legal requests.
              </p>
            </div>

            <div className="grid-2" style={{ gap: "32px", alignItems: "start" }}>
              <div style={{ display: "grid", gap: "18px" }}>
                {contactRows.map((row) => (
                  <article key={row.title} className="card">
                    <h2 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "10px" }}>
                      {row.title}
                    </h2>
                    <p style={{ color: "var(--color-text-secondary)", lineHeight: 1.7, marginBottom: "12px" }}>
                      {row.body}
                    </p>
                    <a href={row.href} style={linkStyle}>
                      {row.label}
                    </a>
                  </article>
                ))}
              </div>

              <div className="card">
                <h2 style={{ fontSize: "24px", fontWeight: 800, marginBottom: "16px" }}>
                  Fastest support path
                </h2>
                <p style={{ color: "var(--color-text-secondary)", lineHeight: 1.7, marginBottom: "20px" }}>
                  Logged-in users should use the dashboard so we can attach the right account,
                  campaign, deal, payout, or dispute record to the request.
                </p>
                <div style={{ display: "grid", gap: "12px" }}>
                  <Link href="/dashboard/messages" className="btn btn-primary" style={{ justifyContent: "center" }}>
                    Open Dashboard Messages
                  </Link>
                  <Link href="/dashboard/disputes" className="btn btn-secondary" style={{ justifyContent: "center" }}>
                    Open Dispute Center
                  </Link>
                </div>
                <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid var(--color-border)" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: 800, marginBottom: "8px" }}>
                    Response windows
                  </h3>
                  <p style={{ color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
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
