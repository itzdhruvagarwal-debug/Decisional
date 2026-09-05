"use client";

import React, { memo } from "react";
import Link from "next/link";
import Image from "next/image";
import { signOut } from "next-auth/react";
import Logo from "@/components/Logo";
import { Button } from "@/components/ui/Button";
import { AppIcon, getNavIcon } from "./AppIcon";
import type { DashboardUser, NavItem } from "./types";

export interface SidebarProps {
  readonly sidebarOpen: boolean;
  readonly setSidebarOpen: (open: boolean) => void;
  readonly mobileSidebarOpen: boolean;
  readonly setMobileSidebarOpen: (open: boolean) => void;
  readonly user?: DashboardUser | null | undefined;
  readonly navItems: NavItem[];
  readonly isActivePath: (href: string) => boolean;
  readonly isAdmin: boolean;
}

export const Sidebar = memo(function Sidebar({
  sidebarOpen,
  setSidebarOpen,
  mobileSidebarOpen,
  setMobileSidebarOpen,
  user,
  navItems,
  isActivePath,
  isAdmin,
}: SidebarProps) {
  const xpPercent = Math.min(((user?.xp || 0) % 1000) / 10, 100);

  return (
    <>
      {/* Mobile Sidebar Overlay */}
      <div
        role="none"
        className={`sidebar-overlay ${mobileSidebarOpen ? "active" : ""}`}
        onClick={() => setMobileSidebarOpen(false)}
      />

      <aside
        className={`sidebar ${sidebarOpen ? "" : "collapsed"} ${mobileSidebarOpen ? "mobile-open" : ""}`}
      >
        {/* Logo */}
        <div className={`sidebar-header ${sidebarOpen ? "" : "collapsed"}`}>
          {(sidebarOpen || mobileSidebarOpen) && <Logo />}
          <Button
            type="button"
            variant="ghost"
            className="hide-mobile sidebar-collapse-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? "‹" : "›"}
          </Button>
        </div>

        {/* User Profile (Mobile) */}
        <div className="show-mobile sidebar-user-profile">
          <div
            className="avatar overflow-hidden relative"
            style={{ width: 40, height: 40, minWidth: 40, minHeight: 40 }}
          >
            {user?.image ? (
              <Image
                src={user.image}
                alt={user.name || "User"}
                width={40}
                height={40}
                unoptimized
                className="object-cover rounded-full w-full h-full"
              />
            ) : (
              user?.name?.[0] || "U"
            )}
          </div>
          <div>
            <div className="text-sm font-semibold">{user?.name || "User"}</div>
            <div className="text-xs text-capitalize text-muted">
              {user?.userType?.toLowerCase()}
            </div>
          </div>
        </div>

        {/* Nav Links */}
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const isActive = isActivePath(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`sidebar-link ${isActive ? "active" : ""} ${sidebarOpen ? "" : "is-collapsed"}`}
                onClick={() => setMobileSidebarOpen(false)}
              >
                <span className="sidebar-link-icon">
                  <AppIcon name={getNavIcon(item.label)} size={18} />
                </span>
                {(sidebarOpen || mobileSidebarOpen) && (
                  <span className="sidebar-link-text">{item.label}</span>
                )}
              </Link>
            );
          })}

          {/* Logout Button */}
          <Button
            type="button"
            variant="ghost"
            onClick={() => signOut({ callbackUrl: "/" })}
            className={`sidebar-link sidebar-logout-btn ${sidebarOpen ? "" : "is-collapsed"}`}
          >
            <span className="sidebar-link-icon">
              <svg
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </span>
            {(sidebarOpen || mobileSidebarOpen) && (
              <span className="sidebar-link-text">Logout</span>
            )}
          </Button>
        </nav>

        {/* Level Badge */}
        {!isAdmin && (sidebarOpen || mobileSidebarOpen) && (
          <div className="dashboard-level-card">
            <div className="dashboard-level-label">YOUR LEVEL</div>
            <div className="text-xl font-extrabold">
              <span className="gradient-text">Level {user?.level || 1}</span>
            </div>
            <div className="xp-bar mt-2 h-6">
              {/* Use CSS custom property to avoid inline <style> tags */}
              <div
                className="xp-bar-fill"
                style={{ width: `${xpPercent}%` }}
              />
            </div>
            <div className="dashboard-level-xp-label">{user?.xp || 0} XP</div>
          </div>
        )}
      </aside>
    </>
  );
});

Sidebar.displayName = "Sidebar";
