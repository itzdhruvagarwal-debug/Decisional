"use client";

import Image from "next/image";
import { homeTestimonials } from "@/lib/home-content";
import { RevealOnScroll, renderStars } from "@/components/landing/LandingHelpers";

export function TestimonialsSection() {
  return (
    <section className="section">
      <div className="container">
        <RevealOnScroll>
          <h2 className="section-title">
            Loved by <span className="gradient-text">Creators &amp; Brands</span>
          </h2>
        </RevealOnScroll>
        <RevealOnScroll delay={0.1}>
          <p className="section-subtitle">
            See how matching profiles, secure escrows, and gamified growth help run trusted
            partnerships.
          </p>
        </RevealOnScroll>

        <div className="grid-3">
          {homeTestimonials.map((testimonial, index) => (
            <RevealOnScroll key={testimonial.name} delay={index * 0.1}>
              <div className="card hover-lift text-center h-full">
                <div className="landing-testimonial-avatar avatar avatar-xl relative overflow-hidden rounded-full">
                  <Image
                    src={testimonial.avatar}
                    alt={testimonial.name}
                    width={80}
                    height={80}
                    className="object-cover w-full h-full rounded-full"
                  />
                </div>
                <h4 className="text-base font-bold">{testimonial.name}</h4>
                <p className="text-xs text-muted mb-1">
                  {testimonial.role}
                  {testimonial.followers &&
                    testimonial.followers !== "Brand" &&
                    ` - ${testimonial.followers} followers`}
                </p>
                {renderStars(testimonial.rating)}
                <p className="text-secondary text-sm leading-relaxed italic">
                  &quot;{testimonial.quote}&quot;
                </p>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}
