"use client";


import Link from "next/link";
import { useState, useMemo } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import Image from "next/image";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { formatCurrency } from "@/lib/utils-client";
import EmptyState from "@/components/ui/EmptyState";
import { Button } from "@/components/ui";

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
      label: status.replaceAll("_", " "),
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
        type: typeof parsed?.type === "string" ? parsed.type.trim() : "",
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

interface DealsApiResponse {
  data?: {
    deals?: RawDeal[];
    pagination?: { totalPages?: number };
    stats?: { active?: number; completed?: number; totalEarnings?: number };
  };
  deals?: RawDeal[];
  pagination?: { totalPages?: number };
  stats?: { active?: number; completed?: number; totalEarnings?: number };
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
    <div className="card mb-4">
      <div className="flex gap-4 items-center mb-4">
        <div className="skeleton flex-shrink-0 rounded-md" style={{ width: 48, height: 48 }} />
        <div className="flex-1">
          <div className="skeleton" style={{ height: 16, width: "60%", borderRadius: 6, marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 13, width: "40%", borderRadius: 6 }} />
        </div>
        <div className="skeleton" style={{ height: 28, width: 100, borderRadius: "var(--radius-full)" }} />
      </div>
      <div className="flex justify-between items-center flex-wrap" style={{ gap: 16 }}>
        <div className="flex flex-1" style={{ gap: 24 }}>
          <div>
            <div className="skeleton" style={{ height: 11, width: 70, borderRadius: 4, marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 14, width: 90, borderRadius: 4 }} />
          </div>
          <div>
            <div className="skeleton" style={{ height: 11, width: 50, borderRadius: 4, marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 14, width: 60, borderRadius: 4 }} />
          </div>
        </div>
        <div className="text-right">
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

  const title = statusFilter === "all"
    ? "No Deals Yet"
    : `No ${statusFilter.replaceAll("_", " ").toLowerCase()} deals`;

