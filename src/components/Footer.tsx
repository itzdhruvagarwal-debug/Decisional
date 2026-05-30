"use client";

import Link from "next/link";
import Logo from "./Logo";

const platformLinks = [
  { label: "For Influencers", href: "/register?type=influencer" },
  { label: "For Brands", href: "/register?type=brand" },
  { label: "Pricing", href: "/pricing" },
];

const companyLinks = [
  { label: "About", href: "/about" },
  { label: "Blog", href: "/blog" },
  { label: "Contact", href: "/contact" },
];

const legalLinks = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms and Conditions", href: "/terms" },
  { label: "Refund Policy", href: "/refund" },
  { label: "Cookie Policy", href: "/cookie-policy" },
];

const socialLinks = [
  { label: "X", href: "https://twitter.com" },
  { label: "IG", href: "https://instagram.com" },
  { label: "YT", href: "https://youtube.com" },
  { label: "IN", href: "https://linkedin.com" },
];

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
              Decisional helps Indian brands and influencers run trusted
              collaborations with verified profiles, protected payments, and
              clearer delivery workflows.
            </p>
            <div
              style={{
                display: "flex",
                gap: "12px",
                marginTop: "20px",
              }}
            >
              {socialLinks.map((social) => (
                <a
                  key={social.label}
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
                    fontSize: "12px",
                    fontWeight: 800,
                    cursor: "pointer",
                    transition: "all var(--transition-fast)",
                    color: "inherit",
                    textDecoration: "none",
                  }}
                >
                  {social.label}
                </a>
              ))}
            </div>
          </div>

          <FooterColumn title="Platform" links={platformLinks} />
          <FooterColumn title="Company" links={companyLinks} />
          <FooterColumn title="Legal" links={legalLinks} />
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
            (c) 2026 Decisional. All rights reserved.
          </p>
          <p
            style={{
              color: "var(--color-text-muted)",
              fontSize: "13px",
            }}
          >
            Built in India for trusted collaborations.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: Array<{ label: string; href: string }>;
}) {
  return (
    <div>
      <h4
        style={{
          fontWeight: 700,
          marginBottom: "16px",
          fontSize: "15px",
        }}
      >
        {title}
      </h4>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {links.map((item) => (
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
  );
}
