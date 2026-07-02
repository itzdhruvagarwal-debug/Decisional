"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface InfluencerAnalyticsData {
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
  data: InfluencerAnalyticsData;
  userName?: string | null | undefined;
}

export default function InfluencerDashboard({
  data,
  userName,
}: InfluencerDashboardProps) {
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

  const {
    overview,
    earningsHistory = [],
    performance,
    recentActivity = [],
  } = data;

  if (!overview || !performance) {
    return (
      <div
        style={{
          padding: "48px",
          textAlign: "center",
          color: "var(--color-accent-rose)",
        }}
      >
        Incomplete data received
      </div>
    );
  }

  return (
    <div className="dashboard-home-stack">
      {toasts.length > 0 && (
        <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: "8px", maxWidth: "400px" }}>
          {toasts.map((t) => (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  removeToast(t.id);
                }
              }}
              style={{
                padding: "12px 20px",
                borderRadius: "10px",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 500,
                background: t.type === "success" ? "linear-gradient(135deg, #059669, #10b981)" : t.type === "error" ? "linear-gradient(135deg, #dc2626, #ef4444)" : "linear-gradient(135deg, #2563eb, #3b82f6)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.1)",
                animation: "slideInRight 0.3s ease-out",
                cursor: "pointer",
              }}
              onClick={() => removeToast(t.id)}
            >
              {t.type === "success" ? "✓ " : t.type === "error" ? "✕ " : "ℹ "}{t.message}
            </div>
          ))}
        </div>
      )}
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
              color:
                overview.trustScore >= 850
                  ? "var(--color-accent-emerald)"
                  : overview.trustScore >= 750
                  ? "var(--color-primary-light)"
                  : overview.trustScore >= 600
                  ? "var(--color-accent-amber)"
                  : "var(--color-accent-rose)",
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

      {/* Charts Section */}
      <div className="grid-2">
        <div className="card">
          <h3
            style={{ fontSize: "16px", fontWeight: 700, marginBottom: "20px" }}
          >
            Earnings History (12 Months)
          </h3>
          <div style={{ height: "280px", width: "100%" }}>
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
                      `₹${value !== undefined ? (value / 100).toLocaleString("en-IN") : "0"}`,
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
          <h3
            style={{ fontSize: "16px", fontWeight: 700, marginBottom: "20px" }}
          >
            Performance Metrics
          </h3>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "18px" }}
          >
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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px",
            }}
          >
            <h3 style={{ fontSize: "16px", fontWeight: 700 }}>
              Recent Achievements
            </h3>
            <span className="badge badge-primary">
              {data.gamification?.recentBadges?.length || 0} Badges
            </span>
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            {data.gamification?.recentBadges?.map((badge: { id: string; name: string; description: string; icon: string; earnedAt: Date; xpReward?: number }, i: number) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  padding: "12px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--color-bg-tertiary)",
                  transition: "all var(--transition-fast)",
                }}
              >
                <span style={{ fontSize: "28px" }}>{badge.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "14px" }}>
                    {badge.name}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--color-text-muted)",
                    }}
                  >
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
              <div
                style={{
                  textAlign: "center",
                  color: "var(--color-text-muted)",
                  padding: "24px",
                  fontSize: "14px",
                }}
              >
                No badges earned yet. Keep verifying deals!
              </div>
            )}
          </div>
        </div>

        {/* Referral Stats */}
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
              Referral Rewards
            </h3>
            <span className="badge badge-primary">
              {data.gamification?.referralStats?.tier?.label || "Novice"} Tier
            </span>
          </div>

          <div className="grid-2" style={{ gap: "12px", marginBottom: "20px" }}>
            <div
              style={{
                padding: "16px",
                borderRadius: "var(--radius-md)",
                background: "var(--color-bg-tertiary)",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--color-text-muted)",
                  marginBottom: "6px",
                }}
              >
                Active Referrals
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800 }}>
                {data.gamification?.referralStats?.activeReferrals || 0}
              </div>
            </div>
            <div
              style={{
                padding: "16px",
                borderRadius: "var(--radius-md)",
                background: "var(--color-bg-tertiary)",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--color-text-muted)",
                  marginBottom: "6px",
                }}
              >
                Total Earnings
              </div>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 800,
                  color: "var(--color-accent-emerald)",
                }}
              >
                Rs{" "}
                {(
                  (data.gamification?.referralStats?.earnings || 0) / 100
                ).toLocaleString()}
              </div>
            </div>
          </div>

          <div
            style={{
              background:
                "linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.1))",
              borderRadius: "var(--radius-md)",
              padding: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              border: "1px solid rgba(99, 102, 241, 0.2)",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--color-text-muted)",
                  marginBottom: "4px",
                  textTransform: "uppercase",
                  letterSpacing: 0,
                }}
              >
                Your Referral Code
              </div>
              <code
                style={{
                  fontSize: "18px",
                  fontWeight: 800,
                  fontFamily: "monospace",
                  letterSpacing: 0,
                }}
              >
                {data.gamification?.referralStats?.referralCode || "..."}
              </code>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  data.gamification?.referralStats?.referralCode || "",
                );
                showToast("success", "Referral code copied!");
              }}
              className="btn btn-secondary btn-sm"
            >
              Copy
            </button>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "20px" }}>
          Recent Activity
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {recentActivity.map((log: { action: string; createdAt: Date }, i: number) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px",
                borderRadius: "var(--radius-sm)",
                background: "var(--color-bg-tertiary)",
              }}
            >
              <div>
                <div style={{ fontSize: "14px", fontWeight: 500 }}>
                  {formatAction(log.action)}
                </div>
                <div
                  style={{ fontSize: "12px", color: "var(--color-text-muted)" }}
                >
                  {new Date(log.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
          {recentActivity.length === 0 && (
            <div
              style={{
                color: "var(--color-text-muted)",
                fontSize: "14px",
                textAlign: "center",
                padding: "24px",
              }}
            >
              No recent activity
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: "earnings" | "deals" | "trust" | "delivery";
  label: string;
  value: string | number;
  subvalue?: string;
  accentColor: string;
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
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "14px",
          color: accentColor,
        }}
      >
        {STAT_ICONS[icon]}
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
      <div
        style={{
          fontSize: "12px",
          color: "var(--color-text-muted)",
          marginTop: "6px",
        }}
      >
        {subvalue}
      </div>
    </div>
  );
}

interface MetricBarProps {
  label: string;
  value: number;
  max: number;
  color: string;
  displayValue?: string;
}

function MetricBar({ label, value, max, color, displayValue }: MetricBarProps) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "6px",
        }}
      >
        <span
          style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}
        >
          {label}
        </span>
        <span style={{ fontSize: "13px", fontWeight: 600 }}>
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
