"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function PrivacyPage() {
  const lastUpdated = "May 30, 2026";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar />

      <main style={{ flex: 1, paddingTop: "80px" }}>
        <section className="section">
          <div className="container" style={{ maxWidth: "900px" }}>
            <h1
              className="section-title gradient-text"
              style={{ fontSize: "40px", fontWeight: 900, marginBottom: "12px" }}
            >
              Privacy Policy
            </h1>
            <p className="text-secondary" style={{ marginBottom: "40px", fontWeight: 600 }}>
              Last updated: {lastUpdated}
            </p>

            <div style={{ lineHeight: 1.8, color: "var(--color-text-secondary)", fontSize: "15px", display: "grid", gap: "32px" }}>
              <section>
                <h2 style={headingStyle}>1. Who we are</h2>
                <p>
                  Decisional is an influencer collaboration marketplace for brands, creators,
                  and administrators. This policy explains how we collect, use, disclose,
                  retain, and protect personal data when you use our website, PWA, dashboard,
                  APIs, support channels, payments, verification, messaging, and dispute tools.
                </p>
              </section>

              <section className="card" style={panelStyle}>
                <h2 style={headingStyle}>2. Information we collect</h2>
                <ul className="list-disc pl-6 space-y-3">
                  <li>
                    <strong>Account data:</strong> name, email, phone number, password hash,
                    role, login history, device details, IP address, session identifiers, and
                    security events.
                  </li>
                  <li>
                    <strong>Profile data:</strong> creator bio, city, languages, categories,
                    rates, social handles, audience metrics, brand profile details, website,
                    business identifiers, and profile media.
                  </li>
                  <li>
                    <strong>Verification data:</strong> PAN, Aadhaar-related verification
                    evidence, GSTIN, CIN, bank documents, selfies, ITR acknowledgement details,
                    and KYC review status. Sensitive identifiers are encrypted or masked where
                    the platform only needs reference data.
                  </li>
                  <li>
                    <strong>Transaction data:</strong> wallet balances, payment holds, Razorpay
                    order/payment IDs, payouts, refunds, disputes, ledger entries, invoices, tax
                    metadata, and withdrawal details.
                  </li>
                  <li>
                    <strong>Collaboration data:</strong> campaign briefs, proposals, contracts,
                    deliverables, submitted content, live post URLs, approvals, reviews, chat
                    messages, typing/read status, notifications, and support requests.
                  </li>
                  <li>
                    <strong>Usage data:</strong> pages viewed, button clicks, feature usage,
                    error logs, service worker state, device/browser type, and performance
                    diagnostics.
                  </li>
                </ul>
              </section>

              <section>
                <h2 style={headingStyle}>3. Why we use your data</h2>
                <ul className="list-disc pl-6 space-y-2">
                  <li>To create accounts, authenticate users, prevent account takeover, and provide role-based access.</li>
                  <li>To verify creators and brands, calculate trust scores, enforce tier limits, and reduce fraud.</li>
                  <li>To run campaigns, applications, deals, contracts, payments, refunds, withdrawals, and disputes.</li>
                  <li>To support GST, ITR, TDS, payout, invoice, audit, accounting, and legal record requirements.</li>
                  <li>To send OTPs, security alerts, payment notifications, deal updates, and support responses.</li>
                  <li>To improve matching, analytics, PWA reliability, content verification, and platform safety.</li>
                </ul>
              </section>

              <section>
                <h2 style={headingStyle}>4. Consent, lawful use, and user rights</h2>
                <p>
                  We process personal data for account performance, consent-based actions,
                  security, legal compliance, and other lawful platform purposes. Where consent
                  is required, you can withdraw it through account settings or by contacting us.
                  You may request access, correction, deletion, grievance redressal, or nomination
                  support as available under applicable Indian data protection law.
                </p>
              </section>

              <section>
                <h2 style={headingStyle}>5. Sharing with service providers</h2>
                <p>
                  We do not sell personal data. We share limited data with providers who help us
                  operate the service, including Supabase/Postgres hosting, Upstash Redis,
                  Cloudflare R2 or S3 storage, Vercel hosting, Razorpay payments, email delivery,
                  WhatsApp/SMS OTP delivery, KYC providers, analytics/observability tools, social
                  platform APIs, legal/accounting advisors, and law enforcement or regulators
                  when required.
                </p>
              </section>

              <section>
                <h2 style={headingStyle}>6. Security and retention</h2>
                <p>
                  We use access controls, encryption, token revocation, rate limits, audit logs,
                  fraud checks, and least-privilege workflows. We retain records only for as long
                  as needed for platform operations, dispute handling, statutory retention, tax,
                  accounting, fraud prevention, and legal obligations. Financial, tax, and audit
                  records may be retained even after account deletion where the law requires it.
                </p>
              </section>

              <section>
                <h2 style={headingStyle}>7. Children and prohibited use</h2>
                <p>
                  Decisional is intended for users who can enter into binding commercial
                  relationships. Users under 18 may not create creator, brand, or admin accounts.
                  If we learn that a minor has created an account, we may suspend the account and
                  delete non-essential data.
                </p>
              </section>

              <section>
                <h2 style={headingStyle}>8. Contact and grievance redressal</h2>
                <p>
                  For privacy requests, account deletion, correction, consent withdrawal, or
                  grievance escalation, contact us at{" "}
                  <a href="mailto:privacy@decisional.in" style={linkStyle}>privacy@decisional.in</a>.
                  For legal notices, contact{" "}
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

const panelStyle = {
  padding: "24px",
  background: "rgba(255,255,255,0.02)",
  border: "1px solid var(--color-border)",
};

const linkStyle = {
  color: "var(--color-primary)",
  fontWeight: 700,
  textDecoration: "none",
};
