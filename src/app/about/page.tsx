"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const values = [
  {
    label: "Verified trust",
    title: "Real parties, real records",
    description:
      "KYC, PAN/GST checks, social verification, ledger trails, and dispute evidence help both sides collaborate with confidence.",
  },
  {
    label: "Payment safety",
    title: "Escrow-first collaboration",
    description:
      "Campaign funds, contract signing, content approvals, and payout releases are connected so money does not move blindly.",
  },
  {
    label: "Creator respect",
    title: "Clear work, clear payout",
    description:
      "Creators get briefs, deadlines, protected messages, content review status, and payout visibility in one place.",
  },
];

export default function AboutPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar />

      <main style={{ flex: 1, paddingTop: "80px" }}>
        <section className="section" style={{ background: "var(--color-bg-secondary)" }}>
          <div className="container" style={{ textAlign: "center", maxWidth: "840px" }}>
            <h1 className="section-title">
              Decisional helps brands and creators run trusted collaborations
            </h1>
            <p className="section-subtitle">
              Secure payments, verified profiles, clear campaign workflows, and dispute-ready records for the Indian creator economy.
            </p>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="grid-2" style={{ alignItems: "center", gap: "48px" }}>
              <div>
                <h2 style={{ fontSize: "32px", fontWeight: 800, marginBottom: "20px" }}>
                  Why Decisional exists
                </h2>
                <p style={bodyStyle}>
                  Influencer campaigns often fail because the basics are scattered:
                  unclear briefs, risky advance payments, fake reach, missing approvals,
                  tax confusion, and no reliable record when a deal goes wrong.
                </p>
                <p style={bodyStyle}>
                  Decisional brings those moving parts into one protected workflow. Brands
                  can fund campaigns, review applications, sign contracts, approve content,
                  and resolve disputes. Influencers can discover relevant campaigns, submit
                  work, track payments, and build trust through verified performance.
                </p>
              </div>
              <div style={visualPanelStyle}>
                <div style={{ maxWidth: "340px" }}>
                  <div style={{ fontSize: "13px", color: "var(--color-primary-light)", fontWeight: 800, marginBottom: "12px", textTransform: "uppercase" }}>
                    Built for operational trust
                  </div>
                  <h3 style={{ fontSize: "28px", lineHeight: 1.2, marginBottom: "16px" }}>
                    Brief. Escrow. Verify. Release.
                  </h3>
                  <p style={{ color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
                    Every deal has a visible trail: who agreed, what was promised, when work was submitted, how it was approved, and how payment moved.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section" style={{ background: "var(--color-bg-secondary)" }}>
          <div className="container">
            <h2 className="section-title">What we optimize for</h2>
            <div className="grid-3">
              {values.map((item) => (
                <article key={item.title} className="card">
                  <div style={{ color: "var(--color-primary-light)", fontSize: "12px", fontWeight: 800, marginBottom: "12px", textTransform: "uppercase" }}>
                    {item.label}
                  </div>
                  <h3 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "10px" }}>
                    {item.title}
                  </h3>
                  <p style={{ color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
                    {item.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

const bodyStyle = {
  color: "var(--color-text-secondary)",
  marginBottom: "16px",
  lineHeight: 1.7,
};

const visualPanelStyle = {
  minHeight: "360px",
  background:
    "linear-gradient(135deg, rgba(109, 40, 255, 0.12), rgba(16, 185, 129, 0.1))",
  borderRadius: "24px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid rgba(109, 40, 255, 0.22)",
  padding: "32px",
};
