import type { AppIconName } from "./types";

const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
} as const;

export function AppIcon({
  name,
  size = 20,
}: Readonly<{ name: AppIconName; size?: number }>) {
  const props = { ...ICON_PROPS, width: size, height: size };

  switch (name) {
    case "analytics":
      return (
        <svg {...props}>
          <path d="M4 19V9" />
          <path d="M10 19V5" />
          <path d="M16 19v-7" />
          <path d="M22 19H2" />
        </svg>
      );
    case "badge":
      return (
        <svg {...props}>
          <path d="m12 3 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.4 7.2 18l.9-5.4-3.9-3.8 5.4-.8L12 3Z" />
        </svg>
      );
    case "bell":
      return (
        <svg {...props}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
      );
    case "campaigns":
      return (
        <svg {...props}>
          <path d="M4 6h16" />
          <path d="M4 12h10" />
          <path d="M4 18h7" />
          <path d="m17 14 3 3-3 3" />
        </svg>
      );
    case "chat":
      return (
        <svg {...props}>
          <path d="M21 12a8 8 0 0 1-8 8H7l-4 2 1.4-4.2A8 8 0 1 1 21 12Z" />
        </svg>
      );
    case "deals":
      return (
        <svg {...props}>
          <path d="M8 11 4 15a3 3 0 0 0 4 4l2-2" />
          <path d="m14 7 2-2a3 3 0 0 1 4 4l-4 4" />
          <path d="m8 16 8-8" />
          <path d="m12 12 2 2" />
        </svg>
      );
    case "disputes":
      return (
        <svg {...props}>
          <path d="M12 3 3 7v6c0 5 4 8 9 8s9-3 9-8V7l-9-4Z" />
          <path d="M12 8v5" />
          <path d="M12 17h.01" />
        </svg>
      );
    case "home":
      return (
        <svg {...props}>
          <path d="m3 11 9-8 9 8" />
          <path d="M5 10v10h14V10" />
          <path d="M10 20v-6h4v6" />
        </svg>
      );
    case "leaderboard":
      return (
        <svg {...props}>
          <path d="M7 20V9" />
          <path d="M12 20V4" />
          <path d="M17 20v-7" />
          <path d="M4 20h16" />
        </svg>
      );
    case "menu":
      return (
        <svg {...props}>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
      );
    case "plus":
      return (
        <svg {...props}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case "referrals":
      return (
        <svg {...props}>
          <path d="M16 11a4 4 0 1 0-8 0" />
          <path d="M4 21a8 8 0 0 1 16 0" />
          <path d="M19 8h3" />
          <path d="M20.5 6.5v3" />
        </svg>
      );
    case "search":
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case "settings":
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="3" />
          <path d="M4 21a8 8 0 0 1 16 0" />
          <path d="M20 4h2" />
          <path d="M21 3v2" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...props}>
          <path d="M4 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h13" />
          <path d="M16 13h.01" />
        </svg>
      );
    default:
      return null;
  }
}

export function getNavIcon(label: string): AppIconName {
  const icons: Record<string, AppIconName> = {
    Analytics: "analytics",
    Dashboard: "home",
    "Create Campaign": "plus",
    Campaigns: "campaigns",
    "My Campaigns": "campaigns",
    "My Applications": "deals",
    "Find Influencers": "search",
    "My Deals": "deals",
    Wallet: "wallet",
    Messages: "chat",
    Disputes: "disputes",
    Leaderboard: "leaderboard",
    Badges: "badge",
    Referrals: "referrals",
    "Support & Feedback": "chat",
    Settings: "settings",
    "Admin Panel": "settings",
  };
  return icons[label] || "home";
}

export function getPageTitle(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const map: Record<string, string> = {
    dashboard: "Dashboard",
    analytics: "Analytics",
    campaigns: "Campaigns",
    deals: "My Deals",
    applications: "My Applications",
    wallet: "Wallet",
    messages: "Messages",
    disputes: "Disputes",
    leaderboard: "Leaderboard",
    badges: "Badges",
    referrals: "Referrals",
    support: "Support & Feedback",
    settings: "Settings",
    influencers: "Find Influencers",
    create: "Create Campaign",
  };
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg && !/^[a-f0-9-]{20,}$/.test(seg) && map[seg]) {
      return map[seg];
    }
  }
  return "Dashboard";
}
