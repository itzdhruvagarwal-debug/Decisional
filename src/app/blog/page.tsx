"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useState } from "react";
import { Button, Input } from "@/components/ui";

import { z } from "zod";

export default function BlogPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);

    const validation = z.string().email("Please enter a valid email address").safeParse(email.trim());
    if (!validation.success) {
      setStatus({
        type: "error",
        message: validation.error.issues[0]?.message || "Invalid email address",
      });
      return;
    }

    setLoading(true);

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
    <div className="flex flex-col min-h-screen bg-primary">
      <Navbar />

      <main className="flex-1 flex items-center justify-center pt-30 pb-20">
        <section className="section w-full relative">
          {/* Subtle glowing radial background for depth */}
          <div
            className="absolute pointer-events-none z-0" style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "400px", height: "400px", background: "radial-gradient(circle, rgba(99, 102, 241, 0.08) 0%, transparent 70%)" }}
          />

          <div className="container relative text-center max-w-640 z-1">
            <div
              className="badge badge-primary animate-fade-in mb-6 text-xs font-extrabold uppercase px-4-py-2 tracking-wider"
            >
              Knowledge Base
            </div>

            <h1
              className="section-title animate-fade-in mb-5 font-extrabold" style={{ fontSize: "clamp(32px, 5vw, 56px)", lineHeight: 1.15, letterSpacing: "-0.02em" }}
            >
              Practical Guides <br />
              <span className="gradient-text-animated">Coming Soon</span>
            </h1>

            <p
              className="section-subtitle animate-fade-in text-secondary mb-10 text-base" style={{ lineHeight: 1.75, animationDelay: "0.1s" }}
            >
              We are finalizing operational playbooks and compliance guides for Indian influencer marketing. Expect deep-dives on TDS compliance under Section 194-O, GST invoicing rules, and fake-engagement audit checklists.
            </p>

            <div
              className="card glass animate-fade-in p-6 border-card" style={{ borderRadius: "var(--radius-lg, 12px)", background: "rgba(30, 41, 59, 0.4)", animationDelay: "0.2s" }}
            >
              <h3 className="text-base font-bold mb-2">
                Get Notified of New Content
              </h3>
              <p className="text-muted text-sm mb-4">
                We'll send you occasional updates when we publish new guides and resources. No spam, unsubscribe anytime.
              </p>

              {status && (
                <div
                  className="p-3 mb-4 text-sm font-medium text-center" style={{ borderRadius: "var(--radius-md, 8px)", background: status.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)", border: `1px solid ${status.type === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`, color: status.type === "success" ? "#10b981" : "#ef4444" }}
                >
                  {status.message}
                </div>
              )}

              <form
                onSubmit={handleSubmit}
                className="flex flex-wrap justify-center gap-2-5"
              >
                <Input
                  type="email"
                  placeholder="Enter your work email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className="flex-1 min-w-200"
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
