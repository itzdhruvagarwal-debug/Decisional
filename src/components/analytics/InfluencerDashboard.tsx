"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

interface InfluencerDashboardProps {
  data: any;
}

export default function InfluencerDashboard({
  data,
}: InfluencerDashboardProps) {
  const [chartsReady, setChartsReady] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setChartsReady(true), 50);
    return () => window.clearTimeout(id);
  }, []);

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
      <section className="dashboard-welcome-card">
        <div>
          <p className="dashboard-welcome-kicker">Creator workspace</p>
          <h2>Hello, collaborator</h2>
          <p>Track active deals, content tasks, badges, referrals, and payouts.</p>
        </div>
        <div className="dashboard-welcome-score" aria-label={`Trust score ${Math.min(overview.trustScore, 100)}`}>
          <span>Trust</span>
          <strong>{Math.min(overview.trustScore, 100)}</strong>
          <small>Trusted</small>
        </div>
      </section>

      <section className="dashboard-overview-panel">
        <div className="dashboard-section-row">
          <h3>Overview</h3>
          <span>Level {overview.level}</span>
        </div>
        <div className="grid-4 stagger-children dashboard-overview-grid">
          <StatCard
            icon="ER"
            label="Earnings"
            value={`Rs ${(overview.totalEarnings / 100).toLocaleString()}`}
            subvalue="Lifetime"
            gradient="transparent"
            accentColor="#ffffff"
          />
          <StatCard
            icon="DL"
            label="Completed"
            value={overview.completedDeals}
            subvalue={`${overview.activeDeals} active`}
            gradient="transparent"
            accentColor="#ffffff"
          />
          <StatCard
            icon="DR"
            label="Trust Score"
            value={Math.min(overview.trustScore, 100)}
            subvalue={`Level ${overview.level}`}
            gradient="transparent"
            accentColor="#ffffff"
          />
          <StatCard
            icon="OT"
            label="On-time"
            value={`${performance.deliveryRate}%`}
            subvalue="Delivery"
            gradient="transparent"
            accentColor="#ffffff"
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
          <div style={{ height: "280px", width: "100%", minWidth: 0, overflowX: "auto" }}>
            {chartsReady && (
                <AreaChart width={820} height={280} data={earningsHistory}>
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
                  formatter={(value: any) => [
                    `Rs ${(value / 100).toLocaleString()}`,
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
              value={Math.min(overview.trustScore, 100)}
              max={100}
              color="var(--color-accent-emerald)"
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
            {data.gamification?.recentBadges?.map((badge: any, i: number) => (
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
                alert("Copied!");
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
          {recentActivity.map((log: any, i: number) => (
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

function StatCard({
  icon,
  label,
  value,
  subvalue,
  gradient,
  accentColor,
}: any) {
  return (
    <div
      className="card hover-lift"
      style={{
        background: gradient,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "14px",
        }}
      >
        <span style={{ fontSize: "20px" }}>{icon}</span>
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

function MetricBar({ label, value, max, color, displayValue }: any) {
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
