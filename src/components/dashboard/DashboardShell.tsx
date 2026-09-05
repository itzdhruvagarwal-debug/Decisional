"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import useSWR from "swr";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { isAdmin as rbacIsAdmin, isBrand, isInfluencer } from "@/lib/rbac";
import { fetcher } from "@/lib/fetcher";
import { logger } from "@/lib/logger-client";
import { Sidebar } from "./shell/Sidebar";
import { Topbar } from "./shell/Topbar";
import { AppIcon } from "./shell/AppIcon";
import type { DashboardUser, Notification, NavItem, MobileNavItem, AppIconName } from "./shell/types";

export default function DashboardShell({
  children,
  user,
}: Readonly<{
  children: React.ReactNode;
  user?: DashboardUser | null | undefined;
}>) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const pathname = usePathname();

  const { data: notifData, mutate: refreshNotifications } = useSWR<{
    notifications?: Notification[];
    unreadCount?: number;
  }>(user?.id ? "/api/notifications?limit=10" : null, fetcher, {
    refreshInterval: 60000,
  });

  const notifications = notifData?.notifications || [];
  const unreadCount = notifData?.unreadCount || 0;
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const notifPortalRef = useRef<HTMLDivElement | null>(null);

  // Close mobile sidebar on route change without visual flash
  useEffect(() => {
    const id = requestAnimationFrame(() => setMobileSidebarOpen(false));
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    document.body.classList.toggle("overflow-hidden", mobileSidebarOpen);
    return () => {
      document.body.classList.remove("overflow-hidden");
    };
  }, [mobileSidebarOpen]);

  // Close notifications when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const insideBell = notificationRef.current?.contains(target);
      const insidePortal = notifPortalRef.current?.contains(target);
      if (!insideBell && !insidePortal) setShowNotifications(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const markAsRead = useCallback(
    async (notificationId?: string) => {
      try {
        const body = notificationId
          ? { notificationIds: [notificationId] }
          : { markAll: true };
        await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        refreshNotifications();
      } catch (error) {
        logger.error("[dashboard-shell] Failed to mark notifications as read:", error);
      }
    },
    [refreshNotifications],
  );

  const userType = user?.userType;
  const isBrandOrIndividual = isBrand(userType);
  const isAdmin = rbacIsAdmin(userType);

  let subtitleText = `Welcome, ${user?.name || "User"}!`;
  if (isBrand(userType)) subtitleText = "Brand Dashboard";
  else if (isInfluencer(userType)) subtitleText = "Influencer Dashboard";

  const navItems = useMemo<NavItem[]>(
    () =>
      isAdmin
        ? [{ icon: "AD", label: "Admin Panel", href: "/admin" }]
        : [
            { icon: "DB", label: "Dashboard", href: "/dashboard" },
            ...(isBrandOrIndividual
              ? [
                  { icon: "CP", label: "My Campaigns", href: "/dashboard/campaigns" },
                  { icon: "CP", label: "Create Campaign", href: "/dashboard/campaigns/create" },
                ]
              : []),
            ...(!isBrandOrIndividual
              ? [
                  { icon: "CP", label: "Campaigns", href: "/dashboard/campaigns" },
                  { icon: "DL", label: "My Applications", href: "/dashboard/applications" },
                ]
              : [{ icon: "FI", label: "Find Influencers", href: "/dashboard/influencers" }]),
            { icon: "DL", label: "My Deals", href: "/dashboard/deals" },
            { icon: "WT", label: "Wallet", href: "/dashboard/wallet" },
            { icon: "MS", label: "Messages", href: "/dashboard/messages" },
            { icon: "DS", label: "Disputes", href: "/dashboard/disputes" },
            { icon: "LB", label: "Leaderboard", href: "/dashboard/leaderboard" },
            { icon: "BG", label: "Badges", href: "/dashboard/badges" },
            { icon: "RF", label: "Referrals", href: "/dashboard/referrals" },
            { icon: "MS", label: "Support & Feedback", href: "/dashboard/support" },
            { icon: "ST", label: "Settings", href: "/dashboard/settings" },
          ],
    [isAdmin, isBrandOrIndividual],
  );

  const mobilePrimaryHref = rbacIsAdmin(userType)
    ? "/admin"
    : isBrandOrIndividual
      ? "/dashboard/campaigns/create"
      : "/dashboard/campaigns";

  const mobilePrimaryLabel = rbacIsAdmin(userType)
    ? "Admin"
    : isBrandOrIndividual
      ? "Create"
      : "Apply";

  const mobileNavItems = useMemo<MobileNavItem[]>(
    () =>
      isAdmin
        ? [{ icon: "settings", label: "Admin", href: "/admin", primary: true }]
        : [
            { icon: "home", label: "Home", href: "/dashboard" },
            { icon: "campaigns", label: "Campaigns", href: "/dashboard/campaigns" },
            { icon: "plus", label: mobilePrimaryLabel, href: mobilePrimaryHref, primary: true },
            { icon: "deals", label: "Deals", href: "/dashboard/deals" },
            { icon: "settings", label: "Profile", href: "/dashboard/settings" },
          ],
    [isAdmin, mobilePrimaryHref, mobilePrimaryLabel],
  );

  const isActivePath = useCallback(
    (href: string) => {
      if (pathname === href) return true;
      if (href !== "/dashboard" && pathname.startsWith(`${href}/`)) {
        const hasMoreSpecific = navItems.some(
          (item) =>
            item.href !== href &&
            item.href !== "/dashboard" &&
            pathname.startsWith(item.href) &&
            item.href.length > href.length,
        );
        return !hasMoreSpecific;
      }
      return false;
    },
    [pathname, navItems],
  );

  return (
    <div className="dashboard-app-shell">
      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        mobileSidebarOpen={mobileSidebarOpen}
        setMobileSidebarOpen={setMobileSidebarOpen}
        user={user}
        navItems={navItems}
        isActivePath={isActivePath}
        isAdmin={isAdmin}
      />

      <main className={`dashboard-main ${!sidebarOpen ? "collapsed" : ""}`}>
        <Topbar
          user={user}
          isAdmin={isAdmin}
          pathname={pathname}
          subtitleText={subtitleText}
          showNotifications={showNotifications}
          setShowNotifications={setShowNotifications}
          unreadCount={unreadCount}
          notifications={notifications}
          notificationRef={notificationRef}
          notifPortalRef={notifPortalRef}
          markAsRead={markAsRead}
          setMobileSidebarOpen={setMobileSidebarOpen}
        />

        <div className="dashboard-content animate-fade-in">{children}</div>

        <MobileTabbar mobileNavItems={mobileNavItems} isActivePath={isActivePath} />
      </main>
    </div>
  );
}

export interface MobileTabbarProps {
  readonly mobileNavItems: MobileNavItem[];
  readonly isActivePath: (href: string) => boolean;
}

export const MobileTabbar = React.memo(function MobileTabbar({
  mobileNavItems,
  isActivePath,
}: MobileTabbarProps) {
  return (
    <nav className="dashboard-mobile-tabbar" aria-label="Primary mobile navigation">
      {mobileNavItems.map((item) => {
        const active = isActivePath(item.href);
        const iconName = item.icon as AppIconName;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`mobile-tab-item ${active ? "active" : ""} ${item.primary ? "primary-tab" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <AppIcon name={iconName} size={20} />
            <span className="mobile-tab-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
});

MobileTabbar.displayName = "MobileTabbar";

