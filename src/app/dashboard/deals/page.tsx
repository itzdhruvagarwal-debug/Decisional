"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { formatCurrency } from "@/lib/utils-client";

const statusConfig: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  PENDING_SIGNATURE: {
    label: "Awaiting Signature",
    color: "var(--color-warning)",
    icon: "SG",
  },
  ACTIVE: { label: "Active", color: "var(--color-accent-cyan)", icon: "AC" },
  CONTENT_SUBMITTED: {
    label: "Awaiting Review",
    color: "var(--color-accent-amber)",
    icon: "RV",
  },
  REVISION_REQUESTED: {
    label: "Revision Needed",
    color: "var(--color-warning)",
    icon: "RN",
  },
  CONTENT_APPROVED: {
    label: "Ready to Post",
    color: "var(--color-primary)",
    icon: "AP",
  },
  POSTED: {
    label: "Post Submitted",
    color: "var(--color-accent-cyan)",
    icon: "PS",
  },
  VERIFICATION_PENDING: {
    label: "Verifying",
    color: "var(--color-accent-amber)",
    icon: "VR",
  },
  VERIFIED: { label: "Verified", color: "var(--color-success)", icon: "OK" },
  COMPLETED: { label: "Completed", color: "var(--color-success)", icon: "CP" },
  DISPUTED: { label: "Disputed", color: "var(--color-error)", icon: "DS" },
  CANCELLED: {
    label: "Cancelled",
    color: "var(--color-text-muted)",
    icon: "CL",
  },
  PAYMENT_PENDING: {
    label: "Payment Pending",
    color: "var(--color-warning)",
    icon: "PP",
  },
  PAYMENT_HELD: {
    label: "Payment Secured",
    color: "var(--color-success)",
    icon: "PS",
  },
};

function getStatusInfo(status: string) {
  return (
    statusConfig[status] || {
      label: status.replace(/_/g, " "),
      color: "var(--color-text-muted)",
      icon: "--",
    }
  );
}

interface Deal {
  id: string;
  status: string;
  amount: number;
  createdAt: string;
  postingDeadline: string;
  campaign: { title: string };
  brand: { companyName: string; logo: string | null };
  deliverables: { type: string; count: number }[];
}

function normalizeDeliverables(value: unknown): Deal["deliverables"] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const parsed = item as { type?: unknown; count?: unknown };
      return {
        type: String(parsed?.type || "").trim(),
        count: Math.max(1, Number(parsed?.count || 1)),
      };
    })
    .filter((item) => Boolean(item.type));
}

interface RawDeal {
  id: string;
  status: string;
  amount: number;
  createdAt: string | Date;
  postingDeadline?: string;
  campaign?: {
    title?: string;
    postingDeadline?: string;
    deliverables?: unknown;
  };
  brand?: {
    companyName?: string;
    logo?: string | null;
  };
  deliverables?: unknown;
}

function normalizeDeal(raw: RawDeal): Deal {
  const campaign = raw?.campaign || {};
  const brand = raw?.brand || {};

  return {
    id: String(raw?.id || ""),
    status: String(raw?.status || "PENDING_SIGNATURE"),
    amount: Number(raw?.amount || 0),
    createdAt: raw?.createdAt
      ? new Date(raw.createdAt).toLocaleDateString("en-IN")
      : "Not started",
    postingDeadline: raw?.postingDeadline || campaign?.postingDeadline || new Date().toISOString(),
    campaign: {
      title: String(campaign?.title || "Untitled Campaign"),
    },
    brand: {
      companyName: String(brand?.companyName || "Brand"),
      logo: brand?.logo || null,
    },
    deliverables: normalizeDeliverables(raw?.deliverables || campaign?.deliverables),
  };
}

function getDeliverableIcon(type: string): string {
  const icons: Record<string, string> = {
    INSTAGRAM_POST: "📸",
    INSTAGRAM_REEL: "🎬",
    INSTAGRAM_STORY: "📖",
    YOUTUBE_VIDEO: "▶️",
    YOUTUBE_SHORT: "⚡",
    TWITTER_POST: "🐦",
    LINKEDIN_POST: "💼",
  };
  return icons[type] || "📄";
}

