"use client";

import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const legalPages = [
  {
    title: "Privacy Policy",
    href: "/privacy",
    body: "Personal data, KYC, payment records, messaging, retention, user rights, and grievance contact details.",
  },
  {
    title: "Terms of Service",
    href: "/terms",
    body: "Marketplace rules for brands, influencers, admins, contracts, payments, disputes, usage rights, and enforcement.",
  },
  {
    title: "Refund and Cancellation Policy",
    href: "/refund",
    body: "Deal-stage refund rules, dispute outcomes, wallet refunds, original-source timelines, and evidence requirements.",
  },
  {
    title: "Cookie Policy",
    href: "/cookie-policy",
    body: "Cookies, local storage, service worker cache, PWA storage, provider cookies, and browser controls.",
  },
];

export default function LegalPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar />

      <main style={{ flex: 1, paddingTop: "80px" }}>
        <section className="section">
          <div className="container" style={{ maxWidth: "980px" }}>
            <h1
              className="section-title gradient-text"
              style={{ fontSize: "40px", fontWeight: 900, marginBottom: "12px" }}
            >
              Legal Center
            </h1>
            <p className="text-secondary" style={{ maxWidth: "720px", marginBottom: "36px", fontWeight: 600 }}>
              Core policies for Decisional users, including India-focused marketplace,
              payment, privacy, tax-readiness, and dispute workflows.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "18px" }}>
              {legalPages.map((page) => (
                <Link
                  key={page.href}
                  href={page.href}
                  className="card"
                  style={{
                    padding: "22px",
                    color: "inherit",
                    textDecoration: "none",
                    border: "1px solid var(--color-border)",
                    background: "rgba(255,255,255,0.02)",
                    display: "grid",
                    gap: "10px",
                  }}
                >
                  <h2 style={{ fontSize: "18px", fontWeight: 850, color: "var(--color-text-primary)" }}>
                    {page.title}
                  </h2>
                  <p style={{ color: "var(--color-text-secondary)", lineHeight: 1.65, fontSize: "14px" }}>
                    {page.body}
                  </p>
                  <span style={{ color: "var(--color-primary)", fontWeight: 800, fontSize: "14px" }}>
                    Open policy
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
