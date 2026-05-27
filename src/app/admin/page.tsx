import prisma from "@/lib/db";
import Link from "next/link";
import { getAdminAnalytics } from "@/lib/analytics-engine";
import AdminAnalyticsView from "@/components/analytics/AdminAnalyticsView";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  let pendingVerifications = 0;
  let analyticsData: any = null;
  let loadError = false;

  try {
    [pendingVerifications, analyticsData] = await Promise.all([
      prisma.user.count({ where: { status: "PENDING_VERIFICATION" } }),
      getAdminAnalytics(),
    ]);
  } catch (error) {
    loadError = true;
    logger.error("Admin dashboard failed to load live analytics", error);
  }

  return (
    <div className="admin-page admin-page-narrow">
      <header style={{ marginBottom: "40px" }}>
        <h1 className="gradient-text" style={{ fontSize: "32px", fontWeight: 900, marginBottom: "8px" }}>
          System Overview
        </h1>
        <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
          Real-time metrics and operational health of the Decisional ecosystem.
        </p>
      </header>

      <div className="grid-2" style={{ marginBottom: "40px" }}>
        <div className="card hover-lift" style={{
          background: "linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(245, 158, 11, 0.03) 100%)",
          borderColor: "rgba(245, 158, 11, 0.2)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
            <div>
              <div className="badge badge-warning" style={{ marginBottom: "12px" }}>
                Pending Review
              </div>
              <div style={{ fontSize: "48px", fontWeight: 900, color: "var(--color-accent-amber)", lineHeight: 1 }}>
                {pendingVerifications}
              </div>
            </div>
            <div style={{ fontSize: "28px", fontWeight: 700 }}>KYC</div>
          </div>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "14px", marginBottom: "20px" }}>
            New users waiting for KYC and social media verification.
          </p>
          <Link
            href="/admin/verifications"
            className="btn btn-primary"
            style={{ width: "fit-content", background: "var(--color-accent-amber)", boxShadow: "0 0 20px rgba(245, 158, 11, 0.2)" }}
          >
            Open Review Queue
          </Link>
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <h3 style={{ fontSize: "18px", fontWeight: 700 }}>System Status</h3>
            <span className="badge badge-success">Operational</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", background: "var(--color-bg-tertiary)", borderRadius: "var(--radius-md)" }}>
              <span style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>Database</span>
              <span style={{ color: "var(--color-accent-emerald)", fontWeight: 700 }}>
                {loadError ? "Degraded" : "Online"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", background: "var(--color-bg-tertiary)", borderRadius: "var(--radius-md)" }}>
              <span style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>Redis Cache</span>
              <span style={{ color: "var(--color-accent-emerald)", fontWeight: 700 }}>Warming</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", background: "var(--color-bg-tertiary)", borderRadius: "var(--radius-md)" }}>
              <span style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>Search Engine</span>
              <span style={{ color: "var(--color-accent-emerald)", fontWeight: 700 }}>Syncing</span>
            </div>
          </div>
        </div>
      </div>

      {loadError ? (
        <div className="card" style={{ marginBottom: "24px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "8px" }}>
            Live analytics temporarily unavailable
          </h3>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
            The dashboard shell is available, but analytics queries failed. Please retry after infrastructure checks.
          </p>
        </div>
      ) : (
        analyticsData && <AdminAnalyticsView data={analyticsData} />
      )}
    </div>
  );
}
