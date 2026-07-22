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
      className="bg-secondary border-top" style={{ padding: "64px 0 24px" }}
    >
      <div className="container">
        <div
          className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "40px", marginBottom: "48px" }}
        >
          <div style={{ gridColumn: "span 1" }}>
            <Logo />
            <p
              className="text-secondary text-sm" style={{ lineHeight: 1.7, maxWidth: "280px" }}
            >
              Decisional helps Indian brands and influencers run trusted
              collaborations with verified profiles, protected payments, and
              clearer delivery workflows.
            </p>
            <div
              className="flex gap-3" style={{ marginTop: "20px" }}
            >
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  className="flex items-center justify-center text-xs font-extrabold cursor-pointer rounded-sm bg-tertiary border-card" style={{ width: "36px", height: "36px", transition: "all var(--transition-fast)", color: "inherit", textDecoration: "none" }}
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
          className="flex justify-between items-center flex-wrap gap-3"
        >
          <p
            className="text-muted text-sm"
          >
            (c) 2026 Decisional. All rights reserved.
          </p>
          <p
            className="text-muted text-sm"
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
}: Readonly<{
  title: string;
  links: Array<{ label: string; href: string }>;
}>) {
  return (
    <div>
      <h4
        className="font-bold mb-4 text-sm"
      >
        {title}
      </h4>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {links.map((item) => (
          <li key={item.label} style={{ marginBottom: "10px" }}>
            <Link
              href={item.href}
              className="text-secondary text-sm" style={{ transition: "color var(--transition-fast)" }}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
