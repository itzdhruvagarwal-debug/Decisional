"use client";

import { homeFeatures } from "@/lib/home-content";
import { RevealOnScroll, getFeatureIcon } from "@/components/landing/LandingHelpers";

export function FeaturesSection() {
  return (
    <section id="features" className="section mesh-bg relative">
      <div className="container">
        <RevealOnScroll>
          <h2 className="section-title">
            Why Choose <span className="gradient-text">VyaparMedia</span>?
          </h2>
        </RevealOnScroll>
        <RevealOnScroll delay={0.1}>
          <p className="section-subtitle">
            Built with trust as the foundation. Every feature is designed to protect both
            creators and brands.
          </p>
        </RevealOnScroll>

        <div className="grid-3">
          {homeFeatures.map((feature, index) => (
            <RevealOnScroll key={feature.title} delay={index * 0.08}>
              <div className="card hover-lift h-full">
                <div className="feature-icon">{getFeatureIcon(feature.icon)}</div>
                <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
                <p className="text-secondary text-sm leading-relaxed">{feature.description}</p>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}
