"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import Link from "next/link";

interface BrandAnalyticsData {
  overview: {
    totalSpent: number;
    activeCampaigns: number;
    totalCampaigns: number;
    activeDeals: number;
    trustScore: number;
    completedDeals: number;
    avgDealCost: number;
    memberSince: Date;
  };
  spendHistory: Array<{ month: string; amount: number }>;
  recentCampaigns: Array<{
    id: string;
    title: string;
    status: string;
    budget: number;
    dealsCount: number;
    category: string;
    completedDeals: number;
    amountSpent: number;
  }>;
  dealStatusBreakdown: Array<{
    status: string;
    count: number;
    totalAmount: number;
  }>;
  microVsMacro: {
    micro: {
      count: number;
      avgCost: number;
      avgRating: string;
    };
    macro: {
      count: number;
      avgCost: number;
      avgRating: string;
    };
  };
  referralStats: {
    totalReferrals: number;
    activeReferrals: number;
    totalEarnings: number;
    tier?: { label: string };
    earnings?: number;
    referralCode?: string;
  };
  error?: string;
}

interface BrandDashboardProps {
  readonly data: BrandAnalyticsData;
}

const toastBackgroundMap: Record<string, string> = {
  success: "linear-gradient(135deg, #059669, #10b981)",
  error: "linear-gradient(135deg, #dc2626, #ef4444)",
};

const toastPrefixMap: Record<string, string> = {
  success: "✓ ",
  error: "✕ ",
};

