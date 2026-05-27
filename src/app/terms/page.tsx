"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function TermsPage() {
  const lastUpdated = "February 26, 2026";

  return (
    <div
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
    >
      <Navbar />

      <main style={{ flex: 1, paddingTop: "80px" }}>
        <section className="section">
          <div className="container" style={{ maxWidth: "900px" }}>
            <h1 className="section-title gradient-text" style={{ fontSize: "40px", fontWeight: 900, marginBottom: "12px" }}>
              Terms of Service
            </h1>
            <p className="text-secondary" style={{ marginBottom: "48px", fontWeight: 600 }}>
              Last Updated: {lastUpdated}
            </p>

            <div
              className="space-y-10"
              style={{ lineHeight: 1.8, color: "var(--color-text-secondary)", fontSize: "15px" }}
            >
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                  <span>01.</span> Agreement to Terms
                </h2>
                <p>
                  By accessing or using Decisional (the "Service"), you agree to be bound by
                  these Terms. Decisional is a decentralized-style influencer marketplace that
                  connects Brands and Influencers for marketing collaborations. If you disagree
                  with any part of these terms, you must terminate your use of the Service immediately.
                </p>
              </div>

              <div className="card" style={{ padding: "24px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--color-border)" }}>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                  <span>02.</span> Tiered Verification & KYC
                </h2>
                <p style={{ marginBottom: "16px" }}>
                  Decisional employs a **Tiered Verification System** to ensure platform integrity and trust.
                </p>
                <ul className="list-disc pl-6 space-y-3">
                  <li><strong>Tier 1 (Basic):</strong> Requires email and phone verification. Limited deal capacity.</li>
                  <li><strong>Tier 2 (Verified):</strong> Requires government-issued ID (Aadhar/PAN/Passport) and social media ownership proof. Unlocks secure escrow payments.</li>
                  <li><strong>Tier 3 (Elite):</strong> Requires a history of successful deals and a high Digital Reputation Score (DRS).</li>
                </ul>
                <p style={{ marginTop: "16px", fontSize: "14px", color: "var(--color-accent-rose)", fontWeight: 600 }}>
                  Submitting fraudulent documents will lead to an immediate and permanent ban.
                </p>
              </div>

              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                  <span>03.</span> Marketplace Dynamics
                </h2>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginTop: "16px" }}>
                  <div style={{ padding: "16px", background: "var(--color-bg-tertiary)", borderRadius: "var(--radius-md)" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-primary-light)", marginBottom: "8px" }}>For Brands</h3>
                    <p style={{ fontSize: "13px" }}>You are responsible for providing clear campaign briefs and processing payments into the Decisional escrow before work commences.</p>
                  </div>
                  <div style={{ padding: "16px", background: "var(--color-bg-tertiary)", borderRadius: "var(--radius-md)" }}>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-secondary-light)", marginBottom: "8px" }}>For Influencers</h3>
                    <p style={{ fontSize: "13px" }}>You agree to deliver high-quality, original content within the agreed deadlines. Using fake engagement bots is strictly prohibited.</p>
                  </div>
                </div>
              </div>

              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                  <span>04.</span> Payments & Escrow Security
                </h2>
                <p>
                  We use **Razorpay** and a secure internal ledger system to manage funds.
                </p>
                <ul className="list-disc pl-6 mt-4 space-y-2">
                  <li><strong>Escrow Protection:</strong> Funds for a deal are "locked" once a deal is accepted. Influencers are paid only after the Brand confirms content delivery or the 48-hour auto-approval window passes.</li>
                  <li><strong>Platform Fees:</strong> Decisional charges a 10% transaction fee for providing matching, escrow, and dispute services.</li>
                  <li><strong>Withdrawals:</strong> Influencers can withdraw earnings once work is "Verified" and the cooldown period (if any) ends.</li>
                </ul>
              </div>

              <div className="card" style={{ padding: "24px", background: "rgba(99, 102, 241, 0.05)", border: "1px solid rgba(99, 102, 241, 0.2)" }}>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                  <span>05.</span> Gamification & Gamified Trust
                </h2>
                <p>
                  The **Decisional XP and Badge System** is a measure of platform prestige.
                </p>
                <ul className="list-disc pl-6 mt-2 space-y-2">
                  <li><strong>XP (Experience Points):</strong> Earned via successful deal completions, timely responses, and verified content.</li>
                  <li><strong>Badges:</strong> awarded for milestones (e.g., "Top Performer 2026"). Badges can be revoked if you violate our anti-fraud policies.</li>
                  <li><strong>Strike System:</strong> Users who violate terms (e.g., missed deadlines, offensive communication) will receive strikes. 3 strikes result in permanent suspension.</li>
                </ul>
              </div>

              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                  <span>06.</span> Intellectual Property
                </h2>
                <p>
                  Unless otherwise specified in the deal brief, once a Brand marks a deal as "Completed" and funds are released, the **exclusive usage rights** to the content transfer from the Influencer to the Brand. Decisional reserves the right to use snippets of content for platform promotional purposes.
                </p>
              </div>

              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                  <span>07.</span> Dispute Resolution
                </h2>
                <p>
                  In the event of a disagreement, Decisional's **Dispute Center** provides an impartial review. Both parties agree to provide evidence (screenshots, links, chat logs). Decisional's final decision on fund distribution in a dispute is binding.
                </p>
              </div>

              <div style={{ padding: "32px", background: "var(--color-bg-secondary)", borderRadius: "var(--radius-lg)", textAlign: "center", marginTop: "64px", border: "1px solid var(--color-border)" }}>
                <p style={{ fontSize: "14px", color: "var(--color-text-muted)" }}>
                  Questions regarding these Terms? Contact our compliance team at
                  <a href="mailto:legal@decisional.in" style={{ color: "var(--color-primary)", marginLeft: "5px", textDecoration: "none", fontWeight: 700 }}>legal@decisional.in</a>
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

