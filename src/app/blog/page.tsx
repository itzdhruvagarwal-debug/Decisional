"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useState } from "react";
import { Button, Input } from "@/components/ui";

export default function BlogPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch("/api/blog/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to subscribe.");
      }

      setStatus({
        type: "success",
        message: "Thank you! Please check your inbox to verify your subscription.",
      });
      setEmail("");
    } catch (err: unknown) {
      setStatus({
        type: "error",
        message: (err instanceof Error ? err.message : String(err)) || "Failed to subscribe. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--color-bg-primary)" }}>
      <Navbar />

      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", paddingTop: "120px", paddingBottom: "80px" }}>
        <section className="section" style={{ width: "100%", position: "relative" }}>
          {/* Subtle glowing radial background for depth */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "400px",
              height: "400px",
              background: "radial-gradient(circle, rgba(99, 102, 241, 0.08) 0%, transparent 70%)",
              zIndex: 0,
              pointerEvents: "none",
            }}
          />

          <div className="container" style={{ position: "relative", zIndex: 1, maxWidth: "640px", textAlign: "center" }}>
            <div
              className="badge badge-primary animate-fade-in"
              style={{
                marginBottom: "24px",
                padding: "8px 16px",
                fontSize: "12px",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "1px",
              }}
            >
              Knowledge Base
            </div>

            <h1
              className="section-title animate-fade-in"
              style={{
                fontSize: "clamp(32px, 5vw, 56px)",
                fontWeight: 900,
                lineHeight: 1.15,
                marginBottom: "20px",
                letterSpacing: "-0.02em",
              }}
            >
              Practical Guides <br />
              <span className="gradient-text-animated">Coming Soon</span>
            </h1>

            <p
              className="section-subtitle animate-fade-in"
              style={{
                color: "var(--color-text-secondary)",
                fontSize: "17px",
                lineHeight: 1.75,
                marginBottom: "40px",
                animationDelay: "0.1s",
              }}
            >
              We are finalizing operational playbooks and compliance guides for Indian influencer marketing. Expect deep-dives on TDS compliance under Section 194-O, GST invoicing rules, and fake-engagement audit checklists.
            </p>

            <div
              className="card glass animate-fade-in"
              style={{
                padding: "24px",
                borderRadius: "var(--radius-lg, 12px)",
                border: "1px solid var(--color-border)",
                background: "rgba(30, 41, 59, 0.4)",
                animationDelay: "0.2s",
              }}
            >
              <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>
                Get Notified of New Content
              </h3>
              <p style={{ color: "var(--color-text-muted)", fontSize: "14px", marginBottom: "16px" }}>
                We'll send you occasional updates when we publish new guides and resources. No spam, unsubscribe anytime.
              </p>

              {status && (
                <div
                  style={{
                    padding: "12px",
                    borderRadius: "var(--radius-md, 8px)",
                    marginBottom: "16px",
                    fontSize: "14px",
                    fontWeight: 500,
                    textAlign: "center",
                    background: status.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                    border: `1px solid ${status.type === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                    color: status.type === "success" ? "#10b981" : "#ef4444",
                  }}
                >
                  {status.message}
                </div>
              )}

              <form
                onSubmit={handleSubmit}
                style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}
              >
                <Input
                  type="email"
                  placeholder="Enter your work email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  style={{
                    flex: 1,
                    minWidth: "200px",
                  }}
                />
                <Button type="submit" variant="primary" disabled={loading}>
                  {loading ? "Subscribing..." : "Notify Me"}
                </Button>
              </form>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
