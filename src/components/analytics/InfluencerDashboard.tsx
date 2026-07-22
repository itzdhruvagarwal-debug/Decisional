"use client";

import { useEffect, useState } from "react";
import { calculateLevel, getPlatformFeePercentage } from "@/lib/drs-score";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { ToastContainer, useToasts } from "@/components/ui/toast";
import EmptyState from "@/components/ui/EmptyState";
import { Button } from "@/components/ui";

export interface InfluencerAnalyticsData {
  overview: {
    totalEarnings: number;
    completedDeals: number;
    activeDeals: number;
    averageRating: number;
    trustScore: number;
    level: number;
    xp: number;
    successRate: number;
    memberSince: Date;
  };
  earningsHistory: Array<{ date?: Date; month: string; amount: number }>;
  performance: {
    deliveryRate: number;
    engagementRate: number;
    successRate: number;
  };
  topContent: Array<{
    id: string;
    campaignTitle: string;
    amount: number;
    completedAt: Date | null;
    postUrl: string | null;
  }>;
  categoryBreakdown: Array<{
    category: string;
    count: number;
    percentage: number;
  }>;
  recentActivity: Array<{
    action: string;
    createdAt: Date;
    metadata: unknown;
  }>;
  gamification: {
    recentBadges: Array<{
      id: string;
      name: string;
      description: string;
      icon: string;
      earnedAt: Date;
      xpReward?: number;
    }>;
    referralStats: {
      totalReferrals: number;
      activeReferrals: number;
      totalEarnings: number;
      tier?: { label: string };
      earnings?: number;
      referralCode?: string;
    };
  };
  error?: string;
}

interface InfluencerDashboardProps {
  readonly data: InfluencerAnalyticsData;
  readonly userName?: string | null | undefined;
}



