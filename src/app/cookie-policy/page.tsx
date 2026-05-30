"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function CookiePage() {
  const lastUpdated = "May 30, 2026";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar />

      <main style={{ flex: 1, paddingTop: "80px" }}>
        <section className="section">
          <div className="container" style={{ maxWidth: "860px" }}>
            <h1 className="section-title gradient-text" style={{ fontSize: "40px", fontWeight: 900, marginBottom: "12px" }}>
              Cookie Policy
            </h1>
            <p className="text-secondary" style={{ marginBottom: "40px", fontWeight: 600 }}>
              Last updated: {lastUpdated}
            </p>

            <div style={{ lineHeight: 1.8, color: "var(--color-text-secondary)", fontSize: "15px", display: "grid", gap: "32px" }}>
              <section>
                <h2 style={headingStyle}>1. What cookies do</h2>
                <p>
                  Cookies and similar technologies help Decisional keep users signed in, secure
                  payments, remember preferences, detect abuse, measure reliability, and improve
                  the PWA experience.
                </p>
              </section>

              <section className="card" style={panelStyle}>
                <h2 style={headingStyle}>2. Types we use</h2>
                <ul className="list-disc pl-6 space-y-3">
                  <li>
                    <strong>Essential cookies:</strong> authentication, CSRF protection, session
                    continuity, role-based access, 2FA, OTP verification, and service worker state.
                  </li>
                  <li>
                    <strong>Security cookies:</strong> rate-limit, anti-fraud, device, IP, and
                    login-risk signals.
                  </li>
                  <li>
                    <strong>Payment cookies:</strong> Razorpay and banking security checks needed
                    to complete or verify transactions.
                  </li>
                  <li>
                    <strong>Performance cookies:</strong> analytics, error diagnostics, and feature
                    reliability metrics.
                  </li>
                  <li>
                    <strong>Preference cookies:</strong> remembered settings, UI state, language,
                    and notification choices.
                  </li>
                </ul>
              </section>

              <section>
                <h2 style={headingStyle}>3. Your choices</h2>
                <p>
                  You can block or delete cookies in your browser. Essential cookies are required
                  for login, payments, security, and dashboard access. If you block them, core
                  platform features may stop working.
                </p>
              </section>

              <section>
                <h2 style={headingStyle}>4. Contact</h2>
                <p>
                  For cookie or tracking questions, email{" "}
                  <a href="mailto:privacy@decisional.in" style={linkStyle}>privacy@decisional.in</a>.
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
