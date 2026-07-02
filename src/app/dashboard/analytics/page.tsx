import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import AdminAnalyticsView from "@/components/analytics/AdminAnalyticsView";
import {
  getInfluencerAnalytics,
  getBrandAnalytics,
} from "@/lib/analytics-engine";
import { AdminAnalyticsService } from "@/services/admin-analytics.service";
import DashboardShell from "@/components/dashboard/DashboardShell";
import AnalyticsPageClient from "./AnalyticsPageClient";



export default async function AnalyticsPage({
  searchParams,
}: {
  readonly searchParams: { fy?: string };
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { userType, id: userId } = session.user;
  const isAdmin = userType === "ADMIN";
  const fy = searchParams.fy;

  // Case 1: Admin User
  if (isAdmin) {
    const adminData = await AdminAnalyticsService.getDashboardStats();
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
    const influencerData = await getInfluencerAnalytics(userId, fy);
    return (
      <DashboardShell user={session.user}>
        <AnalyticsPageClient 
          userType="INFLUENCER" 
          _userId={userId} 
          initialData={influencerData}
          currentFY={fy || undefined}
        />
      </DashboardShell>
    );
  }

  // Case 3: Brand
  if (userType === "BRAND") {
    const brandData = await getBrandAnalytics(userId, fy);
    return (
      <DashboardShell user={session.user}>
        <AnalyticsPageClient 
          userType="BRAND" 
          _userId={userId} 
          initialData={brandData}
          currentFY={fy || undefined}
        />
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
