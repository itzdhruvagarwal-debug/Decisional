"use client";

import Link from "next/link";
import Logo from "../Logo";
import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  data?: any;
}

export default function DashboardShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: any;
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
          error instanceof TypeError && error.message.includes("Failed to fetch");
        if (active && !controller.signal.aborted && !isTransientFetchFailure) {
          console.error("Failed to fetch notifications", error);
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
      console.error("Failed to mark notifications as read", error);
    }
  };

  const userType = user?.userType;
  const isBrandOrIndividual = userType === "BRAND";
  const navIconLabel = (label: string) => {
    const labels: Record<string, string> = {
      Dashboard: "DB",
      Analytics: "AN",
      "Create Campaign": "+",
      Campaigns: "CP",
      "My Campaigns": "CP",
      "Find Influencers": "FI",
      "My Deals": "DL",
      Wallet: "WT",
      Messages: "MS",
      Disputes: "DS",
      Leaderboard: "LB",
      Badges: "BG",
      Referrals: "RF",
      Settings: "ST",
      "Admin Panel": "AD",
    };
    return labels[label] || label.slice(0, 2).toUpperCase();
  };

  const navItems = [
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
      ? [{ icon: "CP", label: "Campaigns", href: "/dashboard/campaigns" }]
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
    ...(user?.userType === "ADMIN"
      ? [{ icon: "AD", label: "Admin Panel", href: "/admin" }]
      : []),
  ];

  return (
    <div
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
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`sidebar-link ${isActive ? "active" : ""}`}
                style={{
                  justifyContent: sidebarOpen ? "flex-start" : "center",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 800,
                    flexShrink: 0,
                    minWidth: "22px",
                    textAlign: "center",
                  }}
                >
                  {navIconLabel(item.label)}
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
            <span style={{ fontSize: "12px", fontWeight: 800, flexShrink: 0 }}>
              LO
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
        {(sidebarOpen || mobileSidebarOpen) && (
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
          className="glass"
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
              Menu
            </button>
            <div>
              <h1
                style={{
                  fontSize: "clamp(18px, 2.2vw, 20px)",
                  fontWeight: 800,
                  lineHeight: 1.3,
                }}
              >
                Dashboard
              </h1>
              <p
                className="hide-mobile"
                style={{
                  color: "var(--color-text-secondary)",
                  fontSize: "13px",
                }}
              >
                Welcome back, {user?.name || "User"}!
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* Notifications */}
            <div style={{ position: "relative" }} ref={notificationRef}>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                style={{
                  background: "var(--color-bg-tertiary)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  padding: "8px 10px",
                  cursor: "pointer",
                  position: "relative",
                  fontSize: "12px",
                  fontWeight: 800,
                  transition: "all var(--transition-fast)",
                }}
              >
                Alerts
                {unreadCount > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: "-2px",
                      right: "-2px",
                      width: "8px",
                      height: "8px",
                      background: "var(--color-accent-rose)",
                      borderRadius: "50%",
                      border: "2px solid var(--color-bg-primary)",
                    }}
                  />
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
      </main>
    </div>
  );
}
