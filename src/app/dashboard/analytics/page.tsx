import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import InfluencerDashboard from "@/components/analytics/InfluencerDashboard";
import BrandDashboard from "@/components/analytics/BrandDashboard";
import AdminAnalyticsView from "@/components/analytics/AdminAnalyticsView";
import {
  getAdminAnalytics,
  getInfluencerAnalytics,
  getBrandAnalytics,
} from "@/lib/analytics-engine";
import DashboardShell from "@/components/dashboard/DashboardShell";



export default async function AnalyticsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { userType, id: userId } = session.user;
  const isAdmin = userType === "ADMIN";

  // Case 1: Admin User
  if (isAdmin) {
    const adminData = await getAdminAnalytics();
    return (
      <DashboardShell user={session.user}>
        <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
          <div style={{ marginBottom: "32px" }}>
            <h1 style={{ fontSize: "28px", fontWeight: 800 }}>
              Admin Analytics
            </h1>
            <p style={{ color: "var(--color-text-secondary)" }}>
              Platform-wide performance and growth metrics
            </p>
          </div>
          <AdminAnalyticsView data={adminData} />
        </div>
      </DashboardShell>
    );
  }

  // Case 2: Influencer
  if (userType === "INFLUENCER") {
    const influencerData = await getInfluencerAnalytics(userId);
    return (
      <DashboardShell user={session.user}>
        <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
          <div style={{ marginBottom: "32px" }}>
            <h1 style={{ fontSize: "28px", fontWeight: 800 }}>
              Performance Analytics
            </h1>
            <p style={{ color: "var(--color-text-secondary)" }}>
              Track your earnings, reach, and impact
            </p>
          </div>
          <InfluencerDashboard data={influencerData} />
        </div>
      </DashboardShell>
    );
  }

  // Case 3: Brand
  if (userType === "BRAND") {
    const brandData = await getBrandAnalytics(userId);
    return (
      <DashboardShell user={session.user}>
        <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
          <div style={{ marginBottom: "32px" }}>
            <h1 style={{ fontSize: "28px", fontWeight: 800 }}>
              Campaign Analytics
            </h1>
            <p style={{ color: "var(--color-text-secondary)" }}>
              Monitor your spend, ROI, and campaign success
            </p>
          </div>
          <BrandDashboard data={brandData} />
        </div>
      </DashboardShell>
    );
  }

  // Fallback
  return (
    <DashboardShell user={session.user}>
      <div
        style={{
          padding: "40px",
          textAlign: "center",
          color: "var(--color-text-secondary)",
        }}
      >
        <p>Access restricted.</p>
      </div>
    </DashboardShell>
  );
}
