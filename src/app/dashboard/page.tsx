import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/DashboardShell";
import InfluencerDashboard from "@/components/analytics/InfluencerDashboard";
import BrandDashboard from "@/components/analytics/BrandDashboard";
import AdminAnalyticsView from "@/components/analytics/AdminAnalyticsView";
import {
  getAdminAnalytics,
  getInfluencerAnalytics,
  getBrandAnalytics,
} from "@/lib/analytics-engine";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { userType, id: userId } = session.user;
  const isAdmin = userType === "ADMIN";

  let adminData = null;
  let influencerData = null;
  let brandData = null;

  try {
    if (isAdmin) {
      try {
        adminData = await getAdminAnalytics();
      } catch (e) {
        logger.error("Admin analytics fetch failed", e);
        // adminData stays null — dashboard will show a partial view
      }
    } else if (userType === "INFLUENCER") {
      try {
        influencerData = await getInfluencerAnalytics(userId);
      } catch (e) {
        logger.error("Influencer analytics fetch failed", e, { userId });
      }
    } else if (userType === "BRAND") {
      try {
        brandData = await getBrandAnalytics(userId);
      } catch (e) {
        logger.error("Brand analytics fetch failed", e, { userId });
      }
    }
  } catch (error) {
    logger.error("Dashboard critical error", error, { userId, userType });
    return (
      <DashboardShell user={session.user}>
        <div style={{
          padding: "80px 40px",
          textAlign: "center",
          background: "rgba(244, 63, 94, 0.05)",
          borderRadius: "var(--radius-xl)",
          border: "1px dashed var(--color-accent-rose)",
          margin: "40px auto",
          maxWidth: "600px"
        }}>
          <div style={{ fontSize: "48px", marginBottom: "20px" }}>⚠️</div>
          <h2 className="gradient-text" style={{ fontSize: "24px", fontWeight: 900, marginBottom: "12px", background: "linear-gradient(135deg, #f43f5e, #fb923c)" }}>
            Dashboard Interrupted
          </h2>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "15px", marginBottom: "32px", lineHeight: 1.6 }}>
            The dashboard engine encountered a synchronization issue.
            Our monitoring team has been notified.
          </p>
          <a
            href="/dashboard"
            className="btn btn-danger"
            style={{ padding: "12px 32px", display: "inline-block", textDecoration: "none" }}
          >
            🔄 Restart Session
          </a>
        </div>
      </DashboardShell>
    );
  }

  // If analytics failed individually, show the shell with an error message per section
  const dataLoadFailed = !adminData && !influencerData && !brandData;

  return (
    <DashboardShell user={session.user}>
      {isAdmin && adminData ? (
        <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
          <header style={{ marginBottom: "40px" }}>
            <h1 className="gradient-text" style={{ fontSize: "32px", fontWeight: 900, marginBottom: "8px" }}>
              Admin Ops Center
            </h1>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
              Enterprise-grade platform health and ecosystem monitoring.
            </p>
          </header>
          <AdminAnalyticsView data={adminData} />
        </div>
      ) : userType === "INFLUENCER" && influencerData ? (
        <InfluencerDashboard data={influencerData} />
      ) : userType === "BRAND" && brandData ? (
        <BrandDashboard data={brandData} />
      ) : (
        <div style={{ padding: "100px 40px", textAlign: "center" }}>
          <div className="glass" style={{ maxWidth: "560px", margin: "0 auto", padding: "60px 40px", borderRadius: "var(--radius-2xl)" }}>
            <div style={{
              fontSize: "64px",
              marginBottom: "24px",
              filter: "drop-shadow(0 0 20px rgba(99, 102, 241, 0.3))"
            }}>
              {dataLoadFailed ? "🔒" : "🌀"}
            </div>
            <h2 className="gradient-text" style={{ fontSize: "28px", fontWeight: 900, marginBottom: "16px" }}>
              {dataLoadFailed
                ? "Access Interrupted"
                : "Initializing Workspace"}
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
                ? "Connectivity to our data clusters was lost. High-availability mode is currently processing a bypass. Please refresh."
                : "We are fetching your latest engagement metrics and financial data from the distributed ledger."}
            </p>
            <a
              href="/dashboard"
              className="btn btn-primary btn-lg"
              style={{ padding: "14px 40px", display: "inline-block", textDecoration: "none" }}
            >
              {dataLoadFailed ? "🔄 Reconnect Systems" : "Synchronize Now"}
            </a>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

