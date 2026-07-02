"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatCurrency, formatNumber } from "@/lib/utils-client";

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
  maxInfluencers: number | null;
  acceptedCount: number;
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

export default function CampaignsClient({ user }: { user: { userType?: string } }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  const canCreateCampaign = user?.userType === "BRAND";

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    setLoading(true);
    const queryParams = new URLSearchParams();

    if (canCreateCampaign) {
      queryParams.set("scope", "mine");
      queryParams.set("status", "ALL");
    } else {
      queryParams.set("status", "ACTIVE");
    }

    if (selectedCategory !== "All") {
      queryParams.set("category", selectedCategory);
    }

    if (debouncedSearch.trim()) {
      queryParams.set("search", debouncedSearch.trim());
    }

    // Sort mappings
    if (sortBy === "budget_high") {
      queryParams.set("sortBy", "perInfluencerBudget");
      queryParams.set("sortOrder", "desc");
    } else if (sortBy === "budget_low") {
      queryParams.set("sortBy", "perInfluencerBudget");
      queryParams.set("sortOrder", "asc");
    } else if (sortBy === "deadline") {
      queryParams.set("sortBy", "applicationDeadline");
      queryParams.set("sortOrder", "asc");
    } else {
      queryParams.set("sortBy", "createdAt");
      queryParams.set("sortOrder", "desc");
    }

    queryParams.set("page", String(page));
    queryParams.set("limit", "12"); // 12 items per page

    fetch(`/api/campaigns?${queryParams.toString()}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((payload) => {
        const rawCampaigns = payload?.data?.campaigns || payload?.campaigns || [];
        setTotalPages(payload?.data?.totalPages || payload?.totalPages || 1);

        const mapped: Campaign[] = rawCampaigns.map((campaign: { id: string; title?: string; description?: string; createdAt?: string; perInfluencerBudget?: number; minFollowers?: number; postingDeadline?: string; targetCategories?: unknown; totalApplications?: number; _count?: { applications?: number }; brand?: { companyName?: string; logo?: string | null; averageRating?: number }; status?: string; deliverables?: unknown; maxInfluencers?: number; applications?: unknown[] }) => ({
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
          maxInfluencers: campaign.maxInfluencers ?? null,
          acceptedCount: campaign.applications ? campaign.applications.length : 0,
        }));

        setCampaigns(mapped);
        setLoading(false);
      })
      .catch((error) => {
        if (error?.name !== "AbortError") {
          console.error("[campaigns-client] Failed to fetch campaigns:", error);
        }
        setLoading(false);
      });
  }, [canCreateCampaign, selectedCategory, debouncedSearch, sortBy, page]);

  const filteredCampaigns = useMemo(() => {
    return campaigns;
  }, [campaigns]);

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
              onChange={(e) => {
                setSortBy(e.target.value);
                setPage(1);
              }}
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
              onClick={() => {
                setSelectedCategory(category);
                setPage(1);
              }}
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
          className="campaign-card-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "16px",
          }}
        >
          {filteredCampaigns.map((campaign) => (
            <article key={campaign.id} className="card campaign-card" style={{ padding: "18px" }}>
              <div className="campaign-card-brand-row">
                <div className="campaign-card-logo" aria-hidden="true">
                  {campaign.brand.logo ? (
                    <img src={campaign.brand.logo} alt="" />
                  ) : (
                    campaign.brand.companyName.slice(0, 2).toUpperCase()
                  )}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="campaign-card-brand-name">
                    {campaign.brand.companyName}
                  </div>
                  <h3>{campaign.title}</h3>
                </div>
                <span className="badge badge-success campaign-card-rate">
                  {formatCurrency(campaign.perInfluencerBudget)}
                </span>
              </div>

              <p
                className="campaign-card-description"
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
                className="campaign-card-tags"
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
                className="campaign-card-metrics"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "8px",
                  marginBottom: "14px",
                }}
              >
                <div>
                  <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                    Slots
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: 600 }}>
                    {campaign.maxInfluencers !== null && campaign.maxInfluencers !== undefined
                      ? `${campaign.acceptedCount}/${campaign.maxInfluencers} filled`
                      : "Unlimited"}
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
                className="campaign-card-footer"
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

      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "12px",
            marginTop: "32px",
            marginBottom: "16px",
          }}
        >
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
  );
}
