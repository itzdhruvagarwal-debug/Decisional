"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Logo from "./Logo";

const primaryLinks = [
  { label: "Features", href: "/#features" },
  { label: "How it Works", href: "/#how-it-works" },
  { label: "Pricing", href: "/pricing" },
];

const mobileLinks = [
  ...primaryLinks,
  { label: "About", href: "/about" },
  { label: "Blog", href: "/blog" },
  { label: "Contact", href: "/contact" },
];

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
          className="container flex items-center justify-between"
        >
          <Logo />

          <div className="nav-links">
            {primaryLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="btn-ghost text-sm" style={{ padding: "8px 14px" }}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="nav-auth-buttons">
            <Link href="/login" className="btn btn-secondary btn-sm">
              Login
            </Link>
            <Link href="/register" className="btn btn-primary btn-sm">
              Get Started
            </Link>
          </div>

          <button
            className={`hamburger ${isMobileMenuOpen ? "active" : ""}`}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
            aria-expanded={isMobileMenuOpen}
            type="button"
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </nav>

      <button
        type="button"
        className={`mobile-nav-overlay border-none p-0 bg-none ${isMobileMenuOpen ? "active" : ""}`}
        onClick={closeMobile}
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className={`mobile-nav ${isMobileMenuOpen ? "active" : ""}`}>
        {mobileLinks.map((link) => (
          <Link key={link.href} href={link.href} onClick={closeMobile}>
            {link.label}
          </Link>
        ))}

        <div className="mobile-auth">
          <Link
            href="/login"
            className="btn btn-secondary text-center justify-center"
            onClick={closeMobile}
          >
            Login
          </Link>
          <Link
            href="/register"
            className="btn btn-primary text-center justify-center"
            onClick={closeMobile}
          >
            Get Started Free
          </Link>
        </div>
      </div>
    </>
  );
}
