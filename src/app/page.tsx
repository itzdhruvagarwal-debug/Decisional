"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { HeroSection } from "@/components/landing/sections/HeroSection";
import { FeaturesSection } from "@/components/landing/sections/FeaturesSection";
import { HowItWorksSection } from "@/components/landing/sections/HowItWorksSection";
import { TestimonialsSection } from "@/components/landing/sections/TestimonialsSection";
import { PricingSection } from "@/components/landing/sections/PricingSection";
import { CtaSection } from "@/components/landing/sections/CtaSection";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <TestimonialsSection />
      <PricingSection />
      <CtaSection />
      <Footer />
    </div>
  );
}
