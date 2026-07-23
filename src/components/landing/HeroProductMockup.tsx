"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function HeroProductMockup() {
  const [view, setView] = useState<"influencer" | "brand">("influencer");

  return (
    <div
      className="animate-fade-in flex flex-col items-center gap-4 w-full max-w-840" style={{ marginTop: "48px", marginInline: "auto" }}
    >
      {/* Mockup View Selector */}
      <div
        className="inline-flex bg-secondary p-1 border-card rounded-full"
      >
        <Button
          type="button"
          variant="ghost"
          onClick={() => setView("influencer")}
          className="text-sm font-semibold border-none px-4-py-2 rounded-full" style={{ background: view === "influencer" ? "var(--color-bg-tertiary)" : "transparent", color: view === "influencer" ? "white" : "var(--color-text-secondary)", transition: "all var(--transition-fast)" }}
        >
          Influencer View
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setView("brand")}
          className="text-sm font-semibold border-none px-4-py-2 rounded-full" style={{ background: view === "brand" ? "var(--color-bg-tertiary)" : "transparent", color: view === "brand" ? "white" : "var(--color-text-secondary)", transition: "all var(--transition-fast)" }}
        >
          Brand View
        </Button>
      </div>

      {/* Main Glassmorphic Container */}
      <div
        className="w-full p-6 text-left relative overflow-hidden bg-glass rounded-xl backdrop-blur-lg" style={{ WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255, 255, 255, 0.08)", boxShadow: "0 24px 50px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)" }}
      >
        {/* Glow Effects */}
        <div
          className="absolute rounded-full pointer-events-none bg-color-primary" style={{ top: "-50px", right: "-50px", width: "150px", height: "150px", filter: "blur(80px)", opacity: 0.15 }}
        />
        <div
          className="absolute rounded-full pointer-events-none" style={{ bottom: "-50px", left: "-50px", width: "150px", height: "150px", background: "var(--color-secondary)", filter: "blur(80px)", opacity: 0.15 }}
        />

        {/* Mockup Header */}
        <div
          className="flex items-center justify-between mb-5 pb-4" style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}
        >
          <div className="flex items-center gap-2">
            <span
              className="rounded-full" style={{ width: "10px", height: "10px", background: "var(--color-success)", boxShadow: "0 0 8px var(--color-success)" }}
            />
            <span className="text-sm font-bold text-white">
              {view === "influencer" ? "Influencer Workspace" : "Brand Campaign Control"}
            </span>
          </div>
          <span className="text-xs text-muted">
            Live Escrow Protection Active 🔒
          </span>
        </div>

        {view === "influencer" ? (
          /* ============ INFLUENCER DASHBOARD MOCK ============ */
          <div className="flex flex-col gap-5">
            {/* Top Stats Row */}
            <div className="grid gap-4 grid-auto-140">
              <div className="bg-glass rounded-lg px-4-py-3" style={{ border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                <span className="text-muted block text-xs">Wallet Balance</span>
                <span className="text-xl font-extrabold text-white">₹42,850</span>
              </div>
              <div className="bg-glass rounded-lg px-4-py-3" style={{ border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                <span className="text-muted block text-xs">Trust Score</span>
                <span className="text-xl font-extrabold text-emerald">98% <span className="text-xs font-normal">(Excellent)</span></span>
              </div>
              <div className="bg-glass rounded-lg px-4-py-3" style={{ border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                <span className="text-muted block text-xs">Gamification Tier</span>
                <span className="text-xl font-extrabold text-amber">Gold IV 🏆</span>
              </div>
            </div>

            {/* Active Deal Status */}
            <div className="p-4 bg-glass rounded-lg" style={{ border: "1px solid rgba(255, 255, 255, 0.06)" }}>
              <div className="flex justify-between mb-3">
                <div>
                  <h4 className="text-sm font-bold mb-1 text-white">Nike India: Air Max Launch</h4>
                  <span className="text-xs text-secondary">Deliverable: 1 Instagram Reel + 1 Story</span>
                </div>
                <div className="inline-flex text-xs font-semibold bg-emerald-subtle text-emerald rounded-sm px-2-py-1" style={{ height: "fit-content" }}>
                  ₹25,000 in Escrow
                </div>
              </div>

              {/* Status Stepper */}
              <div className="flex items-center justify-between relative mt-5">
                {/* Stepper Background Line */}
                <div className="absolute z-0" style={{ left: "20px", right: "20px", height: "2px", background: "rgba(255, 255, 255, 0.1)" }} />
                
                {/* Stepper Active Line */}
                <div className="absolute bg-color-primary z-0" style={{ left: "20px", width: "50%", height: "2px" }} />

                {/* Step 1: Signed */}
                <div className="flex flex-col items-center relative gap-1-5 z-1">
                  <div className="flex items-center justify-center text-xs font-bold rounded-full text-white w-24 h-24 bg-color-primary">✓</div>
                  <span className="font-semibold text-2xs text-white">Signed</span>
                </div>

                {/* Step 2: Escrow Verified */}
                <div className="flex flex-col items-center relative gap-1-5 z-1">
                  <div className="flex items-center justify-center text-xs font-bold rounded-full text-white w-24 h-24 bg-color-primary">✓</div>
                  <span className="font-semibold text-2xs text-white">Escrowed</span>
                </div>

                {/* Step 3: Submission Under Review */}
                <div className="flex flex-col items-center relative gap-1-5 z-1">
                  <div className="flex items-center justify-center text-xs rounded-full bg-tertiary text-white w-24 h-24" style={{ border: "2px solid var(--color-primary)", animation: "pulse 2s infinite" }}>●</div>
                  <span className="font-semibold text-2xs text-white">Reviewing</span>
                </div>

                {/* Step 4: Complete & Disbursed */}
                <div className="flex flex-col items-center relative gap-1-5 z-1">
                  <div className="flex items-center justify-center text-muted rounded-full bg-tertiary text-2xs w-24 h-24" style={{ border: "1px solid rgba(255, 255, 255, 0.2)" }}>🔒</div>
                  <span className="text-muted text-2xs">Payout</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ============ BRAND DASHBOARD MOCK ============ */
          <div className="flex flex-col gap-5">
            {/* Top Stats Row */}
            <div className="grid gap-4 grid-auto-140">
              <div className="bg-glass rounded-lg px-4-py-3" style={{ border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                <span className="text-muted block text-xs">Active Campaigns</span>
                <span className="text-xl font-extrabold text-white">3 Campaigns</span>
              </div>
              <div className="bg-glass rounded-lg px-4-py-3" style={{ border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                <span className="text-muted block text-xs">Secured Escrow</span>
                <span className="text-xl font-extrabold text-cyan">₹1,85,000</span>
              </div>
              <div className="bg-glass rounded-lg px-4-py-3" style={{ border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                <span className="text-muted block text-xs">ROI Index</span>
                <span className="text-xl font-extrabold text-emerald">3.8x Profit</span>
              </div>
            </div>

            {/* Campaign Submissions */}
            <div className="p-4 bg-glass rounded-lg" style={{ border: "1px solid rgba(255, 255, 255, 0.06)" }}>
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-sm font-bold text-white">Submissions Awaiting Approval (1)</h4>
                <span className="flex items-center gap-1 text-xs text-amber">
                  <span className="rounded-full h-6" style={{ width: "6px", background: "var(--color-accent-amber)", animation: "pulse 1.5s infinite" }} />{" "}
                  48h Review Timer Running
                </span>
              </div>

              {/* Creator Submission list item */}
              <div className="flex items-center justify-between p-3 flex-wrap bg-glass rounded-md gap-2-5" style={{ border: "1px solid rgba(255, 255, 255, 0.04)" }}>
                <div className="flex items-center gap-2-5">
                  <div className="flex items-center justify-center font-extrabold text-xs rounded-full text-white w-32 h-32 bg-color-primary">
                    AM
                  </div>
                  <div>
                    <span className="text-sm font-semibold block text-white">Ananya Mehta</span>
                    <span className="text-secondary text-xs">Instagram post content ready for review</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" className="text-xs rounded-sm px-3-py-1 bg-none text-white" style={{ border: "1px solid rgba(255, 255, 255, 0.1)" }}>
                    View Draft
                  </Button>
                  <Button type="button" variant="primary" className="font-semibold border-none text-xs rounded-sm px-3-py-1 bg-gradient-primary text-white" style={{ boxShadow: "var(--shadow-glow-primary)" }}>
                    Approve
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
