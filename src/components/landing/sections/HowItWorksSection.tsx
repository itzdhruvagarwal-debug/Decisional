"use client";

import { useState } from "react";
import { homeSteps } from "@/lib/home-content";
import { RevealOnScroll } from "@/components/landing/LandingHelpers";
import { Button } from "@/components/ui/Button";

export function HowItWorksSection() {
  const [activeTab, setActiveTab] = useState<"influencer" | "brand">("influencer");

  return (
    <section id="how-it-works" className="section bg-secondary">
      <div className="container">
        <RevealOnScroll>
          <h2 className="section-title">
            How It <span className="gradient-text">Works</span>
          </h2>
        </RevealOnScroll>
        <RevealOnScroll delay={0.1}>
          <p className="section-subtitle">
            Simple, transparent, and secure. Here&apos;s your journey on VyaparMedia.
          </p>
        </RevealOnScroll>

        <RevealOnScroll delay={0.15}>
          <div className="landing-segmented flex justify-center gap-1 bg-tertiary p-1 mb-10 rounded-full">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setActiveTab("influencer")}
              className="landing-segmented-button flex-1 text-sm rounded-full"
              data-active={activeTab === "influencer"}
            >
              For Influencers
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setActiveTab("brand")}
              className="landing-segmented-button flex-1 text-sm rounded-full"
              data-active={activeTab === "brand"}
            >
              For Brands
            </Button>
          </div>
        </RevealOnScroll>

        <div className="landing-steps flex flex-col gap-4 mx-auto">
          {homeSteps.map((step, index) => {
            const currentStep =
              activeTab === "influencer" ? step.forInfluencer : step.forBrand;
            return (
              <RevealOnScroll key={`${activeTab}-${index}`} delay={index * 0.1}>
                <div className="card hover-lift step-card flex items-center gap-5">
                  <div className="landing-step-number flex items-center justify-center font-extrabold flex-shrink-0 bg-gradient-primary rounded-full text-2xl">
                    {currentStep.step}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold mb-1 text-base">{currentStep.title}</h3>
                    <p className="text-secondary text-sm leading-relaxed">
                      {currentStep.description}
                    </p>
                  </div>
                </div>
              </RevealOnScroll>
            );
          })}
        </div>
      </div>
    </section>
  );
}
