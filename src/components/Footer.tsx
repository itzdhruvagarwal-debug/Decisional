"use client";

import Link from "next/link";
import Logo from "./Logo";

export default function Footer() {
  return (
    <footer
      style={{
        background: "var(--color-bg-secondary)",
        padding: "64px 0 24px",
        borderTop: "1px solid var(--color-border)",
      }}
    >
      <div className="container">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "40px",
            marginBottom: "48px",
          }}
        >
          {/* Brand Column */}
          <div style={{ gridColumn: "span 1" }}>
            <Logo />
            <p
              style={{
                color: "var(--color-text-secondary)",
                fontSize: "14px",
                lineHeight: 1.7,
                maxWidth: "280px",
              }}
            >
              Turning signals into decisions. India&apos;s most trusted
              influencer marketplace. Secure, transparent, and data-driven.
            </p>
            {/* Social Icons */}
            <div
              style={{
                display: "flex",
                gap: "12px",
                marginTop: "20px",
              }}
            >
              {[
                {
                  icon: "𝕏",
                  href: "https://twitter.com",
                  label: "X (Twitter)",
                },
                {
                  icon: "📸",
                  href: "https://instagram.com",
                  label: "Instagram",
                },
                { icon: "▶", href: "https://youtube.com", label: "YouTube" },
                { icon: "💼", href: "https://linkedin.com", label: "LinkedIn" },
              ].map((social, i) => (
                <a
                  key={i}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--color-bg-tertiary)",
                    border: "1px solid var(--color-border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "14px",
                    cursor: "pointer",
                    transition: "all var(--transition-fast)",
                    color: "inherit",
                    textDecoration: "none",
                  }}
                >
                  {social.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Platform */}
          <div>
            <h4
              style={{
                fontWeight: 700,
                marginBottom: "16px",
                fontSize: "15px",
              }}
            >
              Platform
            </h4>
            <ul style={{ listStyle: "none" }}>
              {[
                { label: "For Influencers", href: "/register?type=influencer" },
                { label: "For Brands", href: "/register?type=brand" },
                { label: "Pricing", href: "/pricing" },
              ].map((item) => (
                <li key={item.label} style={{ marginBottom: "10px" }}>
                  <Link
                    href={item.href}
                    style={{
                      color: "var(--color-text-secondary)",
                      fontSize: "14px",
                      transition: "color var(--transition-fast)",
                    }}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4
              style={{
                fontWeight: 700,
                marginBottom: "16px",
                fontSize: "15px",
              }}
            >
              Company
            </h4>
            <ul style={{ listStyle: "none" }}>
              {[
                { label: "About Us", href: "/about" },
                { label: "Blog", href: "/blog" },
                { label: "Contact", href: "/contact" },
              ].map((item) => (
                <li key={item.label} style={{ marginBottom: "10px" }}>
                  <Link
                    href={item.href}
                    style={{
                      color: "var(--color-text-secondary)",
                      fontSize: "14px",
                      transition: "color var(--transition-fast)",
                    }}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4
              style={{
                fontWeight: 700,
                marginBottom: "16px",
                fontSize: "15px",
              }}
            >
              Legal
            </h4>
            <ul style={{ listStyle: "none" }}>
              {[
                { label: "Privacy Policy", href: "/privacy" },
                { label: "Terms of Service", href: "/terms" },
                { label: "Refund Policy", href: "/refund" },
                { label: "Cookie Policy", href: "/cookie-policy" },
              ].map((item) => (
                <li key={item.label} style={{ marginBottom: "10px" }}>
                  <Link
                    href={item.href}
                    style={{
                      color: "var(--color-text-secondary)",
                      fontSize: "14px",
                      transition: "color var(--transition-fast)",
                    }}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="divider" />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <p
            style={{
              color: "var(--color-text-muted)",
              fontSize: "13px",
            }}
          >
            © 2026 Decisional. All rights reserved.
          </p>
          <p
            style={{
              color: "var(--color-text-muted)",
              fontSize: "13px",
            }}
          >
            Made with ❤️ in India
          </p>
        </div>
      </div>
    </footer>
  );
}
