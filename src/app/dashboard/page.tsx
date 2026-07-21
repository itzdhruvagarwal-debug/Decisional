import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import DashboardShell from "@/components/dashboard/DashboardShell";
import AdminAnalyticsView from "@/components/analytics/AdminAnalyticsView";
import {
  getInfluencerAnalytics,
  getBrandAnalytics,
} from "@/lib/analytics-engine";
import { logger } from "@/lib/logger";
import AnalyticsPageClient from "./analytics/AnalyticsPageClient";
import { isAdmin as rbacIsAdmin, isBrand, isInfluencer } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// ── Data fetching ────────────────────────────────────────────────────────────

async function fetchDashboardData(userId: string, userType: string, fy?: string) {
  let influencerData = null;
  let brandData = null;

  if (isInfluencer(userType)) {
    try {
      influencerData = await getInfluencerAnalytics(userId, fy);
    } catch (error) {
      logger.error("Influencer analytics fetch failed", error, { userId });
    }
  } else if (isBrand(userType)) {
    try {
      brandData = await getBrandAnalytics(userId, fy);
    } catch (error) {
      logger.error("Brand analytics fetch failed", error, { userId });
    }
  }

  return { influencerData, brandData };
}

// ── Sub-components (extracted to reduce DashboardPage cognitive complexity) ──

function DashboardErrorFallback({ user }: Readonly<{ user: Session["user"] }>) {
  return (
    <DashboardShell user={user}>
      <div
        style={{
          padding: "80px 40px",
          textAlign: "center",
          background: "rgba(244, 63, 94, 0.05)",
          borderRadius: "var(--radius-xl)",
          border: "1px dashed var(--color-accent-rose)",
          margin: "40px auto",
          maxWidth: "600px",
        }}
      >
        <div style={{ fontSize: "48px", marginBottom: "20px" }} aria-hidden="true">
          !
        </div>
        <h2
          className="gradient-text"
          style={{
            fontSize: "24px",
            fontWeight: 900,
            marginBottom: "12px",
            background: "linear-gradient(135deg, #f43f5e, #fb923c)",
          }}
        >
          Dashboard Interrupted
        </h2>
        <p
          style={{
            color: "var(--color-text-secondary)",
            fontSize: "15px",
            marginBottom: "32px",
            lineHeight: 1.6,
          }}
        >
          The dashboard could not load the latest workspace data. Please
          refresh or try again after a moment.
        </p>
        <a
          href="/dashboard"
          className="btn btn-danger"
          style={{
            padding: "12px 32px",
            display: "inline-block",
            textDecoration: "none",
          }}
          aria-label="Reload dashboard"
        >
          Reload Dashboard
        </a>
      </div>
    </DashboardShell>
  );
}

function DashboardEmptyState({ dataLoadFailed }: Readonly<{ dataLoadFailed: boolean }>) {
  return (
    <div style={{ padding: "100px 40px", textAlign: "center" }}>
      <div
        className="glass"
        style={{
          maxWidth: "560px",
          margin: "0 auto",
          padding: "60px 40px",
          borderRadius: "var(--radius-2xl)",
        }}
      >
        <div
          style={{
            fontSize: "64px",
            marginBottom: "24px",
            filter: "drop-shadow(0 0 20px rgba(99, 102, 241, 0.3))",
          }}
          aria-hidden="true"
        >
          {dataLoadFailed ? "!" : "..."}
        </div>
        <h2
          className="gradient-text"
          style={{ fontSize: "28px", fontWeight: 900, marginBottom: "16px" }}
        >
          {dataLoadFailed ? "Access Interrupted" : "Initializing Workspace"}
        </h2>
        <p
          style={{
            color: "var(--color-text-secondary)",
            fontSize: "15px",
            lineHeight: 1.6,
            marginBottom: "36px",
          }}
        >
          {dataLoadFailed
            ? "We could not load your dashboard data. Please refresh or try again after a moment."
            : "We are fetching your latest campaign, engagement, and financial data."}
        </p>
        <a
          href="/dashboard"
          className="btn btn-primary btn-lg"
          style={{
            padding: "14px 40px",
            display: "inline-block",
            textDecoration: "none",
          }}
          aria-label={
            dataLoadFailed
              ? "Retry dashboard data load"
              : "Refresh dashboard data"
          }
        >
          {dataLoadFailed ? "Retry" : "Refresh"}
        </a>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ fy?: string }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const resolvedSearchParams = await searchParams;
  const { userType, id: userId } = session.user;
  const isAdmin = rbacIsAdmin(userType);
  const fy = resolvedSearchParams?.fy;

  if (isAdmin) {
    redirect("/admin");
  }

  let influencerData = null;
  let brandData = null;
  const adminData = null;

  try {
    const data = await fetchDashboardData(userId, userType, fy);
    influencerData = data.influencerData;
    brandData = data.brandData;
  } catch (error) {
    logger.error("Dashboard critical error", error, { userId, userType });
    return <DashboardErrorFallback user={session.user} />;
  }

  const dataLoadFailed = !adminData && !influencerData && !brandData;

  const renderDashboardContent = () => {
    if (isAdmin && adminData) {
      return (
        <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
          <header style={{ marginBottom: "40px" }}>
            <h1
              className="gradient-text"
              style={{ fontSize: "32px", fontWeight: 900, marginBottom: "8px" }}
            >
              Admin Ops Center
            </h1>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
              Platform health, financial operations, and ecosystem monitoring.
            </p>
          </header>
          <AdminAnalyticsView data={adminData} />
        </div>
      );
    }
    if (isInfluencer(userType) && influencerData) {
      return (
        <AnalyticsPageClient
          userType="INFLUENCER"
          initialData={influencerData}
          currentFY={fy || undefined}
        />
      );
    }
    if (isBrand(userType) && brandData) {
      return (
        <AnalyticsPageClient
          userType="BRAND"
          initialData={brandData}
          currentFY={fy || undefined}
        />
      );
    }
    return <DashboardEmptyState dataLoadFailed={dataLoadFailed} />;
  };

  return (
    <DashboardShell user={session.user}>
      {renderDashboardContent()}
    </DashboardShell>
  );
}
