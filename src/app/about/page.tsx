"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function AboutPage() {
  return (
    <div
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
    >
      <Navbar />

      <main style={{ flex: 1, paddingTop: "80px" }}>
        {/* Hero */}
        <section
          className="section"
          style={{ background: "var(--color-bg-secondary)" }}
        >
          <div
            className="container"
            style={{ textAlign: "center", maxWidth: "800px" }}
          >
            <h1 className="section-title">
              Turning <span className="gradient-text">Signals</span> &{" "}
              <span className="gradient-text">Data</span> into Clarity
            </h1>
            <p className="section-subtitle">
              We're on a mission to sit between chaos and action — and bring
              structure, visibility, and confidence into decisions.
            </p>
          </div>
        </section>

        {/* Story */}
        <section className="section">
          <div className="container">
            <div className="grid-2" style={{ alignItems: "center" }}>
              <div>
                <h2
                  style={{
                    fontSize: "32px",
                    fontWeight: 800,
                    marginBottom: "24px",
                  }}
                >
                  Our Story
                </h2>
                <p
                  style={{
                    color: "var(--color-text-secondary)",
                    marginBottom: "16px",
                    lineHeight: 1.7,
                  }}
                >
                  The world doesn't lack data. It lacks clarity. Decisions
                  today are made either too fast — without insight — or too late
                  — after damage. Decisional was built to sit between chaos and
                  action, and bring structure, visibility, and confidence into
                  every decision.
                </p>
                <p
                  style={{
                    color: "var(--color-text-secondary)",
                    marginBottom: "16px",
                    lineHeight: 1.7,
                  }}
                >
                  We built Decisional to bridge the gap between raw signals and
                  smart action. By combining secure escrow payments, AI-driven
                  verification, and a trust-first reputation system, we've
                  created a transparent and data-powered environment for
                  collaborations.
                </p>
              </div>
              <div
                style={{
                  height: "400px",
                  background:
                    "linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(6, 182, 212, 0.1) 100%)",
                  borderRadius: "24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid rgba(16, 185, 129, 0.2)"
                }}
              >
                <span style={{ fontSize: "80px", filter: "drop-shadow(0 0 20px rgba(16, 185, 129, 0.4))" }}>🎯</span>
              </div>
            </div>
          </div>
        </section>

        {/* Values */}
        <section
          className="section"
          style={{ background: "var(--color-bg-secondary)" }}
        >
          <div className="container">
            <h2 className="section-title">Our Core Values</h2>
            <div className="grid-3">
              {[
                {
                  icon: "🛡️",
                  title: "Trust First",
                  desc: "We prioritize safety with verified profiles and secure payments.",
                },
                {
                  icon: "💡",
                  title: "Innovation",
                  desc: "Using AI to detect fraud and match the right partners.",
                },
                {
                  icon: "🔥",
                  title: "Empowerment",
                  desc: "Helping creators turn their passion into a sustainable career.",
                },
              ].map((item, i) => (
                <div key={i} className="card">
                  <div style={{ fontSize: "40px", marginBottom: "16px" }}>
                    {item.icon}
                  </div>
                  <h3
                    style={{
                      fontSize: "20px",
                      fontWeight: 700,
                      marginBottom: "8px",
                    }}
                  >
                    {item.title}
                  </h3>
                  <p style={{ color: "var(--color-text-secondary)" }}>
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
