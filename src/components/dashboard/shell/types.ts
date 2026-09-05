// Shared types used across all DashboardShell sub-components

export type AppIconName =
  | "analytics"
  | "badge"
  | "bell"
  | "campaigns"
  | "chat"
  | "deals"
  | "disputes"
  | "home"
  | "leaderboard"
  | "menu"
  | "plus"
  | "referrals"
  | "search"
  | "settings"
  | "wallet";

export interface DashboardUser {
  id?: string | undefined;
  name?: string | null | undefined;
  email?: string | null | undefined;
  userType?: string | null | undefined;
  level?: number | null | undefined;
  xp?: number | null | undefined;
  trustScore?: number | null | undefined;
  image?: string | null | undefined;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  data?: Record<string, unknown>;
}

export type NavItem = { icon: string; label: string; href: string };
export type MobileNavItem = NavItem & { primary?: boolean };
