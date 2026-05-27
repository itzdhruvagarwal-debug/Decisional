"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function PrivacyPage() {
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
              Privacy Policy
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
                  1. Privacy Commitment
                </h2>
                <p>
                  Decisional ("we", "us", or "our") is dedicated to protecting the privacy of
                  Brands and Influencers. This policy explains how we collect, use, and
                  protect your personal information in compliance with the **Digital Personal
                  Data Protection Act (DPDP), India**.
                </p>
              </div>

              <div className="card" style={{ padding: "24px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--color-border)" }}>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "16px" }}>
                  2. Critical Data Collection
                </h2>
                <p style={{ marginBottom: "12px" }}>In addition to basic contact info, we collect the following to ensure platform safety:</p>
                <ul className="list-disc pl-6 space-y-3">
                  <li>
                    <strong>KYC Documents:</strong> For verification, we collect government-issued IDs (Aadhar, PAN, or Passport). This data is encrypted and used solely for identity verification via our secure KYC module.
                  </li>
                  <li>
                    <strong>Social Media Insights:</strong> If you link your social accounts (Instagram, YouTube, etc.), we collect performance metrics (followers, engagement rate, top demographics) via official APIs.
                  </li>
                  <li>
                    <strong>Financial Data:</strong> Bank account details and Razorpay transaction IDs are collected for the purpose of processing payouts and preventing money laundering.
                  </li>
                  <li>
                    <strong>Device & IP Data:</strong> Collected to prevent account takeover and multi-account fraud.
                  </li>
                </ul>
              </div>

              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "16px" }}>
                  3. Purpose of Processing
                </h2>
                <p>We process your data for the following essential business functions:</p>
                <ul className="list-disc pl-6 mt-4 space-y-2">
                  <li><strong>KYC Verification:</strong> To prevent fraud and ensure "Real Identity" behind influencer profiles.</li>
                  <li><strong>Matching Algorithm:</strong> Using your profile and campaign data to suggest relevant brand-influencer matches.</li>
                  <li><strong>Dispute Resolution:</strong> Using chat logs and deal evidence to resolve payout disagreements.</li>
                  <li><strong>Security:</strong> Detecting and banning accounts involved in fake engagement or payment fraud.</li>
                </ul>
              </div>

              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "16px" }}>
                  4. Third-Party Sharing
                </h2>
                <p>We do not sell your data. We only share data with trusted partners necessary for operation:</p>
                <ul className="list-disc pl-6 mt-4 space-y-2">
                  <li><strong>Payment Processors:</strong> Razorpay for secure financial transactions.</li>
                  <li><strong>Cloud Infrastructure:</strong> Secure servers located in Tier-4 data centers.</li>
                  <li><strong>Email Services:</strong> For critical system notifications and deal updates.</li>
                </ul>
              </div>

              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "16px" }}>
                  5. Data Retention & Deletion
                </h2>
                <p>
                  We retain personal data only as long as your account is active or as required by law
                  (e.g., financial records for 7 years). You may request account deletion via
                  Settings, which will anonymize your profile and remove non-essential document storage
                  within 30 business days.
                </p>
              </div>

              <div style={{ padding: "32px", background: "var(--color-bg-secondary)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)", marginTop: "48px" }}>
                <h2 style={{ fontSize: "18px", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "12px" }}>
                  Contact Our Privacy Officer
                </h2>
                <p style={{ fontSize: "14px" }}>
                  For any concerns regarding your data, or if you wish to exercise your rights under
                  Indian data protection laws, please contact:
                </p>
                <p style={{ marginTop: "12px", fontWeight: 700, color: "var(--color-primary)" }}>
                  privacy@decisional.in
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