function DealSkeleton() {
  return (
    <div className="card" style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", gap: "16px", alignItems: "center", marginBottom: "16px" }}>
        <div className="skeleton" style={{ width: 48, height: 48, borderRadius: "var(--radius-md)", flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: 16, width: "60%", borderRadius: 6, marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 13, width: "40%", borderRadius: 6 }} />
        </div>
        <div className="skeleton" style={{ height: 28, width: 100, borderRadius: "var(--radius-full)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", gap: 24, flex: 1 }}>
          <div>
            <div className="skeleton" style={{ height: 11, width: 70, borderRadius: 4, marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 14, width: 90, borderRadius: 4 }} />
          </div>
          <div>
            <div className="skeleton" style={{ height: 11, width: 50, borderRadius: 4, marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 14, width: 60, borderRadius: 4 }} />
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="skeleton" style={{ height: 11, width: 50, borderRadius: 4, marginBottom: 6, marginLeft: "auto" }} />
          <div className="skeleton" style={{ height: 22, width: 90, borderRadius: 4, marginLeft: "auto" }} />
        </div>
      </div>
    </div>
  );
}

interface DealListItemProps {
  readonly deal: Deal;
  readonly selectedDeal: string | null;
  readonly setSelectedDeal: (id: string | null) => void;
}

interface DealsEmptyStateProps {
  readonly statusFilter: string;
  readonly isInfluencer: boolean;
  readonly setStatusFilter: (filter: string) => void;
}

function DealsEmptyState({ statusFilter, isInfluencer, setStatusFilter }: DealsEmptyStateProps) {
  let message = "No deals match this status filter. Try a different filter.";
  if (statusFilter === "all") {
    message = isInfluencer
      ? "Apply to campaigns to start collaborating with brands and earning!"
      : "Create a campaign and invite influencers to start collaborating.";
  }

  return (
    <div
      className="card"
      style={{ textAlign: "center", padding: "80px 32px" }}
    >
      <div style={{ fontSize: "64px", marginBottom: "20px" }} aria-hidden="true">
        {statusFilter === "all" ? "🤝" : "🔍"}
      </div>
      <h3
        style={{
          fontSize: "20px",
          fontWeight: 700,
          marginBottom: "10px",
        }}
      >
        {statusFilter === "all"
          ? "No Deals Yet"
          : `No ${statusFilter.replaceAll("_", " ").toLowerCase()} deals`}
      </h3>
      <p
        style={{
          color: "var(--color-text-secondary)",
          marginBottom: "28px",
          maxWidth: 420,
          margin: "0 auto 28px",
          lineHeight: 1.7,
        }}
      >
        {message}
      </p>
      {statusFilter === "all" ? (
        <Link
          href={isInfluencer ? "/dashboard/campaigns" : "/dashboard/campaigns/create"}
          className="btn btn-primary btn-lg"
        >
          {isInfluencer ? "Browse Campaigns" : "Create Campaign"}
        </Link>
      ) : (
        <button
          onClick={() => setStatusFilter("all")}
          className="btn btn-secondary"
        >
          View All Deals
        </button>
      )}
    </div>
  );
}

