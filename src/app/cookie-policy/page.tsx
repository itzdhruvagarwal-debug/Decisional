"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function CookiePage() {
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
              Cookie Policy
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
                  1. How We Use Cookies
                </h2>
                <p>
                  To ensure Decisional remains secure, transparent, and high-performing, we use
                  cookies to identify your session, remember your preferences, and protect
                  your financial transactions.
                </p>
              </div>

              <div className="card" style={{ padding: "24px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--color-border)" }}>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "16px" }}>
                  2. Essential Cookies (Strictly Necessary)
                </h2>
                <ul className="list-disc pl-6 space-y-4">
                  <li>
                    <strong>Authentication:</strong> These cookies keep you logged in as you navigate the platform and verify your identity during 2FA (Two-Factor Authentication) challenges.
                  </li>
                  <li>
                    <strong>Security & Anti-Fraud:</strong> Used to detect and prevent automated attacks (bots) and unauthorized access attempts.
                  </li>
                  <li>
                    <strong>Payment Integrity (Razorpay):</strong> Essential cookies set by our payment partner, Razorpay, to ensure your transactions are executed securely and to prevent credit card fraud.
                  </li>
                </ul>
              </div>

              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "16px" }}>
                  3. Performance & Analytics
                </h2>
                <p>
                  We use performance cookies to understand how Brands interact with campaign tools
                  and how Influencers browse the marketplace. This helps us optimize the
                  user experience and fix platform bugs.
                </p>
              </div>

              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "16px" }}>
                  4. Managing Your Preferences
                </h2>
                <p>
                  Most browsers allow you to refuse or delete cookies via their settings.
                  Please note that disabling **Essential Cookies** will prevent you from
                  logging in or completing payments on Decisional.
                </p>
              </div>

              <div style={{ padding: "32px", background: "var(--color-bg-secondary)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)", textAlign: "center", marginTop: "48px" }}>
                <p style={{ fontSize: "14px", color: "var(--color-text-muted)" }}>
                  For more detailed information on specific tracking technologies, please contact:
                  <br />
                  <strong style={{ color: "var(--color-primary)" }}>support@decisional.in</strong>
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