export default function InfluencerDashboard({
  data,
  userName,
}: InfluencerDashboardProps) {
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

  const {
    overview,
    earningsHistory = [],
    performance,
    recentActivity = [],
  } = data;

  let trustScoreColor = "var(--color-accent-rose)";
  if (overview.trustScore >= 850) {
    trustScoreColor = "var(--color-accent-emerald)";
  } else if (overview.trustScore >= 750) {
    trustScoreColor = "var(--color-primary-light)";
  } else if (overview.trustScore >= 600) {
    trustScoreColor = "var(--color-accent-amber)";
  }

  if (!overview || !performance) {
    return (
      <div className="dashboard-error-state">
        Incomplete data received
      </div>
    );
  }

  return (
    <div className="dashboard-home-stack">
      <ToastContainer toasts={toasts} onClose={removeToast} />
      <section className="dashboard-welcome-card">
        <div>
          <p className="dashboard-welcome-kicker">Creator workspace</p>
          <h2>Welcome back{userName ? `, ${userName.split(" ")[0]}` : ""}!</h2>
          <p>Track active deals, content tasks, badges, referrals, and payouts.</p>
        </div>
        <div className="dashboard-welcome-score" aria-label={`Trust score ${overview.trustScore}`}>
          <span>Trust Score</span>
          <strong
            style={{
              color: trustScoreColor,
            }}
          >
            {overview.trustScore}
          </strong>
          <small>{getTierLabel(overview.trustScore)}</small>
        </div>
      </section>

      <section className="dashboard-overview-panel">
        <div className="dashboard-section-row">
          <h3>Overview</h3>
          <span>Level {overview.level}</span>
        </div>
        <div className="grid-4 stagger-children dashboard-overview-grid">
          <StatCard
            icon="earnings"
            label="Earnings"
            value={`₹${(overview.totalEarnings / 100).toLocaleString("en-IN")}`}
            subvalue="Lifetime"
            accentColor="var(--color-accent-emerald)"
          />
          <StatCard
            icon="deals"
            label="Completed"
            value={overview.completedDeals}
            subvalue={`${overview.activeDeals} active`}
            accentColor="var(--color-accent-cyan)"
          />
          <StatCard
            icon="trust"
            label="Trust Score"
            value={`${overview.trustScore}/900`}
            subvalue={getTierLabel(overview.trustScore)}
            accentColor="var(--color-primary-light)"
          />
          <StatCard
            icon="delivery"
            label="On-time"
            value={`${performance.deliveryRate}%`}
            subvalue="Delivery Rate"
            accentColor="var(--color-accent-amber)"
          />
        </div>
      </section>

      <section className="level-perks-section">
        <div className="level-perks-card">
          <div className="level-perks-body">
            <div className="level-perks-text">
              <div className="level-perks-title-row">
                <h3 className="level-perks-title">
                  ✨ Level {overview.level} Perks & Benefits
                </h3>
                <span className="badge badge-primary text-xs font-bold" style={{ padding: "4px 10px", textTransform: "uppercase" }}>
                  {calculateLevel(overview.xp).name}
                </span>
              </div>
              <p className="level-perks-desc">
                Your Creator Level is determined by your total XP. Complete campaigns, refer other creators, and maintain a high trust score to level up and unlock better platform terms and enhanced search ranking.
              </p>
            </div>
            <div className="level-perks-stats">
              <div className="stat-chip">
                <div className="stat-chip-label">Platform Fee</div>
                <div className="stat-chip-value-lg" style={{ color: "var(--color-accent-emerald)" }}>
                  {getPlatformFeePercentage(overview.level)}%
                </div>
                <div className="stat-chip-sub">
                  Level-reduced rate
                </div>
              </div>
              <div className="stat-chip">
                <div className="stat-chip-label">Search Boost</div>
                <div className="stat-chip-value-lg" style={{ color: "var(--color-accent-amber)" }}>
                  +{Math.min(overview.level * 2, 20)} pts
                </div>
                <div className="stat-chip-sub">
                  Discovery ranking weight
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Charts Section */}
      <div className="grid-2">
        <div className="card">
          <h3 className="section-title">
            Earnings History (12 Months)
          </h3>
          <div className="chart-wrapper">
            {chartsReady && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={earningsHistory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
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
                    tickFormatter={(val) => `Rs ${val / 1000}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--color-bg-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                      color: "var(--color-text-primary)",
                    }}
                    formatter={(value: number | undefined) => [
                      `₹${((value ?? 0) / 100).toLocaleString("en-IN")}`,
                      "Earnings",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#10b981"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorIncome)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card">
          <h3 className="section-title">
            Performance Metrics
          </h3>
          <div className="metric-list">
            <MetricBar
              label="Reputation (DRS)"
              value={overview.trustScore}
              max={900}
              color="var(--color-accent-emerald)"
              displayValue={`${overview.trustScore}/900`}
            />
            <MetricBar
              label="Detailed Rating"
              value={overview.averageRating * 20}
              max={100}
              color="var(--color-primary-light)"
              displayValue={overview.averageRating.toFixed(1)}
            />
            <MetricBar
              label="On-Time Delivery"
              value={performance.deliveryRate}
              max={100}
              color="#a78bfa"
            />
            <MetricBar
              label="Engagement Rate"
              value={Math.min(performance.engagementRate * 10, 100)}
              max={100}
              color="var(--color-secondary)"
              displayValue={`${performance.engagementRate}%`}
            />
          </div>
        </div>
      </div>

      {/* Gamification & Referrals */}
      <div className="grid-2">
        {/* Recent Badges */}
        <div className="card">
          <div className="section-header-row">
            <h3 className="text-base font-bold">
              Recent Achievements
            </h3>
            <span className="badge badge-primary">
              {data.gamification?.recentBadges?.length || 0} Badges
            </span>
          </div>
          <div className="badge-list">
            {data.gamification?.recentBadges?.map((badge: { id: string; name: string; description: string; icon: string; earnedAt: Date; xpReward?: number }) => (
              <div key={badge.id} className="badge-item">
                <span className="badge-item-icon">{badge.icon}</span>
                <div className="flex-1">
                  <div className="badge-item-name">
                    {badge.name}
                  </div>
                  <div className="badge-item-desc">
                    {badge.description}
                  </div>
                </div>
                <span
                  className="badge badge-success"
                  style={{ fontSize: "11px" }}
                >
                  +{badge.xpReward} XP
                </span>
              </div>
            ))}
            {(!data.gamification?.recentBadges ||
              data.gamification.recentBadges.length === 0) && (
              <EmptyState
                emoji="🏅"
                title="No Badges Yet"
                description="Complete challenges to earn your first badge!"
                compact
              />
            )}
          </div>
        </div>

        {/* Referral Stats */}
        <div className="card">
          <div className="section-header-row">
            <h3 className="text-base font-bold">
              Referral Rewards
            </h3>
            <span className="badge badge-primary">
              {data.gamification?.referralStats?.tier?.label || "Novice"} Tier
            </span>
          </div>

          <div className="grid-2 gap-3 mb-5">
            <div
              className="p-4" style={{ borderRadius: "var(--radius-md)", background: "var(--color-bg-tertiary)" }}
            >
              <div
                className="text-xs text-muted" style={{ marginBottom: "6px" }}
              >
                Active Referrals
              </div>
              <div className="text-2xl font-extrabold">
                {data.gamification?.referralStats?.activeReferrals || 0}
              </div>
            </div>
            <div
              className="p-4" style={{ borderRadius: "var(--radius-md)", background: "var(--color-bg-tertiary)" }}
            >
              <div
                className="text-xs text-muted" style={{ marginBottom: "6px" }}
              >
                Total Earnings
              </div>
              <div
                className="text-2xl font-extrabold" style={{ color: "var(--color-accent-emerald)" }}
              >
                Rs{" "}
                {(
                  (data.gamification?.referralStats?.earnings || 0) / 100
                ).toLocaleString()}
              </div>
            </div>
          </div>

          <div
            className="p-4 flex items-center justify-between" style={{ background:
                "linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.1))", borderRadius: "var(--radius-md)", border: "1px solid rgba(99, 102, 241, 0.2)" }}
          >
            <div>
              <div
                className="text-muted mb-1" style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: 0 }}
              >
                Your Referral Code
              </div>
              <code
                className="text-lg font-extrabold" style={{ fontFamily: "monospace", letterSpacing: 0 }}
              >
                {data.gamification?.referralStats?.referralCode || "..."}
              </code>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText(
                  data.gamification?.referralStats?.referralCode || "",
                );
                showToast("success", "Referral code copied!");
              }}
            >
              Copy
            </Button>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <h3 className="section-title">
          Recent Activity
        </h3>
        <div className="badge-list">
          {recentActivity.map((log: { action: string; createdAt: Date }) => (
            <div
              key={`${log.action}-${new Date(log.createdAt).getTime()}`}
              className="badge-item justify-between"
            >
              <div>
                <div className="text-sm font-medium">
                  {formatAction(log.action)}
                </div>
                <div
                  className="text-xs text-muted"
                >
                  {new Date(log.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
          {recentActivity.length === 0 && (
            <EmptyState
              emoji="📊"
              title="No Recent Activity"
              description="Your recent activity will appear here."
              compact
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  readonly icon: "earnings" | "deals" | "trust" | "delivery";
  readonly label: string;
  readonly value: string | number;
  readonly subvalue?: string;
  readonly accentColor: string;
}

const STAT_ICONS: Record<StatCardProps["icon"], React.ReactNode> = {
  earnings: (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
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
  delivery: (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
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
        {STAT_ICONS[icon]}
        <span
          className="text-secondary text-sm font-medium"
        >
          {label}
        </span>
      </div>
      <div
        className="font-extrabold" style={{ fontSize: "28px", color: accentColor, lineHeight: 1.2 }}
      >
        {value}
      </div>
      <div
        className="text-xs text-muted" style={{ marginTop: "6px" }}
      >
        {subvalue}
      </div>
    </div>
  );
}

interface MetricBarProps {
  readonly label: string;
  readonly value: number;
  readonly max: number;
  readonly color: string;
  readonly displayValue?: string;
}

function MetricBar({ label, value, max, color, displayValue }: MetricBarProps) {
  return (
    <div>
      <div
        className="flex justify-between" style={{ marginBottom: "6px" }}
      >
        <span
          className="text-sm text-secondary"
        >
          {label}
        </span>
        <span className="text-sm font-semibold">
          {displayValue || `${value}%`}
        </span>
      </div>
      <div className="trust-meter">
        <div
          className="trust-meter-fill"
          style={{
            width: `${(value / max) * 100}%`,
            background: color,
          }}
        />
      </div>
    </div>
  );
}

function formatAction(action: string) {
  return action
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}
