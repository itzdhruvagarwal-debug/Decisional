"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { InfluencerMockup } from "./InfluencerMockup";
import { BrandMockup } from "./BrandMockup";

export function HeroProductMockup() {
  const [view, setView] = useState<"influencer" | "brand">("influencer");

  return (
    <div className="hero-product-mockup animate-fade-in flex flex-col items-center gap-4 w-full max-w-840">
      {/* View Selector */}
      <div className="inline-flex bg-secondary p-1 border-card rounded-full">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setView("influencer")}
          className="mockup-view-toggle text-sm font-semibold border-none px-4-py-2 rounded-full"
          data-active={view === "influencer"}
        >
          Influencer View
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setView("brand")}
          className="mockup-view-toggle text-sm font-semibold border-none px-4-py-2 rounded-full"
          data-active={view === "brand"}
        >
          Brand View
        </Button>
      </div>

      {/* Glassmorphic Panel */}
      <div className="mockup-panel w-full p-6 text-left relative overflow-hidden bg-glass rounded-xl backdrop-blur-lg">
        <div className="mockup-glow mockup-glow-primary absolute rounded-full pointer-events-none bg-color-primary" />
        <div className="mockup-glow mockup-glow-secondary absolute rounded-full pointer-events-none" />

        {/* Panel Header */}
        <div className="mockup-header flex items-center justify-between mb-5 pb-4">
          <div className="flex items-center gap-2">
            <span className="mockup-live-dot rounded-full" />
            <span className="text-sm font-bold text-white">
              {view === "influencer" ? "Influencer Workspace" : "Brand Campaign Control"}
            </span>
          </div>
          <span className="text-xs text-muted">Live Escrow Protection Active</span>
        </div>

        {view === "influencer" ? <InfluencerMockup /> : <BrandMockup />}
      </div>
    </div>
  );
}
