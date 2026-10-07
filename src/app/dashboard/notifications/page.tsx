"use client";

import React, { useState, useMemo, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { useNotificationCenter } from "@/hooks/useNotificationCenter";
import {
  NotificationItem,
  groupNotificationsByRecency,
  formatNotificationTime,
  getNotificationTypeMeta,
  getNotificationHref,
} from "@/lib/notification-utils";
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  Settings,
  Wallet,
  Briefcase,
  MessageSquare,
  ShieldAlert,
  Star,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PullToRefresh } from "@/components/ui";

function renderActivityIcon(iconName: string, className: string) {
  switch (iconName) {
    case "wallet":
      return <Wallet className={className} />;
    case "briefcase":
      return <Briefcase className={className} />;
    case "message":
      return <MessageSquare className={className} />;
    case "shield-alert":
      return <ShieldAlert className={className} />;
    case "star":
      return <Star className={className} />;
    default:
      return <Bell className={className} />;
  }
}

type FilterTab = "all" | "unread" | "deals" | "payments" | "messages";

const ITEMS_PER_PAGE = 25;

export default function NotificationsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const userId = session?.user?.id;

  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    refresh,
  } = useNotificationCenter(userId);

  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [displayLimit, setDisplayLimit] = useState<number>(ITEMS_PER_PAGE);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notif) => {
      if (activeFilter === "unread") return !notif.isRead;
      if (activeFilter === "deals") {
        return getNotificationTypeMeta(notif.type).category === "deal";
      }
      if (activeFilter === "payments") {
        return getNotificationTypeMeta(notif.type).category === "payment";
      }
      if (activeFilter === "messages") {
        return getNotificationTypeMeta(notif.type).category === "message";
      }
      return true;
    });
  }, [notifications, activeFilter]);

  // Progressive list slicing to prevent layout jitter on large lists
  const paginatedNotifications = useMemo(() => {
    return filteredNotifications.slice(0, displayLimit);
  }, [filteredNotifications, displayLimit]);

  const hasMore = filteredNotifications.length > displayLimit;

  const grouped = useMemo(() => {
    return groupNotificationsByRecency(paginatedNotifications);
  }, [paginatedNotifications]);

  const handleItemClick = useCallback((notif: NotificationItem) => {
    if (!notif.isRead) {
      markAsRead(notif.id);
    }
    const href = getNotificationHref(notif);
    router.push(href);
  }, [markAsRead, router]);

  const handleInlineActionClick = useCallback((e: React.MouseEvent, notif: NotificationItem) => {
    e.stopPropagation();
    if (!notif.isRead) {
      markAsRead(notif.id);
    }
    const href = getNotificationHref(notif);
    router.push(href);
  }, [markAsRead, router]);

  const sections = [
    { title: "Today", items: grouped.today },
    { title: "Earlier this week", items: grouped.thisWeek },
    { title: "Older", items: grouped.older },
  ].filter((s) => s.items.length > 0);

  const getInlineActionLabel = (notif: NotificationItem) => {
    const meta = getNotificationTypeMeta(notif.type);
    switch (meta.category) {
      case "deal":
        return "View Deal";
      case "payment":
        return "View Wallet";
      case "message":
        return "Open Chat";
      case "dispute":
        return "View Dispute";
      case "security":
        return "Review Alert";
      default:
        return "View Details";
    }
  };

  return (
    <DashboardShell user={session?.user}>
      <PullToRefresh onRefresh={refresh}>
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-16">
        {/* ── 1. HEADER (INSTAGRAM ACTIVITY BENCHMARK) ───────────────────── */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-card border border-border shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-heading font-bold tracking-tight text-foreground">
                  Activity Feed
                </h1>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary text-primary-foreground shrink-0 whitespace-nowrap">
                    {unreadCount} unread
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Real-time updates on your deals, escrow releases, messages, and dispute resolutions.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={markAllAsRead}
                className="gap-1.5 text-xs font-semibold cursor-pointer shadow-xs"
              >
                <CheckCheck className="w-3.5 h-3.5 text-primary" />
                <span>Mark All Read</span>
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              disabled={isLoading}
              title="Refresh activity"
              className="p-2 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-primary" : "text-muted-foreground"}`} />
            </Button>

            <Link href="/dashboard/settings?tab=notifications">
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5 text-xs font-semibold cursor-pointer shadow-xs"
              >
                <Settings className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Preferences</span>
              </Button>
            </Link>
          </div>
        </header>

        {/* ── 2. INSTAGRAM-STYLE CATEGORY FILTER TABS ────────────────────── */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
          {(
            [
              { key: "all", label: "All Activity" },
              { key: "unread", label: unreadCount > 0 ? `Unread (${unreadCount})` : "Unread" },
              { key: "deals", label: "Deals & Contracts" },
              { key: "payments", label: "Payments & Escrow" },
              { key: "messages", label: "Direct Messages" },
            ] as const
          ).map((tab) => {
            const active = activeFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setActiveFilter(tab.key);
                  setDisplayLimit(ITEMS_PER_PAGE);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-medium transition-all shrink-0 cursor-pointer border ${
                  active
                    ? "bg-primary text-primary-foreground border-primary font-bold shadow-xs"
                    : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── 3. MAIN ACTIVITY STREAM CARD ───────────────────────────────── */}
        <div className="bg-card border border-border rounded-2xl shadow-xs overflow-hidden divide-y divide-border">
          {filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-muted border border-border flex items-center justify-center text-muted-foreground mb-3">
                <CheckCircle2 className="w-7 h-7 text-verified" />
              </div>
              <h2 className="text-base font-heading font-bold text-foreground">
                You&apos;re completely caught up!
              </h2>
              <p className="text-xs text-muted-foreground max-w-sm mt-1 leading-relaxed">
                No notifications match your current filter. Real-time deal events, milestone signoffs, and escrow updates will appear here automatically.
              </p>
            </div>
          ) : (
            sections.map((sec) => (
              <div key={sec.title} className="p-0">
                {/* Section Header */}
                <div className="px-5 py-2.5 bg-muted/40 border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                  <span>{sec.title}</span>
                  <span className="text-[10px] font-mono lowercase">
                    {sec.items.length} {sec.items.length === 1 ? "event" : "events"}
                  </span>
                </div>

                {/* Items in section */}
                <div className="divide-y divide-border">
                  {sec.items.map((item) => {
                    const meta = getNotificationTypeMeta(item.type);
                    const timeStr = formatNotificationTime(item.createdAt);
                    const actionLabel = getInlineActionLabel(item);

                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleItemClick(item)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleItemClick(item);
                          }
                        }}
                        className={`w-full text-left p-4 sm:p-5 flex items-start gap-3.5 sm:gap-4 transition-colors hover:bg-muted/40 cursor-pointer ${
                          item.isRead ? "opacity-90" : "bg-primary/[0.02] dark:bg-primary/[0.05]"
                        }`}
                      >
                        {/* Type Icon Badge */}
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${meta.badgeBg} ${meta.borderColor} ${meta.textColor} shadow-xs`}
                        >
                          {renderActivityIcon(meta.iconName, "w-4 h-4")}
                        </div>

                        {/* Middle Text Details */}
                        <div className="flex-1 min-w-0 pr-2">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span
                              className={`text-sm tracking-tight ${
                                item.isRead ? "font-semibold text-foreground" : "font-bold text-foreground"
                              }`}
                            >
                              {item.title}
                            </span>
                            <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums font-mono">
                              {timeStr}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                            {item.message}
                          </p>

                          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                            <span
                              className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${meta.badgeBg} ${meta.borderColor} ${meta.textColor}`}
                            >
                              {meta.label}
                            </span>
                          </div>
                        </div>

                        {/* Inline Quick Action CTA (Instagram Activity Pattern) */}
                        <div className="flex items-center gap-2 shrink-0 pt-1">
                          {!item.isRead && (
                            <span
                              className="w-2 h-2 rounded-full bg-primary shadow-xs"
                              title="Unread"
                            />
                          )}

                          <button
                            type="button"
                            onClick={(e) => handleInlineActionClick(e, item)}
                            className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-muted hover:bg-card hover:border-primary/40 border border-border text-foreground transition-all cursor-pointer shadow-xs"
                          >
                            <span>{actionLabel}</span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                          </button>

                          <ChevronRight className="w-4 h-4 text-muted-foreground sm:hidden" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── 4. PROGRESSIVE LOAD MORE (VIRTUALIZATION BENCHMARK) ─────────── */}
        {hasMore && (
          <div className="text-center pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDisplayLimit((prev) => prev + ITEMS_PER_PAGE)}
              className="text-xs font-semibold px-6 py-2 cursor-pointer shadow-xs"
            >
              Load Older Activity ({filteredNotifications.length - displayLimit} remaining)
            </Button>
          </div>
        )}
        </div>
      </PullToRefresh>
    </DashboardShell>
  );
}
