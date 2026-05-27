"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import Link from "next/link";

interface BrandDashboardProps {
  data: any;
}

export default function BrandDashboard({ data }: BrandDashboardProps) {
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

  const { overview, spendHistory, recentCampaigns = [] } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Stats Grid */}
      <div className="grid-4 stagger-children">
        <StatCard
          icon="SP"
          label="Total Spent"
          value={`Rs ${(overview.totalSpent / 100).toLocaleString()}`}
          gradient="linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(99, 102, 241, 0.04))"
          accentColor="var(--color-primary-light)"
        />
        <StatCard
          icon="CP"
          label="Active Campaigns"
          value={overview.activeCampaigns}
          subvalue={`${overview.totalCampaigns} total`}
          gradient="linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(139, 92, 246, 0.04))"
          accentColor="#a78bfa"
        />
        <StatCard
          icon="DL"
          label="Active Deals"
          value={overview.activeDeals}
          subvalue="In progress"
          gradient="linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(16, 185, 129, 0.04))"
          accentColor="var(--color-accent-emerald)"
        />
        <StatCard
          icon="DR"
          label="Reputation (DRS)"
          value={overview.trustScore ? `${overview.trustScore}/100` : "N/A"}
          gradient={`linear-gradient(135deg, ${overview.trustScore > 70 ? "rgba(16, 185, 129, 0.12)" : "rgba(107, 107, 128, 0.12)"}, transparent)`}
          accentColor={
            overview.trustScore > 70
              ? "var(--color-accent-emerald)"
              : "var(--color-text-muted)"
          }
        />
      </div>

      {/* Spend Chart */}
      <div className="card">
        <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "20px" }}>
          Monthly Spend (Last 12 Months)
        </h3>
        <div style={{ height: "280px", width: "100%", minWidth: 0, overflowX: "auto" }}>
          {chartsReady && (
              <BarChart width={820} height={280} data={spendHistory}>
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
                cursor={{ fill: "rgba(99, 102, 241, 0.05)" }}
                contentStyle={{
                  backgroundColor: "var(--color-bg-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  color: "var(--color-text-primary)",
                }}
                formatter={(value: any) => [
                  `Rs ${(value / 100).toLocaleString()}`,
                  "Spent",
                ]}
              />
                <Bar dataKey="amount" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
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
                    alert("Copied!");
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
              {recentCampaigns.map((c: any) => (
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
