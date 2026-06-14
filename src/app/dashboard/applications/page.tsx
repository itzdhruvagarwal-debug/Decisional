"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import Link from "next/link";
import DashboardShell from "@/components/dashboard/DashboardShell";

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

function formatCurrency(paise: number): string {
  if (Number.isNaN(paise)) return "Rs 0";
  const rupees = paise / 100;
  return `Rs ${rupees.toLocaleString("en-IN")}`;
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
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 10;

  useEffect(() => {
    if (!session?.user) return;

    let isMounted = true;
    setLoading(true);
    setError("");

    fetch(`/api/applications?page=${page}&limit=${limit}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((payload) => {
        if (!isMounted) return;
        if (payload.success) {
          const fetchedApps = payload.data?.applications || payload.applications || [];
          setApplications(fetchedApps);
          setTotalPages(payload.data?.totalPages || payload.totalPages || 1);
        } else {
          setError(payload.message || "Failed to load applications");
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error(err);
        setError("Failed to fetch applications");
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [session, page]);

  if (!session) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
        <span className="loading" />
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

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "64px" }}>
            <span className="loading" style={{ width: "40px", height: "40px" }} />
          </div>
        ) : applications.length === 0 ? (
          <div
            className="card"
            style={{
              padding: "64px 24px",
              textAlign: "center",
              background: "var(--color-bg-secondary)",
              border: "1px solid var(--color-border)",
              borderRadius: "24px",
            }}
          >
            <h3 style={{ fontSize: "18px", fontWeight: 800, marginBottom: "8px" }}>No applications found</h3>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "14px", marginBottom: "20px" }}>
              You haven't applied to any campaigns yet. Browse available campaigns to start pitching!
            </p>
            <Link href="/dashboard/campaigns" className="btn btn-primary">
              Browse Campaigns
            </Link>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "24px" }}>
            <div
              className="card"
              style={{
                padding: "0",
                background: "var(--color-bg-secondary)",
                border: "1px solid var(--color-border)",
                borderRadius: "20px",
                overflow: "hidden",
              }}
            >
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ background: "var(--color-bg-tertiary)" }}>
                    <tr>
                      {["Campaign & Brand", "Proposed Rate", "Applied Date", "Status", "Actions"].map((head) => (
                        <th
                          key={head}
                          style={{
                            padding: "16px",
                            textAlign: head === "Actions" ? "right" : "left",
                            fontSize: "12px",
                            fontWeight: 800,
                            color: "var(--color-text-secondary)",
                            textTransform: "uppercase",
                            letterSpacing: "1px",
                            borderBottom: "1px solid var(--color-border)",
                          }}
                        >
                          {head}
                        </th>
                      ))}
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
                                  borderRadius: "8px",
                                  background: "var(--color-bg-tertiary)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  overflow: "hidden",
                                  fontWeight: 700,
                                }}
                              >
                                {app.campaign.brand?.logo ? (
                                  <img
                                    src={app.campaign.brand.logo}
                                    alt=""
                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                  />
                                ) : (
                                  (app.campaign.brand?.companyName || "BC").slice(0, 2).toUpperCase()
                                )}
                              </div>
                              <div>
                                <div style={{ fontWeight: 800, fontSize: "14px" }}>{app.campaign.title}</div>
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "12px", marginTop: "12px" }}>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn btn-secondary"
                  style={{ minWidth: "90px" }}
                >
                  Previous
                </button>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn btn-secondary"
                  style={{ minWidth: "90px" }}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
