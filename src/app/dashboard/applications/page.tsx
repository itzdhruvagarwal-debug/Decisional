"use client";


import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import Image from "next/image";
import { useSession } from "next-auth/react";
import Link from "next/link";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { formatCurrency } from "@/lib/utils-client";
import EmptyState from "@/components/ui/EmptyState";

interface Application {
  id: string;
  status: string;
  proposedRate: number;
  createdAt: string;
  campaign: {
    id: string;
    title: string;
    perInfluencerBudget: number;
    brand: {
      companyName: string;
      logo: string | null;
    } | null;
  };
}

interface ApplicationsResponse {
  success?: boolean;
  message?: string;
  data?: { applications?: Application[]; totalPages?: number };
  applications?: Application[];
  totalPages?: number;
}

function getStatusStyle(status: string) {
  switch (status.toUpperCase()) {
    case "SELECTED":
    case "ACCEPTED":
      return {
        background: "rgba(16, 185, 129, 0.12)",
        color: "var(--color-accent-emerald)",
        borderColor: "rgba(16, 185, 129, 0.25)",
      };
    case "REJECTED":
      return {
        background: "rgba(244, 63, 94, 0.12)",
        color: "var(--color-accent-rose)",
        borderColor: "rgba(244, 63, 94, 0.25)",
      };
    case "PENDING":
    default:
      return {
        background: "rgba(245, 158, 11, 0.12)",
        color: "var(--color-accent-amber)",
        borderColor: "rgba(245, 158, 11, 0.25)",
      };
  }
}

export default function ApplicationsPage() {
  const { data: session } = useSession();
  const page = 1;
  const limit = 10;

  const { data: payload, isLoading: loading, error: fetchErr } = useSWR<ApplicationsResponse>(
    session?.user ? `/api/applications?page=${page}&limit=${limit}` : null,
    fetcher
  );

  const applications = payload?.data?.applications || payload?.applications || [];
  const error = fetchErr ? "Failed to fetch applications" : (payload && !payload.success ? (payload.message || "Failed to load applications") : "");

  if (!session) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
        <span className="loading" />
      </div>
    );
  }

  let applicationsList;
  if (loading) {
    applicationsList = (
      <div style={{ display: "flex", justifyContent: "center", padding: "64px" }}>
        <span className="loading" style={{ width: "40px", height: "40px" }} />
      </div>
    );
  } else if (error) {
    applicationsList = (
      <div style={{ padding: "48px", textAlign: "center", color: "var(--color-accent-rose)" }}>
        ⚠️ {error}
      </div>
    );
  } else if (applications.length === 0) {
    applicationsList = (
      <EmptyState
        emoji="📋"
        title="No Applications Found"
        description="You haven't submitted any campaign applications yet."
        actionLabel="Discover Campaigns"
        actionHref="/dashboard/campaigns"
      />
    );
  } else {
    applicationsList = (
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-tertiary)" }}>
                <th style={{ padding: "16px", fontSize: "12px", fontWeight: 700, color: "var(--color-text-secondary)" }}>CAMPAIGN</th>
                <th style={{ padding: "16px", fontSize: "12px", fontWeight: 700, color: "var(--color-text-secondary)" }}>PROPOSED RATE</th>
                <th style={{ padding: "16px", fontSize: "12px", fontWeight: 700, color: "var(--color-text-secondary)" }}>SUBMITTED ON</th>
                <th style={{ padding: "16px", fontSize: "12px", fontWeight: 700, color: "var(--color-text-secondary)" }}>STATUS</th>
                <th style={{ padding: "16px", fontSize: "12px", fontWeight: 700, color: "var(--color-text-secondary)", textAlign: "right" }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => {
                const statusStyle = getStatusStyle(app.status);
                return (
                  <tr key={app.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "var(--radius-sm)",
                            background: "var(--gradient-card)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "12px",
                            fontWeight: 700,
                            color: "white",
                            flexShrink: 0,
                            overflow: "hidden",
                            position: "relative",
                          }}
                        >
                          {app.campaign.brand?.logo ? (
                            <Image
                              src={app.campaign.brand.logo}
                              alt=""
                              fill
                              unoptimized
                              style={{ objectFit: "cover" }}
                            />
                          ) : (
                            (app.campaign.brand?.companyName || "DC").slice(0, 2).toUpperCase()
                          )}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "14px" }}>
                            {app.campaign.title}
                          </div>
                          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                            by {app.campaign.brand?.companyName || "Unknown Brand"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "16px", fontWeight: 700 }}>{formatCurrency(app.proposedRate)}</td>
                    <td style={{ padding: "16px", color: "var(--color-text-secondary)", fontSize: "13px" }}>
                      {new Date(app.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td style={{ padding: "16px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          border: "1px solid",
                          borderRadius: "8px",
                          padding: "4px 10px",
                          fontSize: "12px",
                          fontWeight: 800,
                          ...statusStyle,
                        }}
                      >
                        {app.status}
                      </span>
                    </td>
                    <td style={{ padding: "16px", textAlign: "right" }}>
                      <Link href={`/dashboard/campaigns/${app.campaign.id}`} className="btn btn-ghost btn-sm">
                        View Campaign
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell user={session.user}>
      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "40px 20px" }}>
        {/* Header */}
        <div style={{ marginBottom: "32px" }}>
          <h1 style={{ fontSize: "32px", fontWeight: 800 }}>My Applications</h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "14px", marginTop: "4px" }}>
            Track the status of your pitches and proposals submitted to campaigns.
          </p>
        </div>

        {error && (
          <div
            className="card"
            style={{
              padding: "16px",
              background: "rgba(244, 63, 94, 0.08)",
              border: "1px solid rgba(244, 63, 94, 0.2)",
              borderRadius: "var(--radius-md)",
              color: "var(--color-accent-rose)",
              marginBottom: "24px",
            }}
          >
            {error}
          </div>
        )}

        {applicationsList}
      </div>
    </DashboardShell>
  );
}