export default function BrandDashboard({ data }: BrandDashboardProps) {
  const [chartsReady, setChartsReady] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: number; type: "success" | "error" | "info"; message: string }>>([]);

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const showToast = (type: "success" | "error" | "info", message: string) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => removeToast(id), 5000);
  };

  useEffect(() => {
    const id = window.setTimeout(() => setChartsReady(true), 50);
    return () => window.clearTimeout(id);
  }, []);

  const getTierLabel = (score: number) => {
    if (score <= 450) return "Flagged";
    if (score <= 600) return "Limited";
    if (score <= 750) return "Normal";
    if (score <= 850) return "Trusted";
    return "Elite";
  };

  if (!data || data.error)
    return (
      <div
        style={{
          padding: "48px",
          textAlign: "center",
          color: "var(--color-accent-rose)",
        }}
      >
        Failed to load data
      </div>
    );

  const { overview, spendHistory, recentCampaigns = [] } = data;

  return (
    <div className="dashboard-home-stack">
      {toasts.length > 0 && (
        <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: "8px", maxWidth: "400px" }}>
          {toasts.map((t) => (
            <button
              key={t.id}
              style={{
                textAlign: "left",
                fontFamily: "inherit",
                display: "block",
                width: "100%",
                padding: "12px 20px",
                borderRadius: "10px",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 500,
                background: toastBackgroundMap[t.type] || "linear-gradient(135deg, #2563eb, #3b82f6)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.1)",
                animation: "slideInRight 0.3s ease-out",
                cursor: "pointer",
              }}
              onClick={() => removeToast(t.id)}
            >
              {toastPrefixMap[t.type] || "ℹ "}{t.message}
            </button>
          ))}
        </div>
      )}
      <section className="dashboard-welcome-card">
        <div>
          <p className="dashboard-welcome-kicker">Brand workspace</p>
          <h2>Campaign command center</h2>
          <p>Manage creator selection, campaign spend, secure holds, and approvals.</p>
        </div>
        <div className="dashboard-welcome-score" aria-label={`Trust score ${overview.trustScore || 0}`}>
          <span>Trust</span>
          <strong>{overview.trustScore || "--"}</strong>
          <small>{overview.trustScore ? getTierLabel(overview.trustScore) : "Brand"}</small>
        </div>
      </section>

      <section className="dashboard-overview-panel">
        <div className="dashboard-section-row">
          <h3>Overview</h3>
          <span>{overview.totalCampaigns} campaigns</span>
        </div>
        <div className="grid-4 stagger-children dashboard-overview-grid">
          <StatCard
            icon="spend"
            label="Total Spent"
            value={`₹${(overview.totalSpent / 100).toLocaleString("en-IN")}`}
            accentColor="var(--color-secondary)"
          />
          <StatCard
            icon="campaigns"
            label="Active Campaigns"
            value={overview.activeCampaigns}
            subvalue={`${overview.totalCampaigns} total`}
            accentColor="var(--color-accent-cyan)"
          />
          <StatCard
            icon="deals"
            label="Active Deals"
            value={overview.activeDeals}
            subvalue={`${overview.completedDeals} completed`}
            accentColor="var(--color-accent-emerald)"
          />
          <StatCard
            icon="trust"
            label="Trust Score"
            value={overview.trustScore ? `${overview.trustScore}/900` : "N/A"}
            subvalue={overview.trustScore ? getTierLabel(overview.trustScore) : "Brand"}
            accentColor="var(--color-primary-light)"
          />
        </div>
      </section>

      {/* Spend Chart */}
      <div className="card">
        <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "20px" }}>
          Monthly Spend (Last 12 Months)
        </h3>
        <div style={{ height: "280px", width: "100%" }}>
          {chartsReady && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={spendHistory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                />
                <XAxis
                  dataKey="month"
                  stroke="var(--color-text-muted)"
                  fontSize={12}
                />
                <YAxis
                  stroke="var(--color-text-muted)"
                  fontSize={12}
                  tickFormatter={(val) => `₹${(val / 100000).toFixed(0)}L`}
                />
                <Tooltip
                  cursor={{ fill: "rgba(99, 102, 241, 0.05)" }}
                  contentStyle={{
                    backgroundColor: "var(--color-bg-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    color: "var(--color-text-primary)",
                  }}
                  formatter={(value: number | undefined) => [
                    `₹${((value ?? 0) / 100).toLocaleString("en-IN")}`,
                    "Spent",
                  ]}
                />
                <Bar dataKey="amount" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Referrals & CTA */}
      <div className="grid-3">
        {/* Referral Stats */}
        <div className="card">
          <h3
            style={{ fontSize: "16px", fontWeight: 700, marginBottom: "20px" }}
          >
            Referral Program
          </h3>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "14px" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  color: "var(--color-text-secondary)",
                  fontSize: "14px",
                }}
              >
                Tier
              </span>
              <span className="badge badge-success">
                {data.referralStats?.tier?.label || "Novice"}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  color: "var(--color-text-secondary)",
                  fontSize: "14px",
                }}
              >
                Active Referrals
              </span>
              <span style={{ fontWeight: 700 }}>
                {data.referralStats?.activeReferrals || 0}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  color: "var(--color-text-secondary)",
                  fontSize: "14px",
                }}
              >
                Total Earnings
              </span>
              <span
                style={{
                  fontWeight: 700,
                  color: "var(--color-accent-emerald)",
                }}
              >
                Rs {((data.referralStats?.earnings || 0) / 100).toLocaleString()}
              </span>
            </div>

            <div className="divider" style={{ margin: "8px 0" }} />

            <div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--color-text-muted)",
                  marginBottom: "8px",
                  textTransform: "uppercase",
                  letterSpacing: 0,
                }}
              >
                Share your code
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <code
                  style={{
                    flex: 1,
                    padding: "10px 14px",
                    background: "var(--color-bg-tertiary)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "14px",
                    fontFamily: "monospace",
                    textAlign: "center",
                    letterSpacing: 0,
                  }}
                >
                  {data.referralStats?.referralCode || "Loading..."}
                </code>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      data.referralStats?.referralCode || "",
                    );
                    showToast("success", "Referral code copied!");
                  }}
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Card */}
        <div
          className="card col-span-2"
          style={{
            background:
              "linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.1))",
            border: "1px solid rgba(99, 102, 241, 0.2)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <h3
            style={{ fontSize: "20px", fontWeight: 800, marginBottom: "8px" }}
          >
            Invite Brands & Influencers
          </h3>
          <p
            style={{
              color: "var(--color-text-secondary)",
              marginBottom: "20px",
              fontSize: "14px",
              lineHeight: 1.7,
            }}
          >
            Level up your tier to unlock up to 2% lifetime GMV revenue share and
            exclusive platform fee discounts for every deal completed by your
            referrals!
          </p>
          <div>
            <Link href="/dashboard/referrals" className="btn btn-primary">
              View Details
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Campaigns Table */}
      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <h3 style={{ fontSize: "16px", fontWeight: 700 }}>
            Recent Campaigns
          </h3>
          <Link
            href="/dashboard/campaigns"
            style={{
              fontSize: "13px",
              color: "var(--color-primary-light)",
              fontWeight: 500,
            }}
          >
            View All
          </Link>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              textAlign: "left",
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                <th
                  style={{
                    padding: "10px 12px",
                    fontSize: "12px",
                    color: "var(--color-text-muted)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 0,
                  }}
                >
                  Campaign
                </th>
                <th
                  style={{
                    padding: "10px 12px",
                    fontSize: "12px",
                    color: "var(--color-text-muted)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 0,
                  }}
                >
                  Status
                </th>
                <th
                  style={{
                    padding: "10px 12px",
                    fontSize: "12px",
                    color: "var(--color-text-muted)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 0,
                  }}
                >
                  Budget
                </th>
                <th
                  style={{
                    padding: "10px 12px",
                    fontSize: "12px",
                    color: "var(--color-text-muted)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 0,
                  }}
                >
                  Deals
                </th>
              </tr>
            </thead>
            <tbody>
              {recentCampaigns.map((c) => (
                <tr
                  key={c.id}
                  style={{
                    borderBottom: "1px solid var(--color-border)",
                    transition: "background var(--transition-fast)",
                  }}
                >
                  <td
                    style={{
                      padding: "14px 12px",
                      fontSize: "14px",
                      fontWeight: 600,
                    }}
                  >
                    {c.title}
                  </td>
                  <td style={{ padding: "14px 12px" }}>
                    <span className={`badge ${getStatusBadge(c.status)}`}>
                      {c.status}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "14px 12px",
                      fontSize: "14px",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    Rs {(c.budget / 100).toLocaleString()}
                  </td>
                  <td
                    style={{
                      padding: "14px 12px",
                      fontSize: "14px",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {c.dealsCount}
                  </td>
                </tr>
              ))}
              {recentCampaigns.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      padding: "32px",
                      textAlign: "center",
                      color: "var(--color-text-muted)",
                      fontSize: "14px",
                    }}
                  >
                    No recent campaigns
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  readonly icon: "spend" | "campaigns" | "deals" | "trust";
  readonly label: string;
  readonly value: string | number;
  readonly subvalue?: string;
  readonly accentColor: string;
}

const BRAND_STAT_ICONS: Record<StatCardProps["icon"], React.ReactNode> = {
  spend: (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" y1="10" x2="22" y2="10" />
    </svg>
  ),
  campaigns: (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6h16" />
      <path d="M4 12h10" />
      <path d="M4 18h7" />
      <path d="m17 14 3 3-3 3" />
    </svg>
  ),
  deals: (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 11 4 15a3 3 0 0 0 4 4l2-2" />
      <path d="m14 7 2-2a3 3 0 0 1 4 4l-4 4" />
      <path d="m8 16 8-8" />
    </svg>
  ),
  trust: (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 3 7v6c0 5 4 8 9 8s9-3 9-8V7l-9-4Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
};

function StatCard({
  icon,
  label,
  value,
  subvalue,
  accentColor,
}: StatCardProps) {
  return (
    <div className="card hover-lift">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "14px",
          color: accentColor,
        }}
      >
        {BRAND_STAT_ICONS[icon]}
        <span
          style={{
            color: "var(--color-text-secondary)",
            fontSize: "13px",
            fontWeight: 500,
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: "28px",
          fontWeight: 800,
          color: accentColor,
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      {subvalue && (
        <div
          style={{
            fontSize: "12px",
            color: "var(--color-text-muted)",
            marginTop: "6px",
          }}
        >
          {subvalue}
        </div>
      )}
    </div>
  );
}

function getStatusBadge(status: string) {
  switch (status) {
    case "ACTIVE":
      return "badge-primary";
    case "COMPLETED":
      return "badge-success";
    case "PAUSED":
      return "badge-warning";
    case "DRAFT":
      return "";
    default:
      return "";
  }
}
