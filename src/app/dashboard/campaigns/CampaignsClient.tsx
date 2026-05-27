"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

interface Campaign {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  perInfluencerBudget: number;
  minFollowers: number;
  postingDeadline: string;
  targetCategories: string[];
  totalApplications: number;
  brand: {
    companyName: string;
    logo: string | null;
    avgRating: number;
  };
  deliverables: { type: string; count: number }[];
}

const categories = [
  "All",
  "Fashion",
  "Beauty",
  "Lifestyle",
  "Food",
  "Travel",
  "Fitness",
  "Technology",
  "Gaming",
  "Entertainment",
];

const deliverableLabels: Record<string, string> = {
  INSTAGRAM_POST: "IG Post",
  INSTAGRAM_REEL: "IG Reel",
  INSTAGRAM_STORY: "IG Story",
  YOUTUBE_VIDEO: "YT Video",
  YOUTUBE_SHORT: "YT Short",
};

function formatCurrency(paise: number): string {
  if (Number.isNaN(paise)) return "Rs 0";
  const rupees = paise / 100;
  if (rupees >= 100000) return `Rs ${(rupees / 100000).toFixed(1)}L`;
  if (rupees >= 1000) return `Rs ${(rupees / 1000).toFixed(0)}K`;
  return `Rs ${rupees.toFixed(0)}`;
}

function formatNumber(num: number): string {
  if (!num) return "0";
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
  return String(num);
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeDeliverables(
  value: unknown,
): Array<{ type: string; count: number }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const parsed = item as { type?: unknown; count?: unknown };
      return {
        type: String(parsed?.type || "").trim(),
        count: Math.max(1, Number(parsed?.count || 1)),
      };
    })
    .filter((item) => Boolean(item.type));
}

export default function CampaignsClient({ user }: { user: any }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const canCreateCampaign = user?.userType === "BRAND";

  useEffect(() => {
    const query = canCreateCampaign
      ? "scope=mine&status=ALL"
      : "status=ACTIVE";

    fetch(`/api/campaigns?${query}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((payload) => {
        const rawCampaigns = payload?.data?.campaigns || payload?.campaigns || [];

        const mapped: Campaign[] = rawCampaigns.map((campaign: any) => ({
          id: campaign.id,
          title: campaign.title || "Untitled Campaign",
          description: campaign.description || "",
          createdAt: campaign.createdAt || new Date(0).toISOString(),
          perInfluencerBudget: Number(campaign.perInfluencerBudget || 0),
          minFollowers: Number(campaign.minFollowers || 0),
          postingDeadline:
            campaign.postingDeadline || new Date(Date.now()).toISOString(),
          targetCategories: normalizeStringArray(campaign.targetCategories),
          totalApplications: Number(
            campaign.totalApplications || campaign?._count?.applications || 0,
          ),
          brand: {
            companyName: campaign.brand?.companyName || "Unknown Brand",
            logo: campaign.brand?.logo || null,
            avgRating: Number(campaign.brand?.averageRating || 0) / 100,
          },
          deliverables: normalizeDeliverables(campaign.deliverables),
        }));

        setCampaigns(mapped);
        setLoading(false);
      })
      .catch((error) => {
        console.error(error);
        setLoading(false);
      });
  }, [canCreateCampaign]);

  const filteredCampaigns = useMemo(() => {
    return campaigns
      .filter((campaign) => {
        if (
          selectedCategory !== "All" &&
          !campaign.targetCategories.includes(selectedCategory)
        ) {
          return false;
        }
        if (
          searchQuery &&
          !campaign.title.toLowerCase().includes(searchQuery.toLowerCase())
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "budget_high") {
          return b.perInfluencerBudget - a.perInfluencerBudget;
        }
        if (sortBy === "budget_low") {
          return a.perInfluencerBudget - b.perInfluencerBudget;
        }
        if (sortBy === "deadline") {
          return (
            new Date(a.postingDeadline).getTime() -
            new Date(b.postingDeadline).getTime()
          );
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [campaigns, selectedCategory, searchQuery, sortBy]);

  return (
    <div>
      <header className="dashboard-sub-header glass">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 800 }}>
              {canCreateCampaign ? "My Campaigns" : "Browse Campaigns"}
            </h1>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
              {canCreateCampaign
                ? "Manage drafts, active campaigns, applications, and spend"
                : "Find opportunities that match your niche"}
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {canCreateCampaign && (
              <Link href="/dashboard/campaigns/create" className="btn btn-primary">
                Create Campaign
              </Link>
            )}

            <input
              type="text"
              className="input"
              placeholder="Search campaigns"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ minWidth: "220px" }}
            />

            <select
              className="input"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{ minWidth: "160px" }}
            >
              <option value="newest">Newest</option>
              <option value="budget_high">Budget: High to Low</option>
              <option value="budget_low">Budget: Low to High</option>
              <option value="deadline">Deadline Soon</option>
            </select>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            marginTop: "16px",
            overflowX: "auto",
          }}
        >
          {categories.map((category) => (
            <button
              key={category}
              className="btn"
              onClick={() => setSelectedCategory(category)}
              style={{
                whiteSpace: "nowrap",
                background:
                  selectedCategory === category
                    ? "var(--gradient-primary)"
                    : "var(--color-bg-tertiary)",
                color: selectedCategory === category ? "white" : "inherit",
              }}
            >
              {category}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "48px" }}>
          <span className="loading" style={{ width: "40px", height: "40px" }} />
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 16px" }}>
          <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>
            No campaigns found
          </h3>
          <p style={{ color: "var(--color-text-secondary)" }}>
            Try changing filters or search query.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "16px",
          }}
        >
          {filteredCampaigns.map((campaign) => (
            <article key={campaign.id} className="card" style={{ padding: "18px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "10px",
                  gap: "8px",
                }}
              >
                <h3 style={{ fontSize: "18px", fontWeight: 700 }}>{campaign.title}</h3>
                <span className="badge">{formatCurrency(campaign.perInfluencerBudget)}</span>
              </div>

              <p
                style={{
                  color: "var(--color-text-secondary)",
                  fontSize: "14px",
                  lineHeight: 1.5,
                  minHeight: "42px",
                }}
              >
                {campaign.description}
              </p>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "6px",
                  margin: "10px 0 14px",
                }}
              >
                {campaign.deliverables.slice(0, 2).map((item, index) => (
                  <span key={`${campaign.id}-del-${index}`} className="badge badge-primary">
                    {item.count}x {deliverableLabels[item.type] || item.type}
                  </span>
                ))}
                {campaign.targetCategories.slice(0, 2).map((category) => (
                  <span key={`${campaign.id}-${category}`} className="badge">
                    {category}
                  </span>
                ))}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "8px",
                  marginBottom: "14px",
                }}
              >
                <div>
                  <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                    Brand
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: 600 }}>
                    {campaign.brand.companyName}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                    Followers
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: 600 }}>
                    {formatNumber(campaign.minFollowers)}+
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                    Applied
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: 600 }}>
                    {campaign.totalApplications}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                }}
              >
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                  Post by {new Date(campaign.postingDeadline).toLocaleDateString("en-IN")}
                </span>
                <Link href={`/dashboard/campaigns/${campaign.id}`} className="btn btn-primary">
                  View Details
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
