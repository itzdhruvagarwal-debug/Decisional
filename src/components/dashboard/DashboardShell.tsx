"use client";

import Link from "next/link";
import Logo from "../Logo";
import PWAInstallButton from "@/components/pwa/PWAInstallButton";
import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";



type AppIconName =
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

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  data?: Record<string, unknown>;
}

function AppIcon({
  name,
  size = 20,
}: {
  name: AppIconName;
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "analytics":
      return (
        <svg {...common}>
          <path d="M4 19V9" />
          <path d="M10 19V5" />
          <path d="M16 19v-7" />
          <path d="M22 19H2" />
        </svg>
      );
    case "badge":
      return (
        <svg {...common}>
          <path d="m12 3 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.4 7.2 18l.9-5.4-3.9-3.8 5.4-.8L12 3Z" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
      );
    case "campaigns":
      return (
        <svg {...common}>
          <path d="M4 6h16" />
          <path d="M4 12h10" />
          <path d="M4 18h7" />
          <path d="m17 14 3 3-3 3" />
        </svg>
      );
    case "chat":
      return (
        <svg {...common}>
          <path d="M21 12a8 8 0 0 1-8 8H7l-4 2 1.4-4.2A8 8 0 1 1 21 12Z" />
        </svg>
      );
    case "deals":
      return (
        <svg {...common}>
          <path d="M8 11 4 15a3 3 0 0 0 4 4l2-2" />
          <path d="m14 7 2-2a3 3 0 0 1 4 4l-4 4" />
          <path d="m8 16 8-8" />
          <path d="m12 12 2 2" />
        </svg>
      );
    case "disputes":
      return (
        <svg {...common}>
          <path d="M12 3 3 7v6c0 5 4 8 9 8s9-3 9-8V7l-9-4Z" />
          <path d="M12 8v5" />
          <path d="M12 17h.01" />
        </svg>
      );
    case "home":
      return (
        <svg {...common}>
          <path d="m3 11 9-8 9 8" />
          <path d="M5 10v10h14V10" />
          <path d="M10 20v-6h4v6" />
        </svg>
      );
    case "leaderboard":
      return (
        <svg {...common}>
          <path d="M7 20V9" />
          <path d="M12 20V4" />
          <path d="M17 20v-7" />
          <path d="M4 20h16" />
        </svg>
      );
    case "menu":
      return (
        <svg {...common}>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case "referrals":
      return (
        <svg {...common}>
          <path d="M16 11a4 4 0 1 0-8 0" />
          <path d="M4 21a8 8 0 0 1 16 0" />
          <path d="M19 8h3" />
          <path d="M20.5 6.5v3" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3" />
          <path d="M4 21a8 8 0 0 1 16 0" />
          <path d="M20 4h2" />
          <path d="M21 3v2" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...common}>
          <path d="M4 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h13" />
          <path d="M16 13h.01" />
        </svg>
      );
    default:
      return null;
  }
}

function getNavIcon(label: string): AppIconName {
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
    Settings: "settings",
    "Admin Panel": "settings",
  };
  return icons[label] || "home";
}

function getPageTitle(pathname: string): string {
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
    settings: "Settings",
    influencers: "Find Influencers",
    create: "Create Campaign",
  };
  // Find the deepest meaningful segment
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    // Skip UUID-like segments (deal/campaign IDs)
    if (seg && !/^[a-f0-9-]{20,}$/.test(seg) && map[seg]) {
      return map[seg];
    }
  }
  return "Dashboard";
}

