"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { useSession } from "next-auth/react";

interface Dispute {
  id: string;
  type: string;
  status: string;
  description: string;
  createdAt: string;
  deal: {
    id: string;
    amount: number;
    campaign: { title: string };
    influencer: { displayName: string };
    brand: { companyName: string };
  };
}

export default function DisputesPage() {
  const { data: session } = useSession();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/disputes")
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (data.disputes) setDisputes(data.disputes);
      })
      .catch((err) => {
        if (!active) return;
        if (err?.name !== "AbortError") {
          console.error("[disputes-page] Failed to fetch disputes:", err);
        }
      })
      .finally(() => setIsLoading(false));
    return () => { active = false; };
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "OPEN": return "var(--color-primary)";
      case "TIER1_AUTO": return "var(--color-accent-cyan)";
      case "TIER2_MEDIATION": return "var(--color-warning)";
      case "RESOLVED": return "var(--color-success)";
      case "CLOSED": return "var(--color-text-muted)";
      default: return "var(--color-text-secondary)";
    }
  };

  const getStatusLabel = (status: string) => status.replaceAll("_", " ");

  return (
    <DashboardShell user={session?.user}>
      <div className="animate-fade-in">
        {/* Page Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "28px",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <h1 style={{ fontSize: "26px", fontWeight: 800 }}>
              ⚖️ Disputes & Resolution
            </h1>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "14px", marginTop: "4px" }}>
              Manage and track your dispute cases
            </p>
          </div>
          <Link href="/dashboard/deals" className="btn btn-secondary">
            ← Back to Deals
          </Link>
        </div>

        {/* Content */}
        {(() => {
          if (isLoading) {
            return (
              <div style={{ textAlign: "center", padding: "60px" }}>
                <span className="loading" style={{ width: "36px", height: "36px" }} />
              </div>
            );
          }
          if (disputes.length === 0) {
            return (
              <div className="card" style={{ textAlign: "center", padding: "60px 20px" }}>
                <div style={{ fontSize: "48px", marginBottom: "16px" }}>✅</div>
                <h3 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px" }}>
                  No Disputes Found
                </h3>
                <p style={{ color: "var(--color-text-secondary)", marginBottom: "24px" }}>
                  You have no open disputes at the moment.
                </p>
                <Link href="/dashboard/deals" className="btn btn-primary">
                  Go to Deals
                </Link>
              </div>
            );
          }
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {disputes.map((dispute) => (
              <Link
                key={dispute.id}
                href={`/dashboard/disputes/${dispute.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="card hover-lift" style={{ cursor: "pointer" }}>
                  {/* Top Row: Status + meta */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: "12px",
                      flexWrap: "wrap",
                      gap: "8px",
                    }}
                  >
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                      <span
                        className="badge"
                        style={{
                          background: getStatusColor(dispute.status),
                          color: "white",
                          fontSize: "11px",
                        }}
                      >
                        {getStatusLabel(dispute.status)}
                      </span>
                      <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                        #{dispute.id.slice(-6)}
                      </span>
                      <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                        {new Date(dispute.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "var(--color-accent-amber)",
                        background: "rgba(245,158,11,0.1)",
                        padding: "4px 10px",
                        borderRadius: "8px",
                      }}
                    >
                      {dispute.type} Issue
                    </span>
                  </div>

                  {/* Campaign Title */}
                  <h3 style={{ fontSize: "17px", fontWeight: 700, marginBottom: "6px" }}>
                    {dispute.deal.campaign.title}
                  </h3>

                  {/* Deal Info */}
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "12px",
                      marginBottom: "14px",
                      fontSize: "13px",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    <span>💳 ₹{(dispute.deal.amount / 100).toLocaleString("en-IN")}</span>
                    <span>🎬 {dispute.deal.influencer?.displayName}</span>
                    <span>🏢 {dispute.deal.brand?.companyName}</span>
                  </div>

                  {/* Description Excerpt */}
                  <div
                    style={{
                      padding: "12px 14px",
                      background: "var(--color-bg-tertiary)",
                      borderRadius: "var(--radius-md)",
                      fontSize: "13px",
                      color: "var(--color-text-secondary)",
                      lineHeight: 1.6,
                      borderLeft: `3px solid ${getStatusColor(dispute.status)}`,
                    }}
                  >
                    "{dispute.description.length > 120
                      ? dispute.description.slice(0, 120) + "..."
                      : dispute.description}"
                  </div>

                  {/* View Details CTA */}
                  <div style={{ marginTop: "14px", display: "flex", justifyContent: "flex-end" }}>
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "var(--color-primary)",
                      }}
                    >
                      View Full Details →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        );
      })()}
      </div>
    </DashboardShell>
  );
}