  return (
    <EmptyState
      emoji={statusFilter === "all" ? "🤝" : "🔍"}
      title={title}
      description={message}
      actionLabel={statusFilter === "all" ? (isInfluencer ? "Browse Campaigns" : "Create Campaign") : "View All Deals"}
      actionHref={statusFilter === "all" ? (isInfluencer ? "/dashboard/campaigns" : "/dashboard/campaigns/create") : undefined}
      onActionClick={statusFilter !== "all" ? () => setStatusFilter("all") : undefined}
    />
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
      className="card overflow-hidden p-0" style={{ border:
          selectedDeal === deal.id
            ? "1px solid var(--color-primary)"
            : "1px solid transparent" }}
    >
      <Button
        type="button"
        variant="ghost"
        onClick={() =>
          setSelectedDeal(selectedDeal === deal.id ? null : deal.id)
        }
        aria-expanded={selectedDeal === deal.id}
        className="block w-full p-6 text-left"
      >
        <div
          className="flex justify-between items-start mb-4 flex-wrap gap-3"
        >
          <div
            className="flex gap-4 items-center"
          >
            <div
              className="flex items-center justify-center font-bold text-lg flex-shrink-0 overflow-hidden rounded-md" style={{ width: "48px", height: "48px", background: "var(--gradient-primary)", color: "white" }}
            >
              {deal.brand.logo ? (
                <Image
                  src={deal.brand.logo}
                  alt={deal.brand.companyName}
                  fill
                  unoptimized
                  className="object-cover"
                />
              ) : (
                deal.brand.companyName?.[0]?.toUpperCase() || "B"
              )}
            </div>
            <div>
              <h3 className="text-base font-bold">
                {deal.campaign.title}
              </h3>
              <p
                className="text-sm text-secondary"
              >
                {deal.brand.companyName}
              </p>
            </div>
          </div>
          <div
            className="flex items-center gap-2 text-xs font-semibold px-3-py-1" style={{ background: `${status.color}20`, borderRadius: "var(--radius-full)", color: status.color, alignSelf: "flex-start" }}
          >
            <span>{status.icon}</span>
            <span>{status.label}</span>
          </div>
        </div>

        <div
          className="flex justify-between items-center flex-wrap gap-4"
        >
          <div
            className="flex gap-4 flex-wrap"
          >
            <div>
              <div
                className="text-xs text-muted"
              >
                Deliverables
              </div>
              <div
                className="flex gap-2 mt-1 flex-wrap"
              >
                {deal.deliverables.map((d, idx) => (
                  <span key={d.type + "_" + idx} className="text-sm">
                    {getDeliverableIcon(d.type)} x{d.count}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div
                className="text-xs text-muted"
              >
                Deadline
              </div>
              <div className="text-sm font-semibold">
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
          <div className="text-right" style={{ minWidth: "80px" }}>
            <div
              className="text-xs text-muted"
            >
              Amount
            </div>
            <div
              
               className="text-lg font-extrabold gradient-text"
            >
              {formatCurrency(deal.amount)}
            </div>
          </div>
        </div>
      </Button>

      {selectedDeal === deal.id && (
        <div
          className="border-top" style={{ margin: "0 24px 24px 24px", paddingTop: "20px" }}
        >
          <div
            className="grid-2 gap-4 mb-4"
          >
            <div>
              <h4
                className="text-sm font-semibold mb-2"
              >
                Timeline
              </h4>
              <div
                className="text-sm text-secondary"
              >
                <p>Started: {deal.createdAt}</p>
                <p>Post by: {deal.postingDeadline}</p>
              </div>
            </div>
            <div>
              <h4
                className="text-sm font-semibold mb-2"
              >
                Required Deliverables
              </h4>
              {deal.deliverables.map((d, idx) => (
                <p
                  key={d.type + "_" + idx}
                  className="text-sm text-secondary"
                >
                  {getDeliverableIcon(d.type)}{" "}
                  {d.type.replaceAll("_", " ")} x {d.count}
                </p>
              ))}
            </div>
          </div>

          <div
            className="flex gap-3 flex-wrap"
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
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedDeal, setSelectedDeal] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const DEALS_PER_PAGE = 50;
  const isInfluencer = session?.user?.userType === "INFLUENCER";

  const statusParam = statusFilter === "all" ? "" : `&status=${statusFilter}`;
  const { data: payload, isLoading: loading } = useSWR<DealsApiResponse>(
    `/api/deals?page=${currentPage}&limit=${DEALS_PER_PAGE}${statusParam}`,
    fetcher
  );

  const { deals, totalPages, stats } = useMemo(() => {
    const data = payload?.data || payload;
    const rawDeals: unknown[] = Array.isArray(data?.deals) ? data.deals : [];
    const mappedDeals = rawDeals.map((raw) => normalizeDeal(raw as RawDeal)).filter((deal) => deal.id);
    const pages = data?.pagination?.totalPages || 1;
    const dealStats = data?.stats || { active: 0, completed: 0, totalEarnings: 0 };
    return { deals: mappedDeals, totalPages: pages, stats: dealStats };
  }, [payload]);

  const filteredDeals = deals;

  const dealStats = stats;

  if (!session) {
    return <div className="p-8 text-center text-muted">Loading session...</div>;
  }

  return (
    <DashboardShell user={session.user}>
      {/* Page Header */}
      <div
        className="mb-6 flex justify-between items-center"
      >
        <div>
          <h1 className="text-2xl font-extrabold">My Deals</h1>
          <p className="text-secondary text-sm">
            Manage your active collaborations
          </p>
        </div>
      </div>

      {loading ? (
        <div>
          {/* Stats skeleton */}
          <div className="grid-3 mb-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card text-center p-6">
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
          <div className="grid-3 mb-6">
            <div className="card text-center">
              <div
                className="font-extrabold text-3xl" style={{ color: "var(--color-accent-cyan)" }}
              >
                {dealStats.active}
              </div>
              <div
                className="text-secondary text-sm"
              >
                Active Deals
              </div>
            </div>
            <div className="card text-center">
              <div
                className="font-extrabold text-3xl text-emerald"
              >
                {dealStats.completed}
              </div>
              <div
                className="text-secondary text-sm"
              >
                Completed
              </div>
            </div>
            <div className="card text-center">
              <div
                 className="text-3xl font-extrabold gradient-text"
              >
                {formatCurrency(dealStats.totalEarnings || 0)}
              </div>
              <div
                className="text-secondary text-sm"
              >
                Total Earnings
              </div>
            </div>
          </div>

          {/* Filter */}
          <div
            className="scrollable-tabs flex gap-2 mb-6" style={{ paddingBottom: "8px" }}
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
              <Button
                key={f.key}
                variant={statusFilter === f.key ? "primary" : "secondary"}
                onClick={() => {
                  setStatusFilter(f.key);
                  setCurrentPage(1);
                }}
                className="whitespace-nowrap"
              >
                {f.label}
              </Button>
            ))}
          </div>

          {/* Deals List */}
          <div
            className="flex flex-col gap-4"
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
        <div className="flex justify-center items-center gap-4" style={{ padding: "24px 0" }}>
          <Button
            variant="secondary"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            style={{ minWidth: "100px" }}
          >
            ← Previous
          </Button>
          <span className="text-sm text-secondary">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
            style={{ minWidth: "100px" }}
          >
            Next →
          </Button>
        </div>
      )}
    </DashboardShell>
  );
}
