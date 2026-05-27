"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";

export default function RefundPage() {
  const lastUpdated = "February 26, 2026";

  return (
    <div
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
    >
      <Navbar />

      <main style={{ flex: 1, paddingTop: "80px" }}>
        <section className="section">
          <div className="container" style={{ maxWidth: "850px" }}>
            <h1 className="section-title gradient-text" style={{ fontSize: "40px", fontWeight: 900, marginBottom: "12px" }}>
              Refund & Cancellation
            </h1>
            <p className="text-secondary" style={{ marginBottom: "48px", fontWeight: 600 }}>
              Last Updated: {lastUpdated}
            </p>

            <div
              className="space-y-10"
              style={{ lineHeight: 1.8, color: "var(--color-text-secondary)", fontSize: "15px" }}
            >
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "16px" }}>
                  1. Escrow Refund Logic
                </h2>
                <p>
                  Decisional operates on a secure escrow model. Funds are collected upfront
                  from Brands and held in a secure intermediary account until the
                  collaboration is finalized or cancelled.
                </p>
              </div>

              <div className="card" style={{ padding: "24px", background: "rgba(244, 63, 94, 0.03)", border: "1px solid rgba(244, 63, 94, 0.1)" }}>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--color-accent-rose)", marginBottom: "16px" }}>
                  2. For Brands: Cancellation Rules
                </h2>
                <ul className="list-disc pl-6 space-y-4">
                  <li>
                    <strong>Pre-Acceptance Cancellation:</strong> If you cancel a deal proposal before the Influencer has accepted it, 100% of the funds will be returned to your Decisional wallet immediately.
                  </li>
                  <li>
                    <strong>SLA Violations (Missed Deadlines):</strong> If an influencer fails to upload content or respond within the agreed timeframe, you may request a refund via the Deal Dashboard. Our system will automatically verify the delay and process a full refund.
                  </li>
                  <li>
                    <strong>Post-Acceptance (Work in Progress):</strong> Once an influencer accepts a deal, 50% of the funds are "committed". Cancellation at this stage requires a mutual agreement or a formal dispute.
                  </li>
                </ul>
              </div>

              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "16px" }}>
                  3. Non-Refundable Items
                </h2>
                <ul className="list-disc pl-6 mt-4 space-y-2">
                  <li><strong>Platform Service Fees:</strong> The 10% platform fee is non-refundable once a deal is marked as "Completed" or if a refund is processed due to manual brand changes.</li>
                  <li><strong>Completed Work:</strong> Once content is approved by the Brand or the 48-hour auto-approval window closes, payments are final and no longer eligible for refund.</li>
                </ul>
              </div>

              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "16px" }}>
                  4. Dispute-Based Refunds
                </h2>
                <p>
                  If you are dissatisfied with content quality, you MUST raise a dispute
                  **before** approving the content. Our admin team will review the
                  campaign brief versus the delivered output. If a refund is decided:
                </p>
                <ul className="list-disc pl-6 mt-2 space-y-2">
                  <li>Funds will be credited back to your original payment method via Razorpay within 5-7 business days.</li>
                </ul>
              </div>

              <div style={{ padding: "32px", background: "var(--color-bg-secondary)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)", textAlign: "center" }}>
                <p style={{ fontSize: "14px", color: "var(--color-text-muted)" }}>
                  Need to track a refund or open a dispute?
                  <Link href="/dashboard/disputes" style={{ color: "var(--color-primary)", marginLeft: "5px", textDecoration: "none", fontWeight: 700 }}>Open Dispute Center</Link>
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

