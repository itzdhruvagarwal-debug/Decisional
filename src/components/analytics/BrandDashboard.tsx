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
import { ToastContainer, useToasts } from "@/components/ui/toast";
import EmptyState from "@/components/ui/EmptyState";
import { Button } from "@/components/ui";

export interface BrandAnalyticsData {
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



export default function BrandDashboard({ data }: BrandDashboardProps) {
  const [chartsReady, setChartsReady] = useState(false);
  const { toasts, showToast, removeToast } = useToasts();

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
      <div className="dashboard-error-state">
        Failed to load data
      </div>
    );

  const { overview, spendHistory, recentCampaigns = [] } = data;

  return (
    <div className="dashboard-home-stack">
      <ToastContainer toasts={toasts} onClose={removeToast} />
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
        <h3 className="section-title">
          Monthly Spend (Last 12 Months)
        </h3>
        <div className="chart-wrapper">
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
          <h3 className="section-title">
            Referral Program
          </h3>
          <div className="referral-stat-row">
            <div className="referral-stat">
              <span className="referral-stat-label">Tier</span>
              <span className="badge badge-success">
                {data.referralStats?.tier?.label || "Novice"}
              </span>
            </div>
            <div className="referral-stat">
              <span className="referral-stat-label">Active Referrals</span>
              <span className="referral-stat-value">
                {data.referralStats?.activeReferrals || 0}
              </span>
            </div>
            <div className="referral-stat">
              <span className="referral-stat-label">Total Earnings</span>
              <span className="referral-stat-value text-emerald">
                Rs {((data.referralStats?.earnings || 0) / 100).toLocaleString()}
              </span>
            </div>

            <div className="divider" style={{ margin: "8px 0" }} />

            <div>
              <div
                className="text-muted mb-2 text-xs uppercase" style={{ letterSpacing: 0 }}
              >
                Share your code
              </div>
              <div className="flex gap-2">
                <code
                  className="flex-1 text-sm text-center bg-tertiary rounded-sm" style={{ padding: "10px 14px", fontFamily: "monospace", letterSpacing: 0 }}
                >
                  {data.referralStats?.referralCode || "Loading..."}
                </code>
                <Button
                  variant="primary"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      data.referralStats?.referralCode || "",
                    );
                    showToast("success", "Referral code copied!");
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Card */}
        <div
          className="card col-span-2 flex flex-col justify-center" style={{ background:
              "linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.1))", border: "1px solid rgba(99, 102, 241, 0.2)" }}
        >
          <h3
            className="text-xl font-extrabold mb-2"
          >
            Invite Brands & Influencers
          </h3>
          <p
            className="text-secondary mb-5 text-sm" style={{ lineHeight: 1.7 }}
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
        <div className="section-header-row">
          <h3 className="text-base font-bold">
            Recent Campaigns
          </h3>
          <Link
            href="/dashboard/campaigns"
            className="text-sm font-medium text-primary-light"
          >
            View All
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table
            className="w-full text-left" style={{ borderCollapse: "collapse" }}
          >
            <thead>
              <tr className="border-b-card">
                <th
                  className="text-xs text-muted font-semibold uppercase" style={{ padding: "10px 12px", letterSpacing: 0 }}
                >
                  Campaign
                </th>
                <th
                  className="text-xs text-muted font-semibold uppercase" style={{ padding: "10px 12px", letterSpacing: 0 }}
                >
                  Status
                </th>
                <th
                  className="text-xs text-muted font-semibold uppercase" style={{ padding: "10px 12px", letterSpacing: 0 }}
                >
                  Budget
                </th>
                <th
                  className="text-xs text-muted font-semibold uppercase" style={{ padding: "10px 12px", letterSpacing: 0 }}
                >
                  Deals
                </th>
              </tr>
            </thead>
            <tbody>
              {recentCampaigns.map((c) => (
                <tr
                  key={c.id}
                  className="border-b-card" style={{ transition: "background var(--transition-fast)" }}
                >
                  <td
                    className="text-sm font-semibold" style={{ padding: "14px 12px" }}
                  >
                    {c.title}
                  </td>
                  <td style={{ padding: "14px 12px" }}>
                    <span className={`badge ${getStatusBadge(c.status)}`}>
                      {c.status}
                    </span>
                  </td>
                  <td
                    className="text-sm text-secondary" style={{ padding: "14px 12px" }}
                  >
                    Rs {(c.budget / 100).toLocaleString()}
                  </td>
                  <td
                    className="text-sm text-secondary" style={{ padding: "14px 12px" }}
                  >
                    {c.dealsCount}
                  </td>
                </tr>
              ))}
              {recentCampaigns.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <EmptyState
                      emoji="📣"
                      title="No Recent Campaigns"
                      description="Your most recent campaigns will appear here."
                      compact
                    />
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
        className="flex items-center" style={{ gap: "10px", marginBottom: "14px", color: accentColor }}
      >
        {BRAND_STAT_ICONS[icon]}
        <span
          className="text-secondary text-sm font-medium"
        >
          {label}
        </span>
      </div>
      <div
        className="font-extrabold text-3xl" style={{ color: accentColor, lineHeight: 1.2 }}
      >
        {value}
      </div>
      {subvalue && (
        <div
          className="text-xs text-muted" style={{ marginTop: "6px" }}
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
