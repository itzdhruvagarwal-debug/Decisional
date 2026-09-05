"use client";

import { memo } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { isInfluencer } from "@/lib/rbac";
import Logo from "@/components/Logo";
import PWAInstallButton from "@/components/pwa/PWAInstallButton";
import { Button } from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import { AppIcon, getPageTitle } from "./AppIcon";
import type { DashboardUser, Notification } from "./types";

export interface TopbarProps {
  readonly user?: DashboardUser | null | undefined;
  readonly isAdmin: boolean;
  readonly pathname: string;
  readonly subtitleText: string;
  readonly showNotifications: boolean;
  readonly setShowNotifications: (show: boolean) => void;
  readonly unreadCount: number;
  readonly notifications: Notification[];
  readonly notificationRef: React.RefObject<HTMLDivElement | null>;
  readonly notifPortalRef: React.RefObject<HTMLDivElement | null>;
  readonly markAsRead: (id?: string) => void;
  readonly setMobileSidebarOpen: (open: boolean) => void;
}

export const Topbar = memo(function Topbar({
  user,
  isAdmin,
  pathname,
  subtitleText,
  showNotifications,
  setShowNotifications,
  unreadCount,
  notifications,
  notificationRef,
  notifPortalRef,
  markAsRead,
  setMobileSidebarOpen,
}: TopbarProps) {
  return (
    <header className="dashboard-topbar glass">
      <div className="dashboard-topbar-left">
        {/* Mobile hamburger */}
        <Button
          type="button"
          variant="ghost"
          className="sidebar-toggle-mobile"
          onClick={() => setMobileSidebarOpen(true)}
          aria-label="Open sidebar"
        >
          <AppIcon name="menu" size={22} />
        </Button>
        <div className="dashboard-mobile-logo" aria-hidden="true">
          <Logo tabIndex={-1} />
        </div>
        <div>
          <h1 className="dashboard-topbar-title">{getPageTitle(pathname)}</h1>
          <p className="dashboard-topbar-subtitle hide-mobile">{subtitleText}</p>
        </div>
      </div>

      <div className="dashboard-topbar-right">
        {!isAdmin && <PWAInstallButton className="dashboard-icon-button" />}
        {isInfluencer(user?.userType) && (
          <div className="dashboard-trust-chip">
            <span>Trust</span>
            <strong>{Number(user?.trustScore || 600)}</strong>
          </div>
        )}

        {/* Notifications */}
        <div className="position-relative" ref={notificationRef}>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowNotifications(!showNotifications)}
            className="dashboard-icon-button"
            aria-label="Notifications"
          >
            <AppIcon name="bell" size={19} />
            {unreadCount > 0 && (
              <span
                className="notif-badge"
                aria-label={`${unreadCount} unread notifications`}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>

          {/* Notifications Dropdown via portal to escape stacking context */}
          {showNotifications &&
            typeof document !== "undefined" &&
            createPortal(
              <div ref={notifPortalRef} className="notif-dropdown-portal animate-fade-in">
                <div className="notif-dropdown-header">
                  <h3>Notifications</h3>
                  {unreadCount > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="notif-mark-read-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        markAsRead();
                      }}
                    >
                      Mark all as read
                    </Button>
                  )}
                </div>
                <div className="flex flex-col">
                  {notifications.length === 0 ? (
                    <EmptyState
                      emoji=""
                      title="You're all caught up"
                      description="No new notifications."
                      compact
                    />
                  ) : (
                    notifications.map((notif) => (
                      <Button
                        key={notif.id}
                        onClick={() => !notif.isRead && markAsRead(notif.id)}
                        type="button"
                        variant="ghost"
                        className={`notif-item ${notif.isRead ? "" : "unread"}`}
                      >
                        <div className="notif-item-title">{notif.title}</div>
                        <div className="notif-item-message">{notif.message}</div>
                        <div className="notif-item-date">
                          {new Date(notif.createdAt).toLocaleDateString()}
                        </div>
                      </Button>
                    ))
                  )}
                </div>
              </div>,
              document.body,
            )}
        </div>

        {/* Profile, desktop only */}
        <div className="hide-mobile topbar-profile-pill">
          <div
            className="avatar text-sm overflow-hidden relative"
            style={{ width: 32, height: 32, minWidth: 32, minHeight: 32 }}
          >
            {user?.image ? (
              <Image
                src={user.image}
                alt={user.name || "User"}
                width={32}
                height={32}
                unoptimized
                className="object-cover rounded-full w-full h-full"
              />
            ) : (
              user?.name?.[0] || "U"
            )}
          </div>
          <div>
            <div className="topbar-profile-name">{user?.name}</div>
            <div className="topbar-profile-role">{user?.userType?.toLowerCase()}</div>
          </div>
        </div>
      </div>
    </header>
  );
});

Topbar.displayName = "Topbar";
