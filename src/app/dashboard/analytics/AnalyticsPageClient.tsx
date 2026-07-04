"use client";

import { useRouter, useSearchParams } from "next/navigation";
import InfluencerDashboard from "@/components/analytics/InfluencerDashboard";
import BrandDashboard from "@/components/analytics/BrandDashboard";

interface AnalyticsPageClientProps {
  readonly userType: "INFLUENCER" | "BRAND";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly initialData: any;
  readonly currentFY?: string | undefined;
}

export default function AnalyticsPageClient({
  userType,
  initialData,
  currentFY,
}: AnalyticsPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Generate available FYs (current FY and previous 3)
  const generateAvailableFYs = (): string[] => {
    const fys: string[] = [];
    const now = new Date();
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + IST_OFFSET_MS);
    const currentFYStart = istNow.getUTCMonth() >= 3
      ? istNow.getUTCFullYear()
      : istNow.getUTCFullYear() - 1;
    
    for (let i = 0; i < 4; i++) {
      const yr = currentFYStart - i;
      fys.push(`${yr}-${String(yr + 1).slice(-2)}`);
    }
    return fys;
  };

  const availableFYs = generateAvailableFYs();
  const selectedFY = currentFY || "";

  const handleFYChange = (fy: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (fy) {
      params.set("fy", fy);
    } else {
      params.delete("fy");
    }
    router.push(`/dashboard/analytics?${params.toString()}`);
  };

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
      <div
        style={{
          marginBottom: "32px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 800 }}>
            {userType === "INFLUENCER" ? "Performance Analytics" : "Campaign Analytics"}
          </h1>
          <p style={{ color: "var(--color-text-secondary)" }}>
            {userType === "INFLUENCER"
              ? "Track your earnings, reach, and impact"
              : "Monitor your spend, ROI, and campaign success"}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <label
            htmlFor="analytics-fy-select"
            style={{
              fontSize: "14px",
              fontWeight: 500,
              color: "var(--color-text-secondary)",
            }}
          >
            Financial Year:
          </label>
          <select
            id="analytics-fy-select"
            value={selectedFY}
            onChange={(e) => handleFYChange(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-secondary)",
              color: "var(--color-text-primary)",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <option value="">Rolling 12 Months</option>
            {availableFYs.map((fy) => (
              <option key={fy} value={fy}>
                FY {fy}
              </option>
            ))}
          </select>
        </div>
      </div>

      {userType === "INFLUENCER" ? (
        <InfluencerDashboard data={initialData} />
      ) : (
        <BrandDashboard data={initialData} />
      )}
    </div>
  );
}