function DealListItem({ deal, selectedDeal, setSelectedDeal }: DealListItemProps) {
  const status = getStatusInfo(deal.status);
  const canSubmitContent = [
    "ACTIVE",
    "PAYMENT_HELD",
    "REVISION_REQUESTED",
  ].includes(deal.status);

  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: "hidden",
        border:
          selectedDeal === deal.id
            ? "1px solid var(--color-primary)"
            : "1px solid transparent",
      }}
    >
      <button
        type="button"
        onClick={() =>
          setSelectedDeal(selectedDeal === deal.id ? null : deal.id)
        }
        aria-expanded={selectedDeal === deal.id}
        style={{
          display: "block",
          width: "100%",
          padding: "24px",
          background: "none",
          border: "none",
          fontFamily: "inherit",
          color: "inherit",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "16px",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "16px",
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                background: "var(--gradient-primary)",
                borderRadius: "var(--radius-md)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: "18px",
                color: "white",
                flexShrink: 0,
                overflow: "hidden",
              }}
            >
              {deal.brand.logo ? (
                <img
                  src={deal.brand.logo}
                  alt={deal.brand.companyName}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                    const parent = (e.target as HTMLImageElement).parentElement;
                    if (parent) parent.textContent = deal.brand.companyName?.[0]?.toUpperCase() || "B";
                  }}
                />
              ) : (
                deal.brand.companyName?.[0]?.toUpperCase() || "B"
              )}
            </div>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 700 }}>
                {deal.campaign.title}
              </h3>
              <p
                style={{
                  fontSize: "14px",
                  color: "var(--color-text-secondary)",
                }}
              >
                {deal.brand.companyName}
              </p>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 12px",
              background: `${status.color}20`,
              borderRadius: "var(--radius-full)",
              color: status.color,
              fontSize: "12px",
              fontWeight: 600,
              alignSelf: "flex-start",
            }}
          >
            <span>{status.icon}</span>
            <span>{status.label}</span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div
            style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}
          >
            <div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--color-text-muted)",
                }}
              >
                Deliverables
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  marginTop: "4px",
                  flexWrap: "wrap",
                }}
              >
                {deal.deliverables.map((d, i) => (
                  <span key={i} style={{ fontSize: "14px" }}>
                    {getDeliverableIcon(d.type)} x{d.count}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--color-text-muted)",
                }}
              >
                Deadline
              </div>
              <div style={{ fontSize: "14px", fontWeight: 600 }}>
                {new Date(deal.postingDeadline).toLocaleDateString(
                  "en-IN",
                  {
                    day: "numeric",
                    month: "short",
                  },
                )}
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right", minWidth: "80px" }}>
            <div
              style={{
                fontSize: "12px",
                color: "var(--color-text-muted)",
              }}
            >
              Amount
            </div>
            <div
              style={{ fontSize: "18px", fontWeight: 800 }}
              className="gradient-text"
            >
              {formatCurrency(deal.amount)}
            </div>
          </div>
        </div>
      </button>

      {selectedDeal === deal.id && (
        <div
          style={{
            margin: "0 24px 24px 24px",
            paddingTop: "20px",
            borderTop: "1px solid var(--color-border)",
          }}
        >
          <div
            className="grid-2"
            style={{ gap: "16px", marginBottom: "16px" }}
          >
            <div>
              <h4
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  marginBottom: "8px",
                }}
              >
                Timeline
              </h4>
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--color-text-secondary)",
                }}
              >
                <p>Started: {deal.createdAt}</p>
                <p>Post by: {deal.postingDeadline}</p>
              </div>
            </div>
            <div>
              <h4
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  marginBottom: "8px",
                }}
              >
                Required Deliverables
              </h4>
              {deal.deliverables.map((d, i) => (
                <p
                  key={i}
                  style={{
                    fontSize: "13px",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {getDeliverableIcon(d.type)}{" "}
                  {d.type.replace(/_/g, " ")} x {d.count}
                </p>
              ))}
            </div>
          </div>

          <div
            style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}
          >
            {canSubmitContent && (
              <Link
                href={`/dashboard/deals/${deal.id}`}
                className="btn btn-primary"
              >
                Submit Content
              </Link>
            )}
            {deal.status === "CONTENT_APPROVED" && (
              <Link
                href={`/dashboard/deals/${deal.id}`}
                className="btn btn-primary"
              >
                Submit Post URL
              </Link>
            )}
            <Link
              href={`/dashboard/messages?deal=${deal.id}`}
              className="btn btn-secondary"
            >
              Message
            </Link>
            <Link
              href={`/dashboard/deals/${deal.id}`}
              className="btn btn-ghost"
            >
              Details
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DealsPage() {
  const { data: session } = useSession();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedDeal, setSelectedDeal] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({ active: 0, completed: 0, totalEarnings: 0 });
  const DEALS_PER_PAGE = 50;
  const isInfluencer = session?.user?.userType === "INFLUENCER";

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);

    const statusParam = statusFilter !== "all" ? `&status=${statusFilter}` : "";
    fetch(`/api/deals?page=${currentPage}&limit=${DEALS_PER_PAGE}${statusParam}`, { cache: "no-store", signal: controller.signal })
      .then((res) => res.json())
      .then((payload) => {
        if (!active) return;
        const data = payload?.data || payload;
        const rawDeals: unknown[] = Array.isArray(data?.deals) ? data.deals : [];
        setDeals(rawDeals.map((raw) => normalizeDeal(raw as RawDeal)).filter((deal) => deal.id));
        if (data?.pagination?.totalPages) setTotalPages(data.pagination.totalPages);
        if (data?.stats) setStats(data.stats);
        setLoading(false);
      })
      .catch((err) => {
        const isTransientFetchFailure =
          err instanceof TypeError && err.message.includes("Failed to fetch");
        if (active && !controller.signal.aborted && !isTransientFetchFailure) {
          console.error("[deals-page] Failed to fetch deals:", err);
        }
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [currentPage, statusFilter]);

  const filteredDeals = deals;

  const dealStats = stats;

  if (!session) {
    return <div className="p-8 text-center text-muted">Loading session...</div>;
  }

  return (
    <DashboardShell user={session.user}>
      {/* Page Header */}
      <div
        style={{
          marginBottom: "24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 800 }}>My Deals</h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
            Manage your active collaborations
          </p>
        </div>
      </div>

      {loading ? (
        <div>
          {/* Stats skeleton */}
          <div className="grid-3" style={{ marginBottom: "24px" }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="card" style={{ textAlign: "center", padding: "24px" }}>
                <div className="skeleton" style={{ height: 36, width: 80, borderRadius: 8, margin: "0 auto 8px" }} />
                <div className="skeleton" style={{ height: 13, width: 100, borderRadius: 4, margin: "0 auto" }} />
              </div>
            ))}
          </div>
          {/* Deal card skeletons */}
          {[1, 2, 3, 4].map((i) => <DealSkeleton key={i} />)}
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid-3" style={{ marginBottom: "24px" }}>
            <div className="card" style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: "32px",
                  fontWeight: 800,
                  color: "var(--color-accent-cyan)",
                }}
              >
                {dealStats.active}
              </div>
              <div
                style={{
                  color: "var(--color-text-secondary)",
                  fontSize: "14px",
                }}
              >
                Active Deals
              </div>
            </div>
            <div className="card" style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: "32px",
                  fontWeight: 800,
                  color: "var(--color-success)",
                }}
              >
                {dealStats.completed}
              </div>
              <div
                style={{
                  color: "var(--color-text-secondary)",
                  fontSize: "14px",
                }}
              >
                Completed
              </div>
            </div>
            <div className="card" style={{ textAlign: "center" }}>
              <div
                style={{ fontSize: "32px", fontWeight: 800 }}
                className="gradient-text"
              >
                {formatCurrency(dealStats.totalEarnings)}
              </div>
              <div
                style={{
                  color: "var(--color-text-secondary)",
                  fontSize: "14px",
                }}
              >
                Total Earnings
              </div>
            </div>
          </div>

          {/* Filter */}
          <div
            className="scrollable-tabs"
            style={{
              display: "flex",
              gap: "8px",
              marginBottom: "24px",
              paddingBottom: "8px",
            }}
          >
            {[
              { key: "all", label: "All Deals" },
              { key: "PENDING_SIGNATURE", label: "Awaiting Signature" },
              { key: "ACTIVE", label: "Active" },
              { key: "PAYMENT_HELD", label: "Secured" },
              { key: "CONTENT_SUBMITTED", label: "Awaiting Review" },
              { key: "REVISION_REQUESTED", label: "Revision Needed" },
              { key: "CONTENT_APPROVED", label: "Ready to Post" },
              { key: "POSTED", label: "Post Submitted" },
              { key: "VERIFICATION_PENDING", label: "Verifying" },
              { key: "COMPLETED", label: "Completed" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => {
                  setStatusFilter(f.key);
                  setCurrentPage(1);
                }}
                className={`btn ${statusFilter === f.key ? "btn-primary" : "btn-secondary"}`}
                style={{ whiteSpace: "nowrap" }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Deals List */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            {filteredDeals.map((deal) => (
              <DealListItem
                key={deal.id}
                deal={deal}
                selectedDeal={selectedDeal}
                setSelectedDeal={setSelectedDeal}
              />
            ))}
          </div>

          {filteredDeals.length === 0 && (
            <DealsEmptyState
              statusFilter={statusFilter}
              isInfluencer={isInfluencer}
              setStatusFilter={setStatusFilter}
            />
          )}
        </>
      )}
      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: "16px",
          padding: "24px 0",
        }}>
          <button
            className="btn btn-secondary"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            style={{ minWidth: "100px" }}
          >
            ← Previous
          </button>
          <span style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>
            Page {currentPage} of {totalPages}
          </span>
          <button
            className="btn btn-secondary"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
            style={{ minWidth: "100px" }}
          >
            Next →
          </button>
        </div>
      )}
    </DashboardShell>
  );
}