export default function DashboardShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: any;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const pathname = usePathname();

  // Notifications State
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  // Close mobile sidebar on route change without a visual flash.
  useEffect(() => {
    // Defer to avoid setState-in-effect during render
    const id = requestAnimationFrame(() => setMobileSidebarOpen(false));
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  // Lock body when mobile sidebar is open
  useEffect(() => {
    document.body.style.overflow = mobileSidebarOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileSidebarOpen]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const fetchNotifications = async () => {
      try {
        const res = await fetch("/api/notifications?limit=10", {
          signal: controller.signal,
        });
        const data = await res.json();
        if (active && data.notifications) {
          setNotifications(data.notifications);
          setUnreadCount(data.unreadCount);
        }
      } catch (error) {
        const isTransientFetchFailure =
          error instanceof TypeError && (error instanceof Error ? error.message : String(error)).includes("Failed to fetch");
        if (active && !controller.signal.aborted && !isTransientFetchFailure) {
          console.error("[dashboard-shell] Failed to fetch notifications:", error);
        }
      }
    };

    if (user?.id) {
      fetchNotifications();
      // Poll every minute
      const interval = setInterval(fetchNotifications, 60000);
      return () => {
        active = false;
        controller.abort();
        clearInterval(interval);
      };
    }
    return () => {
      active = false;
      controller.abort();
    };
  }, [user?.id]);

  // Close notifications when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target as Node)
      ) {
        setShowNotifications(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const markAsRead = async (notificationId?: string) => {
    try {
      const body = notificationId
        ? { notificationIds: [notificationId] }
        : { markAll: true };
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      // Update local state
      if (notificationId) {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId ? { ...n, isRead: true } : n,
          ),
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } else {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
      }
    } catch (error) {
      console.error("[dashboard-shell] Failed to mark notifications as read:", error);
    }
  };

  const userType = user?.userType;
  const isBrandOrIndividual = userType === "BRAND";
  const isAdmin = userType === "ADMIN";

  let subtitleText = `Welcome, ${user?.name || "User"}!`;
  if (user?.userType === "BRAND") {
    subtitleText = "Brand Dashboard";
  } else if (user?.userType === "INFLUENCER") {
    subtitleText = "Influencer Dashboard";
  }

  const navItems = isAdmin
    ? [
        { icon: "AD", label: "Admin Panel", href: "/admin" },
      ]
    : [
        { icon: "AN", label: "Analytics", href: "/dashboard/analytics" },
        { icon: "DB", label: "Dashboard", href: "/dashboard" },
        // Show Create Campaign only for Brands/Individuals
        ...(isBrandOrIndividual
          ? [
            {
              icon: "CP",
              label: "My Campaigns",
              href: "/dashboard/campaigns",
            },
            {
              icon: "CP",
              label: "Create Campaign",
              href: "/dashboard/campaigns/create",
            },
          ]
          : []),
        // Show Campaigns only for Influencers (Browse)
        ...(!isBrandOrIndividual
          ? [
            { icon: "CP", label: "Campaigns", href: "/dashboard/campaigns" },
            { icon: "DL", label: "My Applications", href: "/dashboard/applications" },
          ]
          : [
            {
              icon: "FI",
              label: "Find Influencers",
              href: "/dashboard/influencers",
            },
          ]),
        { icon: "DL", label: "My Deals", href: "/dashboard/deals" },
        { icon: "WT", label: "Wallet", href: "/dashboard/wallet" },
        { icon: "MS", label: "Messages", href: "/dashboard/messages" },
        { icon: "DS", label: "Disputes", href: "/dashboard/disputes" },
        { icon: "LB", label: "Leaderboard", href: "/dashboard/leaderboard" },
        { icon: "BG", label: "Badges", href: "/dashboard/badges" },
        { icon: "RF", label: "Referrals", href: "/dashboard/referrals" },
        { icon: "ST", label: "Settings", href: "/dashboard/settings" },
      ];
  let mobilePrimaryHref = "/dashboard/campaigns";
  if (user?.userType === "ADMIN") {
    mobilePrimaryHref = "/admin";
  } else if (isBrandOrIndividual) {
    mobilePrimaryHref = "/dashboard/campaigns/create";
  }

  let mobilePrimaryLabel = "Apply";
  if (user?.userType === "ADMIN") {
    mobilePrimaryLabel = "Admin";
  } else if (isBrandOrIndividual) {
    mobilePrimaryLabel = "Create";
  }
  const mobileNavItems = isAdmin
    ? [
        { icon: "settings" as const, label: "Admin", href: "/admin", primary: true },
      ]
    : [
        { icon: "home" as const, label: "Home", href: "/dashboard" },
        { icon: "campaigns" as const, label: "Campaigns", href: "/dashboard/campaigns" },
        {
          icon: "plus" as const,
          label: mobilePrimaryLabel,
          href: mobilePrimaryHref,
          primary: true,
        },
        { icon: "deals" as const, label: "Deals", href: "/dashboard/deals" },
        { icon: "settings" as const, label: "Profile", href: "/dashboard/settings" },
      ];
  const isActivePath = (href: string) => {
    if (pathname === href) return true;
    if (href !== "/dashboard" && pathname.startsWith(`${href}/`)) {
      const hasMoreSpecificMatch = navItems.some(
        (item) =>
          item.href !== href &&
          item.href !== "/dashboard" &&
          pathname.startsWith(item.href) &&
          item.href.length > href.length
      );
      return !hasMoreSpecificMatch;
    }
    return false;
  };

  return (
    <div
      className="dashboard-app-shell"
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--color-bg-primary)",
      }}
    >
      {/* Mobile Sidebar Overlay */}
      <div
        className={`sidebar-overlay ${mobileSidebarOpen ? "active" : ""}`}
        onClick={() => setMobileSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside
        className={`sidebar ${sidebarOpen ? "" : "collapsed"} ${mobileSidebarOpen ? "mobile-open" : ""}`}
      >
        {/* Logo */}
        <div
          style={{
            padding: "16px 16px",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: sidebarOpen ? "space-between" : "center",
            minHeight: "64px",
          }}
        >
          {(sidebarOpen || mobileSidebarOpen) && <Logo />}
          <button
            className="hide-mobile"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              background: "var(--color-bg-tertiary)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              padding: "6px 8px",
              cursor: "pointer",
              color: "var(--color-text-secondary)",
              fontSize: "14px",
              transition: "all var(--transition-fast)",
            }}
          >
            {sidebarOpen ? "<" : ">"}
          </button>
        </div>

        {/* User Profile (Mobile) */}
        <div
          className="show-mobile"
          style={{
            padding: "16px",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            className="avatar"
            style={{
              background: "var(--gradient-primary)",
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              color: "white",
            }}
          >
            {user?.name?.[0] || "U"}
          </div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 600 }}>
              {user?.name || "User"}
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "var(--color-text-muted)",
                textTransform: "capitalize",
              }}
            >
              {user?.userType?.toLowerCase()}
            </div>
          </div>
        </div>

        {/* Nav Links */}
        <nav style={{ padding: "12px 10px" }}>
          {navItems.map((item) => {
            const isActive = isActivePath(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`sidebar-link ${isActive ? "active" : ""}`}
                onClick={() => setMobileSidebarOpen(false)}
                style={{
                  justifyContent: sidebarOpen ? "flex-start" : "center",
                }}
              >
                <span className="sidebar-link-icon">
                  <AppIcon name={getNavIcon(item.label)} size={18} />
                </span>
                {(sidebarOpen || mobileSidebarOpen) && (
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}

          {/* Logout Button */}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="sidebar-link"
            style={{
              width: "100%",
              border: 0,
              background: "transparent",
              justifyContent: sidebarOpen ? "flex-start" : "center",
              color: "var(--color-accent-rose)",
              cursor: "pointer",
              marginTop: "8px",
            }}
          >
            <span className="sidebar-link-icon">
              {/* Logout icon */}
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </span>
            {(sidebarOpen || mobileSidebarOpen) && (
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                Logout
              </span>
            )}
          </button>
        </nav>

        {/* Level Badge at Bottom */}
        {!isAdmin && (sidebarOpen || mobileSidebarOpen) && (
          <div
            style={{
              margin: "12px",
              marginTop: "auto",
              padding: "16px",
              background:
                "linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(236, 72, 153, 0.05))",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                color: "var(--color-text-muted)",
                marginBottom: "6px",
              }}
            >
              YOUR LEVEL
            </div>
            <div style={{ fontSize: "20px", fontWeight: 800 }}>
              <span className="gradient-text">Level {user?.level || 1}</span>
            </div>
            <div className="xp-bar" style={{ height: "6px", marginTop: "8px" }}>
              <div
                className="xp-bar-fill"
                style={{
                  width: `${Math.min(((user?.xp || 0) % 1000) / 10, 100)}%`,
                }}
              />
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "var(--color-text-muted)",
                marginTop: "4px",
              }}
            >
              {user?.xp || 0} XP
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className={`dashboard-main ${!sidebarOpen ? "collapsed" : ""}`}>
        {/* Top Bar */}
        <header
          className="dashboard-topbar glass"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 40,
            padding: "12px clamp(12px, 3vw, 24px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid var(--color-border)",
            minHeight: "64px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {/* Mobile hamburger */}
            <button
              className="sidebar-toggle-mobile"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <AppIcon name="menu" size={22} />
            </button>
            <div className="dashboard-mobile-logo" aria-hidden="true">
              <Logo />
            </div>
            <div>
              <h1
                className="dashboard-topbar-title"
                style={{
                  fontSize: "clamp(18px, 2.2vw, 20px)",
                  fontWeight: 800,
                  lineHeight: 1.3,
                }}
              >
                {getPageTitle(pathname)}
              </h1>
              <p
                className="dashboard-topbar-subtitle hide-mobile"
                style={{
                  color: "var(--color-text-secondary)",
                  fontSize: "13px",
                }}
              >
                {subtitleText}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {!isAdmin && <PWAInstallButton className="dashboard-icon-button" />}
            {!isAdmin && (
              <div className="dashboard-trust-chip">
                <span>Trust</span>
                <strong>{Number(user?.trustScore || 600)}</strong>
              </div>
            )}
            {/* Notifications */}
            <div style={{ position: "relative" }} ref={notificationRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="dashboard-icon-button"
                aria-label="Notifications"
              >
                <AppIcon name="bell" size={19} />
                {unreadCount > 0 && (
                  <span
                    aria-label={`${unreadCount} unread notifications`}
                    style={{
                      position: "absolute",
                      top: "-4px",
                      right: "-4px",
                      minWidth: "18px",
                      height: "18px",
                      padding: "0 4px",
                      background: "var(--color-accent-rose)",
                      borderRadius: "var(--radius-full)",
                      border: "2px solid var(--color-bg-primary)",
                      fontSize: "10px",
                      fontWeight: 700,
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      lineHeight: 1,
                    }}
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <div
                  className="card animate-fade-in"
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    marginTop: "8px",
                    width: "min(320px, calc(100vw - 24px))",
                    padding: "0",
                    zIndex: 50,
                    maxHeight: "400px",
                    overflowY: "auto",
                    boxShadow:
                      "0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
                  }}
                >
                  <div
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid var(--color-border)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <h3 style={{ fontSize: "14px", fontWeight: 600 }}>
                      Notifications
                    </h3>
                    {unreadCount > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead();
                        }}
                        style={{
                          fontSize: "11px",
                          color: "var(--color-primary)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {notifications.length === 0 ? (
                      <div
                        style={{
                          padding: "24px",
                          textAlign: "center",
                          color: "var(--color-text-secondary)",
                          fontSize: "13px",
                        }}
                      >
                        No notifications yet
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          onClick={() => !notif.isRead && markAsRead(notif.id)}
                          style={{
                            padding: "12px 16px",
                            borderBottom: "1px solid var(--color-border)",
                            background: notif.isRead
                              ? "transparent"
                              : "var(--color-bg-tertiary)",
                            cursor: "pointer",
                            transition: "background 0.2s",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "13px",
                              fontWeight: 600,
                              marginBottom: "4px",
                              color: "var(--color-text-primary)",
                            }}
                          >
                            {notif.title}
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              color: "var(--color-text-secondary)",
                              lineHeight: 1.4,
                            }}
                          >
                            {notif.message}
                          </div>
                          <div
                            style={{
                              fontSize: "10px",
                              color: "var(--color-text-muted)",
                              marginTop: "6px",
                            }}
                          >
                            {new Date(notif.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile, desktop only */}
            <div
              className="hide-mobile"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "6px 14px 6px 6px",
                background: "var(--color-bg-tertiary)",
                borderRadius: "var(--radius-full)",
                border: "1px solid var(--color-border)",
              }}
            >
              <div
                className="avatar"
                style={{
                  width: "32px",
                  height: "32px",
                  fontSize: "13px",
                }}
              >
                {user?.name?.[0] || "U"}
              </div>
              <div>
                <div
                  style={{ fontSize: "13px", fontWeight: 600, lineHeight: 1.2 }}
                >
                  {user?.name}
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--color-text-muted)",
                    textTransform: "capitalize",
                  }}
                >
                  {user?.userType?.toLowerCase()}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Page Content */}
        <div className="dashboard-content animate-fade-in">{children}</div>
        <nav className="dashboard-mobile-tabbar" aria-label="Primary mobile navigation">
          {mobileNavItems.map((item) => {
            const active = isActivePath(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`dashboard-mobile-tab ${active ? "is-active" : ""} ${item.primary ? "is-primary" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span className="dashboard-mobile-tab-icon">
                  <AppIcon name={item.icon} size={item.primary ? 24 : 20} />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
