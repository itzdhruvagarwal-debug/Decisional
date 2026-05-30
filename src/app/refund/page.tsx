"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";

export default function RefundPage() {
  const lastUpdated = "May 30, 2026";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar />

      <main style={{ flex: 1, paddingTop: "80px" }}>
        <section className="section">
          <div className="container" style={{ maxWidth: "880px" }}>
            <h1 className="section-title gradient-text" style={{ fontSize: "40px", fontWeight: 900, marginBottom: "12px" }}>
              Refund and Cancellation Policy
            </h1>
            <p className="text-secondary" style={{ marginBottom: "40px", fontWeight: 600 }}>
              Last updated: {lastUpdated}
            </p>

            <div style={{ lineHeight: 1.8, color: "var(--color-text-secondary)", fontSize: "15px", display: "grid", gap: "32px" }}>
              <section>
                <h2 style={headingStyle}>1. How protected payments work</h2>
                <p>
                  Decisional uses funded campaign budgets, payment holds, wallet ledgers, and
                  deal status checks to protect both brands and influencers. Refund eligibility
                  depends on the deal stage, evidence, platform fees, tax treatment, and whether
                  work has already been approved or auto-approved.
                </p>
              </section>

              <section className="card" style={panelStyle}>
                <h2 style={headingStyle}>2. Brand cancellations</h2>
                <ul className="list-disc pl-6 space-y-3">
                  <li>
                    <strong>Before influencer selection:</strong> Uncommitted campaign funds may
                    be returned to the brand wallet or original payment method, subject to gateway
                    and statutory adjustments.
                  </li>
                  <li>
                    <strong>After selection but before work starts:</strong> Cancellation may
                    require creator consent or admin review if the creator has already accepted
                    the deal.
                  </li>
                  <li>
                    <strong>After content submission:</strong> Refunds are handled through the
                    content review or dispute flow. Brands should request revisions or raise a
                    dispute before approving content.
                  </li>
                  <li>
                    <strong>After approval or auto-approval:</strong> Payments are generally final
                    unless fraud, post deletion, contract breach, or a continuing obligation is
                    proven.
                  </li>
                </ul>
              </section>

              <section>
                <h2 style={headingStyle}>3. Influencer cancellations</h2>
                <p>
                  Influencers should decline unsuitable work before signing. After signing, missed
                  deadlines, non-delivery, copied content, misleading metrics, or unapproved
                  substitutions may result in cancellation, partial payment, refund, strikes, or
                  account restrictions.
                </p>
              </section>

              <section>
                <h2 style={headingStyle}>4. Non-refundable amounts</h2>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Gateway charges, bank charges, payout charges, or taxes already incurred.</li>
                  <li>Platform service fees for completed or substantially performed work.</li>
                  <li>Approved content, unless fraud or a material contract breach is established.</li>
                  <li>Product samples, shipping, or third-party costs unless the deal terms state otherwise.</li>
                </ul>
              </section>

              <section>
                <h2 style={headingStyle}>5. Refund timing</h2>
                <p>
                  Approved refunds are usually credited to the Decisional wallet first. If a
                  refund to the original payment method is supported, Razorpay or the banking
                  partner may take 5 to 10 business days after processing. Timelines can vary
                  based on bank holidays, payment method, KYC status, disputes, and compliance
                  review.
                </p>
              </section>

              <section style={{ padding: "28px", background: "var(--color-bg-secondary)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)", textAlign: "center" }}>
                <p style={{ fontSize: "14px", color: "var(--color-text-muted)" }}>
                  Need a refund review or dispute?
                  <Link href="/dashboard/disputes" style={{ color: "var(--color-primary)", marginLeft: "5px", textDecoration: "none", fontWeight: 700 }}>
                    Open Dispute Center
                  </Link>
                </p>
              </section>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

const headingStyle = {
  fontSize: "20px",
  fontWeight: 800,
  color: "var(--color-text-primary)",
  marginBottom: "14px",
};

const panelStyle = {
  padding: "24px",
  background: "rgba(244, 63, 94, 0.03)",
  border: "1px solid rgba(244, 63, 94, 0.1)",
};
