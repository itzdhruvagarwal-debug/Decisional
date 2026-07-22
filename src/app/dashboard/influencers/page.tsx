"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import DashboardShell from "@/components/dashboard/DashboardShell";
import EmptyState from "@/components/ui/EmptyState";
import { Button, Input, Select } from "@/components/ui";
import { z } from "zod";

export const discoverFiltersSchema = z.object({
  search: z.string().max(100).optional(),
  category: z.string().max(50).optional(),
  platform: z.string().max(20).optional(),
  minFollowers: z.string().max(20).optional(),
  minEngagementRate: z.string().max(10).optional(),
  city: z.string().max(100).optional(),
  minRate: z.string().max(20).optional(),
  maxRate: z.string().max(20).optional(),
});

interface Influencer {
  id: string;
  displayName: string;
  bio: string | null;
  avatar: string | null;
  city: string | null;
  instagramFollowers: number | null;
  youtubeSubscribers: number | null;
  categories: string;
  totalCompletedDeals: number;
  trustScore: number;
  userId: string;
  isFeatured?: boolean;
}

function formatNumber(val: number | null | undefined): string {
  if (!val) return "-";
  if (val > 1000) return (val / 1000).toFixed(1) + "k";
  return val.toString();
}

export default function DiscoverInfluencersPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [minFollowers, setMinFollowers] = useState("");
  const [minEngagementRate, setMinEngagementRate] = useState("");
  const [minRate, setMinRate] = useState("");
  const [maxRate, setMaxRate] = useState("");
  const [city, setCity] = useState("");
  const [platform, setPlatform] = useState("");
  const { data: session } = useSession();

  const canDiscover = session?.user?.userType === "BRAND" || session?.user?.userType === "ADMIN";

  const validation = discoverFiltersSchema.safeParse({
    search: search || undefined,
    category: category || undefined,
    platform: platform || undefined,
    minFollowers: minFollowers || undefined,
    minEngagementRate: minEngagementRate || undefined,
    city: city || undefined,
    minRate: minRate || undefined,
    maxRate: maxRate || undefined,
  });

  const validData = validation.success ? validation.data : {};

  const queryParams = new URLSearchParams();
  if (validData.search) queryParams.append("search", validData.search);
  if (validData.category) queryParams.append("category", validData.category);
  if (validData.minFollowers) queryParams.append("minFollowers", validData.minFollowers);
  if (validData.minEngagementRate) queryParams.append("minEngagementRate", validData.minEngagementRate); // minEngagementRate mapping
  if (validData.minRate) queryParams.append("minRate", validData.minRate);
  if (validData.maxRate) queryParams.append("maxRate", validData.maxRate);
  if (validData.city) queryParams.append("city", validData.city);
  if (validData.platform) queryParams.append("platform", validData.platform);

  const { data: payload, isLoading: loading } = useSWR<{ influencers?: Influencer[]; data?: { influencers?: Influencer[] } }>(
    canDiscover ? `/api/influencers?${queryParams.toString()}` : null,
    fetcher
  );

  const influencers: Influencer[] = payload?.influencers || payload?.data?.influencers || [];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
  };

  const categoriesList = [
    "fashion",
    "food",
    "tech",
    "travel",
    "fitness",
    "beauty",
    "gaming",
  ];

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="loading"></div>
      </div>
    );
  }

  if (
    session.user?.userType !== "BRAND" &&
    session.user?.userType !== "ADMIN"
  ) {
    return (
      <DashboardShell user={session.user}>
        <div className="card text-center max-w-680" style={{ margin: "40px auto" }}>
          <h1 className="text-2xl font-extrabold mb-2">
            Brand access required
          </h1>
          <p className="text-secondary mb-5">
            Influencer discovery is available for brand accounts. Browse campaigns instead.
          </p>
          <Link href="/dashboard/campaigns" className="btn btn-primary">
            Browse Campaigns
          </Link>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell user={session.user}>
      <div className="mx-auto" style={{ maxWidth: "1200px", padding: "40px 20px" }}>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <h1 className="mb-3 font-extrabold tracking-normal text-5xl" style={{ background: "linear-gradient(135deg, #8b5cf6, #3b82f6, #06b6d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Discover Top Creators
          </h1>
          <p className="text-secondary text-lg max-w-600 mx-auto">
            Find verified creators by category, reach, and trust score.
          </p>
        </motion.div>

        <motion.form
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          onSubmit={handleSearch}
          className="flex gap-5 flex-wrap border-card rounded-lg mb-10" style={{ padding: "clamp(16px, 4vw, 32px)", background: "var(--color-bg-card)", boxShadow: "var(--shadow-sm)" }}
        >
          <div style={{ flex: "1 1 min(280px, 100%)" }}>
            <Input
              id="search-keywords-input"
              type="text"
              label="Search Keywords"
              placeholder="Name, bio, or handle..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              fullWidth
            />
          </div>
          <div style={{ flex: "1 1 min(180px, 100%)" }}>
            <Select
              id="category-select"
              label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              fullWidth
            >
              <option value="">All Industries</option>
              {categoriesList.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </Select>
          </div>
          <div style={{ flex: "1 1 min(180px, 100%)" }}>
            <Select
              id="platform-select"
              label="Platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              fullWidth
            >
              <option value="">All Platforms</option>
              <option value="instagram">Instagram</option>
              <option value="youtube">YouTube</option>
            </Select>
          </div>
          <div style={{ flex: "1 1 min(180px, 100%)" }}>
            <Select
              id="min-followers-select"
              label="Minimum Reach"
              value={minFollowers}
              onChange={(e) => setMinFollowers(e.target.value)}
              fullWidth
            >
              <option value="">Any Reach</option>
              <option value="1000">1k+ Subs/Followers</option>
              <option value="10000">10k+ Subs/Followers</option>
              <option value="100000">100k+ Subs/Followers</option>
              <option value="1000000">1M+ Subs/Followers</option>
            </Select>
          </div>
          <div style={{ flex: "1 1 min(180px, 100%)" }}>
            <Select
              id="min-engagement-select"
              label="Min Engagement"
              value={minEngagementRate}
              onChange={(e) => setMinEngagementRate(e.target.value)}
              fullWidth
            >
              <option value="">Any Rate</option>
              <option value="1">1%+</option>
              <option value="2">2%+</option>
              <option value="3">3%+</option>
              <option value="5">5%+</option>
            </Select>
          </div>
          <div style={{ flex: "1 1 min(180px, 100%)" }}>
            <Input
              id="city-input"
              type="text"
              label="City"
              placeholder="e.g. Mumbai"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              fullWidth
            />
          </div>
          <div style={{ flex: "1 1 min(140px, 100%)" }}>
            <Input
              id="min-rate-input"
              type="number"
              label="Min Price (₹)"
              placeholder="Min"
              value={minRate}
              onChange={(e) => setMinRate(e.target.value)}
              fullWidth
            />
          </div>
          <div style={{ flex: "1 1 min(140px, 100%)" }}>
            <Input
              id="max-rate-input"
              type="number"
              label="Max Price (₹)"
              placeholder="Max"
              value={maxRate}
              onChange={(e) => setMaxRate(e.target.value)}
              fullWidth
            />
          </div>
          <div className="flex items-end" style={{ flex: "1 1 auto" }}>
            <Button
              type="submit"
              variant="primary"
              className="font-extrabold text-sm h-13" style={{ padding: "0 32px" }}
            >
              Search
            </Button>
          </div>
        </motion.form>

        <AnimatePresence mode="wait">
          {(() => {
            if (loading) {
              return (
                <motion.div
                  key="loader"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center text-secondary" style={{ padding: "80px" }}
                >
                  <div className="loader rounded-md w-48 h-48" style={{ border: "4px solid var(--color-border)", borderTopColor: "var(--color-primary)", margin: "0 auto 24px", animation: "spin 1s linear infinite" }} />
                  <p className="text-base font-semibold tracking-normal">Loading creator data...</p>
                </motion.div>
              );
            }
            if (influencers.length === 0) {
              return (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <EmptyState
                    emoji="🔍"
                    title="Zero Matches Found"
                    description="Our scouts couldn't find anyone with those exact filters. Try broadening your criteria."
                  />
                </motion.div>
              );
            }
            return (
            <motion.div
              key="grid"
              className="grid-3"
              variants={{
                show: { transition: { staggerChildren: 0.1 } }
              }}
              initial="hidden"
              animate="show"
            >
              {influencers.map((inf: Influencer) => (
                <motion.div
                  key={inf.id}
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    show: { opacity: 1, y: 0 }
                  }}
                  whileHover={{ y: -10, transition: { duration: 0.2 } }}
                  className="flex flex-col h-full relative overflow-hidden rounded-lg p-8" style={{ background: inf.isFeatured
                      ? "linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, var(--color-bg-card) 100%)"
                      : "var(--color-bg-card)", backdropFilter: "blur(10px)", border: inf.isFeatured
                      ? "1px solid rgba(245, 158, 11, 0.4)"
                      : "1px solid var(--color-border)", boxShadow: inf.isFeatured
                      ? "0 10px 30px rgba(245, 158, 11, 0.12), var(--shadow-sm)"
                      : "var(--shadow-sm)" }}
                >
                  {/* Subtle Background Accent */}
                  <div className="absolute rounded-md bg-gradient-primary pointer-events-none" style={{ top: "-20px", right: "-20px", width: "100px", height: "100px", opacity: 0.05, filter: "blur(40px)" }} />

                  <div className="flex gap-5 items-center mb-6">
                    <div className="flex items-center justify-center flex-shrink-0 rounded-md text-3xl font-extrabold bg-gradient-primary" style={{ width: "72px", height: "72px", boxShadow: "0 10px 20px rgba(0,0,0,0.2)" }}>
                      {inf.displayName?.[0] || "I"}
                    </div>
                    <div>
                      <h3 className="text-lg font-extrabold text-primary" style={{ margin: "0 0 6px" }}>
                        {inf.displayName}
                      </h3>
                      <div className="flex items-center text-sm text-muted gap-1-5">
                        <span>Location:</span>
                        <span>{inf.city || "Global"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap mb-5">
                    {inf.isFeatured && (
                      <span className="font-extrabold inline-flex items-center gap-1 text-xs rounded-md text-amber uppercase px-2-py-1 bg-amber-15" style={{ border: "1px solid rgba(245, 158, 11, 0.25)" }}>
                        ⭐ Featured
                      </span>
                    )}
                    <span className="font-extrabold text-xs rounded-md text-emerald uppercase px-2-py-1" style={{ background: "rgba(16, 185, 129, 0.15)" }}>
                      TRUST: {inf.trustScore}%
                    </span>
                    <span className="font-extrabold text-xs rounded-md uppercase px-2-py-1" style={{ background: "rgba(59, 130, 246, 0.15)", color: "#3b82f6" }}>
                      {inf.categories.split(',')[0]}
                    </span>
                  </div>

                  <p className="text-sm text-secondary flex-1 mb-6 leading-1-6">
                    {inf.bio || "High-impact creator focused on quality content delivery and authentic audience engagement."}
                  </p>

                  <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: "1fr 1fr 1fr", padding: "20px 0", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <div className="text-center">
                      <div className="text-muted font-bold mb-1 text-xs uppercase">Followers</div>
                      <div className="font-extrabold text-sm text-primary">{formatNumber(inf.instagramFollowers)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-muted font-bold mb-1 text-xs uppercase">Subs</div>
                      <div className="font-extrabold text-sm text-primary">{inf.youtubeSubscribers === -1 ? 'Hidden' : formatNumber(inf.youtubeSubscribers)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-muted font-bold mb-1 text-xs uppercase">Deals</div>
                      <div className="font-extrabold text-sm text-primary">{inf.totalCompletedDeals || 0}</div>
                    </div>
                  </div>

                  <div className="flex gap-2-5" style={{ marginTop: "auto" }}>
                    <Link
                      href={`/dashboard/influencers/${inf.id}`}
                      className="flex-1 text-center text-sm font-bold bg-secondary rounded-md no-underline" style={{ padding: "12px 8px", border: "1px solid rgba(255,255,255,0.05)", transition: "all 0.3s" }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.08)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLAnchorElement).style.background = "var(--color-bg-secondary)";
                      }}
                    >
                      View Profile
                    </Link>
                    <Link
                      href={`/dashboard/campaigns/create?invite=${inf.id}`}
                      className="flex-1 text-center text-sm font-bold rounded-md no-underline bg-gradient-primary" style={{ padding: "12px 8px", transition: "all 0.3s", boxShadow: "0 4px 12px rgba(99, 102, 241, 0.2)" }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLAnchorElement).style.opacity = "0.9";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLAnchorElement).style.opacity = "1";
                      }}
                    >
                      Invite
                    </Link>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          );
        })()}
        </AnimatePresence>
      </div>
    </DashboardShell>
  );
}
