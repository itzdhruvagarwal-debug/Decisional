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
    <div className="flex flex-col" style={{ minHeight: "100vh" }}>
      <Navbar />

      <main className="flex-1" style={{ paddingTop: "80px" }}>
        <section className="section">
          <div className="container" style={{ maxWidth: "980px" }}>
            <h1
              className="section-title gradient-text mb-3 text-3xl font-extrabold"
            >
              Legal Center
            </h1>
            <p className="text-secondary font-semibold" style={{ maxWidth: "720px", marginBottom: "36px" }}>
              Core policies for Decisional users, including India-focused marketplace,
              payment, privacy, tax-readiness, and dispute workflows.
            </p>

            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "18px" }}>
              {legalPages.map((page) => (
                <Link
                  key={page.href}
                  href={page.href}
                  className="card grid border-card" style={{ padding: "22px", color: "inherit", textDecoration: "none", background: "rgba(255,255,255,0.02)", gap: "10px" }}
                >
                  <h2 className="text-lg" style={{ fontWeight: 850, color: "var(--color-text-primary)" }}>
                    {page.title}
                  </h2>
                  <p className="text-secondary text-sm" style={{ lineHeight: 1.65 }}>
                    {page.body}
                  </p>
                  <span className="text-primary font-extrabold text-sm">
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
