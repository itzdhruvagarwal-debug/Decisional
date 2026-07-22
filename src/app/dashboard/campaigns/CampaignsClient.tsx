"use client";

import Link from "next/link";
import Image from "next/image";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { useEffect, useMemo, useState } from "react";
import { formatCurrency, formatNumber } from "@/lib/utils-client";
import { Pagination } from "@/components/ui/pagination";
import EmptyState from "@/components/ui/EmptyState";
import { Button, Input, Select } from "@/components/ui";

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
        type: typeof parsed?.type === "string" ? parsed.type.trim() : "",
        count: Math.max(1, Number(parsed?.count || 1)),
      };
    })
    .filter((item) => Boolean(item.type));
}

interface CampaignsPayload {
  data?: { campaigns?: RawCampaign[]; totalPages?: number };
  campaigns?: RawCampaign[];
  totalPages?: number;
}

interface RawCampaign {
  id?: string;
  title?: string;
  description?: string;
  createdAt?: string;
  perInfluencerBudget?: number | string;
  minFollowers?: number | string;
  postingDeadline?: string;
  targetCategories?: unknown;
  totalApplications?: number;
  brand?: { companyName?: string; logo?: string | null; avgRating?: number; averageRating?: number };
  deliverables?: unknown;
  maxInfluencers?: number | null;
  acceptedCount?: number;
  _count?: { applications?: number };
  applications?: unknown[];
}

export default function CampaignsClient({ user }: { readonly user: { readonly userType?: string } }) {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [page, setPage] = useState(1);
  
  const canCreateCampaign = user?.userType === "BRAND";

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

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
  queryParams.set("limit", "12");

  const { data: payload, isLoading: loading, error: fetchErr } = useSWR<CampaignsPayload>(
    `/api/campaigns?${queryParams.toString()}`,
    fetcher
  );

  const { campaigns, totalPages } = useMemo(() => {
    const rawCampaigns: RawCampaign[] = payload?.data?.campaigns ?? payload?.campaigns ?? [];
    const pages = payload?.data?.totalPages ?? payload?.totalPages ?? 1;

    const mapped: Campaign[] = rawCampaigns.map((campaign: RawCampaign) => ({
      id: campaign.id || '',
      title: campaign.title || "Untitled Campaign",
      description: campaign.description || "",
      createdAt: campaign.createdAt || new Date(0).toISOString(),
      perInfluencerBudget: Number(campaign.perInfluencerBudget || 0),
      minFollowers: Number(campaign.minFollowers || 0),
      postingDeadline: campaign.postingDeadline || new Date(0).toISOString(),
      targetCategories: normalizeStringArray(campaign.targetCategories),
      totalApplications: Number(campaign.totalApplications || campaign._count?.applications || 0),
      brand: {
        companyName: campaign.brand?.companyName || "Unknown Brand",
        logo: campaign.brand?.logo || null,
        avgRating: Number(campaign.brand?.avgRating || campaign.brand?.averageRating || 0) / 100,
      },
      deliverables: normalizeDeliverables(campaign.deliverables),
      maxInfluencers: campaign.maxInfluencers ?? null,
      acceptedCount: Array.isArray(campaign.applications) ? campaign.applications.length : 0,
    }));

    return { campaigns: mapped, totalPages: pages };
  }, [payload]);

  const error = fetchErr ? "Unable to load campaigns right now." : null;

  const filteredCampaigns = useMemo(() => {
    return campaigns;
  }, [campaigns]);

  let content;
  if (loading) {
    content = (
      <div className="flex justify-center p-10">
        <span className="loading w-40 h-40" />
      </div>
    );
  } else if (error) {
    content = (
      <EmptyState
        emoji="⚠️"
        title="Error Loading Campaigns"
        description={error}
      />
    );
  } else if (filteredCampaigns.length === 0) {
    content = (
      <EmptyState
        emoji="🔍"
        title="No Campaigns Found"
        description="Try broadening your search query or changing category and budget filters."
      />
    );
  } else {
    content = (
      <div
        className="campaign-card-grid grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
      >
        {filteredCampaigns.map((campaign) => (
          <article key={campaign.id} className="card campaign-card" style={{ padding: "18px" }}>
            <div className="campaign-card-brand-row">
              <div className="campaign-card-logo" aria-hidden="true">
                {campaign.brand.logo ? (
                  <Image src={campaign.brand.logo} alt="" fill unoptimized className="object-cover" />
                ) : (
                  campaign.brand.companyName.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
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
              className="campaign-card-description text-secondary text-sm leading-normal" style={{ minHeight: "42px" }}
            >
              {campaign.description}
            </p>

            <div
              className="campaign-card-tags flex flex-wrap gap-1-5" style={{ margin: "10px 0 14px" }}
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
              className="campaign-card-metrics grid gap-2 mb-3" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
            >
              <div>
                <div className="text-xs text-muted">
                  Slots
                </div>
                <div className="text-sm font-semibold">
                  {campaign.maxInfluencers !== null && campaign.maxInfluencers !== undefined
                    ? `${campaign.acceptedCount}/${campaign.maxInfluencers} filled`
                    : "Unlimited"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted">
                  Followers
                </div>
                <div className="text-sm font-semibold">
                  {formatNumber(campaign.minFollowers)}+
                </div>
              </div>
              <div>
                <div className="text-xs text-muted">
                  Applied
                </div>
                <div className="text-sm font-semibold">
                  {campaign.totalApplications}
                </div>
              </div>
            </div>

            <div
              className="campaign-card-footer flex items-center justify-between gap-2-5"
            >
              <span className="text-xs text-secondary">
                Post by {new Date(campaign.postingDeadline).toLocaleDateString("en-IN")}
              </span>
              <Link href={`/dashboard/campaigns/${campaign.id}`} className="btn btn-primary">
                View Details
              </Link>
            </div>
          </article>
        ))}
      </div>
    );
  }

  return (
    <div>
      <header className="dashboard-sub-header glass">
        <div
          className="flex justify-between items-center w-full"
        >
          <div>
            <h2 className="text-lg font-extrabold">Explore Campaigns</h2>
            <p className="text-sm text-secondary">
              Apply to active campaigns matching your niche.
            </p>
          </div>
          {canCreateCampaign && (
            <Link href="/dashboard/campaigns/create" className="btn btn-primary">
              Create Campaign
            </Link>
          )}
        </div>

        <div
          className="flex gap-3 flex-wrap mt-5"
        >
          <Input
            type="text"
            placeholder="Search campaigns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="min-w-220"
          />

          <Select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPage(1);
            }}
            className="min-w-160"
          >
            <option value="newest">Newest</option>
            <option value="budget_high">Budget: High to Low</option>
            <option value="budget_low">Budget: Low to High</option>
            <option value="deadline">Deadline Soon</option>
          </Select>
        </div>

        <div
          className="flex gap-2 mt-4 overflow-x-auto"
        >
          {categories.map((category) => (
            <Button
              key={category}
              variant={selectedCategory === category ? "primary" : "ghost"}
              onClick={() => {
                setSelectedCategory(category);
                setPage(1);
              }}
              className="whitespace-nowrap" style={{ background:
                  selectedCategory === category
                    ? "var(--gradient-primary)"
                    : "var(--color-bg-tertiary)", color: selectedCategory === category ? "white" : "inherit" }}
            >
              {category}
            </Button>
          ))}
        </div>
      </header>

      {content}

      <Pagination page={page} totalPages={totalPages} setPage={setPage} marginTop="32px" />
    </div>
  );
}
