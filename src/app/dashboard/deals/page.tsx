"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/dashboard/DashboardShell";

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

function normalizeDeal(raw: any): Deal {
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

function formatCurrency(amount: number): string {
  return "Rs " + (amount / 100).toLocaleString("en-IN");
}

function getDeliverableIcon(type: string): string {
  const icons: Record<string, string> = {
    INSTAGRAM_POST: "IG",
    INSTAGRAM_REEL: "IR",
    INSTAGRAM_STORY: "IS",
    YOUTUBE_VIDEO: "YT",
    YOUTUBE_SHORT: "YS",
  };
  return icons[type] || "CT";
}

export default function DealsPage() {
  const { data: session } = useSession();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedDeal, setSelectedDeal] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    fetch("/api/deals", { cache: "no-store", signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        const rawDeals: unknown[] = Array.isArray(data?.deals) ? data.deals : [];
        setDeals(rawDeals.map(normalizeDeal).filter((deal) => deal.id));
        setLoading(false);
      })
      .catch((err) => {
        const isTransientFetchFailure =
          err instanceof TypeError && err.message.includes("Failed to fetch");
        if (active && !controller.signal.aborted && !isTransientFetchFailure) {
          console.error(err);
        }
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const filteredDeals =
    statusFilter === "all"
      ? deals
      : deals.filter((d) => d.status === statusFilter);

  const dealStats = {
    active: deals.filter((d) =>
      [
        "ACTIVE",
        "CONTENT_SUBMITTED",
        "REVISION_REQUESTED",
        "CONTENT_APPROVED",
        "PAYMENT_HELD",
        "POSTED",
        "VERIFICATION_PENDING",
      ].includes(d.status),
    ).length,
    completed: deals.filter((d) => d.status === "COMPLETED").length,
    totalEarnings: deals
      .filter((d) => d.status === "COMPLETED")
      .reduce((sum, d) => sum + d.amount, 0),
  };

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
        <div style={{ padding: "48px", textAlign: "center" }}>
          <span className="loading" style={{ width: "40px", height: "40px" }} />
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
              { key: "ACTIVE", label: "Active" },
              { key: "PAYMENT_HELD", label: "Payment Secured" },
              { key: "CONTENT_SUBMITTED", label: "Awaiting Review" },
              { key: "REVISION_REQUESTED", label: "Revision Needed" },
              { key: "CONTENT_APPROVED", label: "Ready to Post" },
              { key: "POSTED", label: "Post Submitted" },
              { key: "VERIFICATION_PENDING", label: "Verifying" },
              { key: "COMPLETED", label: "Completed" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
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
            {filteredDeals.map((deal) => {
              const status = getStatusInfo(deal.status);
              const canSubmitContent = [
                "ACTIVE",
                "PAYMENT_HELD",
                "REVISION_REQUESTED",
              ].includes(deal.status);

              return (
              <div
                key={deal.id}
                className="card"
                style={{
                  cursor: "pointer",
                  border:
                    selectedDeal === deal.id
                      ? "1px solid var(--color-primary)"
                      : "1px solid transparent",
                }}
                onClick={() =>
                  setSelectedDeal(selectedDeal === deal.id ? null : deal.id)
                }
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
                        background: "var(--gradient-card)",
                        borderRadius: "var(--radius-md)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                      }}
                    >
                      {deal.brand.logo}
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

                {/* Expanded View */}
                {selectedDeal === deal.id && (
                  <div
                    style={{
                      marginTop: "20px",
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
            })}
          </div>

          {filteredDeals.length === 0 && (
            <div
              className="card"
              style={{ textAlign: "center", padding: "60px 24px" }}
            >
              <div style={{ fontSize: "14px", fontWeight: 800, marginBottom: "12px", color: "var(--color-text-muted)" }}>
                No deals
              </div>
              <h3
                style={{
                  fontSize: "18px",
                  fontWeight: 600,
                  marginBottom: "8px",
                }}
              >
                No deals found
              </h3>
              <p
                style={{
                  color: "var(--color-text-secondary)",
                  marginBottom: "24px",
                }}
              >
                Apply to campaigns to start collaborating with brands
              </p>
              <Link href="/dashboard/campaigns" className="btn btn-primary">
                Browse Campaigns
              </Link>
            </div>
          )}
        </>
      )}
    </DashboardShell>
  );
}
