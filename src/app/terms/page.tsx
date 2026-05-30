"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function TermsPage() {
  const lastUpdated = "May 30, 2026";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar />

      <main style={{ flex: 1, paddingTop: "80px" }}>
        <section className="section">
          <div className="container" style={{ maxWidth: "920px" }}>
            <h1
              className="section-title gradient-text"
              style={{ fontSize: "40px", fontWeight: 900, marginBottom: "12px" }}
            >
              Terms of Service
            </h1>
            <p className="text-secondary" style={{ marginBottom: "40px", fontWeight: 600 }}>
              Last updated: {lastUpdated}
            </p>

            <div style={{ lineHeight: 1.8, color: "var(--color-text-secondary)", fontSize: "15px", display: "grid", gap: "32px" }}>
              <section>
                <h2 style={headingStyle}>1. Agreement</h2>
                <p>
                  These Terms govern your use of Decisional. By using the website, PWA,
                  dashboard, APIs, messaging, payments, verification, campaign, or dispute
                  tools, you agree to these Terms and our linked policies. If you do not agree,
                  do not use the platform.
                </p>
              </section>

              <section className="card" style={panelStyle}>
                <h2 style={headingStyle}>2. Roles and eligibility</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
                  <div style={miniPanelStyle}>
                    <h3 style={subheadingStyle}>Brands</h3>
                    <p>Brands create briefs, fund campaign budgets, review work, approve content, and follow applicable advertising, tax, and platform rules.</p>
                  </div>
                  <div style={miniPanelStyle}>
                    <h3 style={subheadingStyle}>Influencers</h3>
                    <p>Influencers apply to campaigns, deliver original content, disclose sponsored work, maintain linked social accounts, and meet agreed deadlines.</p>
                  </div>
                  <div style={miniPanelStyle}>
                    <h3 style={subheadingStyle}>Admins</h3>
                    <p>Admins review verification, disputes, payouts, safety signals, and platform compliance. Admin access is granted only through secure sessions.</p>
                  </div>
                </div>
                <p style={{ marginTop: "16px" }}>
                  You must be at least 18 years old and legally able to enter commercial
                  agreements. You are responsible for keeping your account secure and accurate.
                </p>
              </section>

              <section>
                <h2 style={headingStyle}>3. Verification, KYC, and trust systems</h2>
                <p>
                  Decisional may require email, phone, PAN, Aadhaar-related verification, bank,
                  GSTIN, CIN, ITR, social account, business, or content ownership checks before
                  allowing higher-value campaigns, withdrawals, payouts, or admin-sensitive
                  actions. We may limit, pause, or reject activity when verification is missing,
                  inconsistent, expired, fraudulent, or risky.
                </p>
              </section>

              <section>
                <h2 style={headingStyle}>4. Campaigns, contracts, and deliverables</h2>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Campaign briefs must be lawful, clear, complete, and not misleading.</li>
                  <li>Creators must submit original content that matches agreed deliverables, deadlines, mandatory tags, and disclosure requirements.</li>
                  <li>Contracts may be generated and signed electronically. A deal becomes active only when required parties complete signing and payment checks.</li>
                  <li>Brands must review submitted content within the platform review window or the system may auto-approve eligible submissions.</li>
                </ul>
              </section>

              <section>
                <h2 style={headingStyle}>5. Payments, escrow, fees, tax, and payouts</h2>
                <p>
                  Campaign funds may be collected upfront and held through Razorpay and our
                  internal ledger until release, refund, dispute resolution, or expiry. Platform
                  fees, gateway fees, taxes, TDS, GST, withholding, invoices, and bank charges
                  may apply based on role, transaction type, location, verification status, and
                  applicable law. Users are responsible for their own tax filings and declarations.
                </p>
              </section>

              <section>
                <h2 style={headingStyle}>6. Prohibited conduct</h2>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Fake followers, engagement pods, bot traffic, fake screenshots, fake invoices, or manipulated post analytics.</li>
                  <li>Bypassing platform payments, sharing private contact details to avoid fees, or soliciting off-platform settlements.</li>
                  <li>Fraudulent KYC, impersonation, unauthorized brand use, misleading health or financial claims, or unlawful promotional content.</li>
                  <li>Harassment, hate, explicit abuse, spam, malware, scraping, account resale, or attempts to access another user's account.</li>
                </ul>
              </section>

              <section>
                <h2 style={headingStyle}>7. Content rights</h2>
                <p>
                  Unless a deal states otherwise, creators keep ownership of their underlying
                  content, while brands receive the usage rights described in the approved brief,
                  contract, or deal terms after payment release. Decisional may use limited
                  platform metadata, screenshots, or excerpts for safety, audit, support, dispute,
                  and product improvement purposes.
                </p>
              </section>

              <section>
                <h2 style={headingStyle}>8. Disputes and enforcement</h2>
                <p>
                  Disputes must be raised before final approval or payout release unless the issue
                  relates to fraud, post deletion, or a continuing obligation. We may review
                  briefs, chat logs, submissions, live post URLs, payment records, and verification
                  evidence. We may issue refunds, partial releases, clawbacks, warnings, strikes,
                  suspensions, or account bans where required.
                </p>
              </section>

              <section>
                <h2 style={headingStyle}>9. Service availability and liability</h2>
                <p>
                  We work to keep Decisional reliable, but we do not guarantee uninterrupted
                  access, campaign outcomes, social platform API availability, creator performance,
                  or brand sales results. To the maximum extent allowed by law, Decisional is not
                  liable for indirect, consequential, speculative, or lost-profit damages.
                </p>
              </section>

              <section style={{ padding: "28px", background: "var(--color-bg-secondary)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)" }}>
                <h2 style={headingStyle}>10. Contact</h2>
                <p>
                  For Terms questions, legal notices, or compliance escalation, email{" "}
                  <a href="mailto:legal@decisional.in" style={linkStyle}>legal@decisional.in</a>.
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

const subheadingStyle = {
  fontSize: "16px",
  fontWeight: 800,
  color: "var(--color-text-primary)",
  marginBottom: "8px",
};

const panelStyle = {
  padding: "24px",
  background: "rgba(255,255,255,0.02)",
  border: "1px solid var(--color-border)",
};

const miniPanelStyle = {
  padding: "16px",
  background: "var(--color-bg-tertiary)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--color-border)",
};

const linkStyle = {
  color: "var(--color-primary)",
  fontWeight: 700,
  textDecoration: "none",
};
