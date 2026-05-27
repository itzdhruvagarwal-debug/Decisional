"use client";

import Link from "next/link";
import Logo from "./Logo";
import { useState, useEffect } from "react";

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Lock body when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileMenuOpen]);

  const closeMobile = () => setIsMobileMenuOpen(false);

  return (
    <>
      <nav className={`navbar glass ${isScrolled ? "navbar-scrolled" : ""}`}>
        <div
          className="container"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Logo />

          {/* Desktop Nav Links */}
          <div className="nav-links">
            {[
              { label: "Features", href: "/#features" },
              { label: "How it Works", href: "/#how-it-works" },
              { label: "Pricing", href: "/pricing" },
            ].map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="btn-ghost"
                style={{ padding: "8px 14px", fontSize: "14px" }}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop Auth Buttons */}
          <div className="nav-auth-buttons">
            <Link href="/login" className="btn btn-secondary btn-sm">
              Login
            </Link>
            <Link href="/register" className="btn btn-primary btn-sm">
              Get Started
            </Link>
          </div>

          {/* Hamburger Button */}
          <button
            className={`hamburger ${isMobileMenuOpen ? "active" : ""}`}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </nav>

      {/* Mobile Overlay */}
      <div
        className={`mobile-nav-overlay ${isMobileMenuOpen ? "active" : ""}`}
        onClick={closeMobile}
      />

      {/* Mobile Slide-out Menu */}
      <div className={`mobile-nav ${isMobileMenuOpen ? "active" : ""}`}>
        <Link href="/#features" onClick={closeMobile}>
          ✨ Features
        </Link>
        <Link href="/#how-it-works" onClick={closeMobile}>
          ⚙️ How it Works
        </Link>
        <Link href="/pricing" onClick={closeMobile}>
          💎 Pricing
        </Link>
        <Link href="/about" onClick={closeMobile}>
          📖 About Us
        </Link>
        <Link href="/blog" onClick={closeMobile}>
          📝 Blog
        </Link>
        <Link href="/contact" onClick={closeMobile}>
          📧 Contact
        </Link>

        <div className="mobile-auth">
          <Link
            href="/login"
            className="btn btn-secondary"
            onClick={closeMobile}
            style={{ textAlign: "center", justifyContent: "center" }}
          >
            Login
          </Link>
          <Link
            href="/register"
            className="btn btn-primary"
            onClick={closeMobile}
            style={{ textAlign: "center", justifyContent: "center" }}
          >
            Get Started Free
          </Link>
        </div>
      </div>
    </>
  );
}
