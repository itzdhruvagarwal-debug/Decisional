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

  const queryParams = new URLSearchParams();
  if (search) queryParams.append("search", search);
  if (category) queryParams.append("category", category);
  if (minFollowers) queryParams.append("minFollowers", minFollowers);
  if (minEngagementRate) queryParams.append("minEngagementRate", minEngagementRate);
  if (minRate) queryParams.append("minRate", minRate);
  if (maxRate) queryParams.append("maxRate", maxRate);
  if (city) queryParams.append("city", city);
  if (platform) queryParams.append("platform", platform);

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
        <div className="card" style={{ maxWidth: "680px", margin: "40px auto", textAlign: "center" }}>
          <h1 style={{ fontSize: "24px", fontWeight: 800, marginBottom: "8px" }}>
            Brand access required
          </h1>
          <p style={{ color: "var(--color-text-secondary)", marginBottom: "20px" }}>
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
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "40px 20px" }}>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ textAlign: "center", marginBottom: "48px" }}
        >
          <h1 style={{
            fontSize: "42px",
            fontWeight: 900,
            background: "linear-gradient(135deg, #8b5cf6, #3b82f6, #06b6d4)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: 0,
            marginBottom: "12px"
          }}>
            Discover Top Creators
          </h1>
          <p style={{
            color: "var(--color-text-secondary)",
            fontSize: "18px",
            maxWidth: "600px",
            margin: "0 auto"
          }}>
            Find verified creators by category, reach, and trust score.
          </p>
        </motion.div>

        <motion.form
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          onSubmit={handleSearch}
          style={{
            padding: "clamp(16px, 4vw, 32px)",
            marginBottom: "48px",
            display: "flex",
            gap: "20px",
            flexWrap: "wrap",
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-sm)"
          }}
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
          <div style={{ display: "flex", alignItems: "flex-end", flex: "1 1 auto" }}>
            <Button
              type="submit"
              variant="primary"
              style={{
                height: "52px",
                padding: "0 32px",
                fontWeight: 800,
                fontSize: "15px",
              }}
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
                  style={{ textAlign: "center", padding: "80px", color: "var(--color-text-secondary)" }}
                >
                  <div className="loader" style={{
                    width: "48px",
                    height: "48px",
                    border: "4px solid var(--color-border)",
                    borderTopColor: "var(--color-primary)",
                    borderRadius: "8px",
                    margin: "0 auto 24px",
                    animation: "spin 1s linear infinite",
                  }} />
                  <p style={{ fontSize: "16px", fontWeight: 600, letterSpacing: 0 }}>Loading creator data...</p>
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
                  style={{
                    background: inf.isFeatured
                      ? "linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, var(--color-bg-card) 100%)"
                      : "var(--color-bg-card)",
                    backdropFilter: "blur(10px)",
                    borderRadius: "var(--radius-lg)",
                    border: inf.isFeatured
                      ? "1px solid rgba(245, 158, 11, 0.4)"
                      : "1px solid var(--color-border)",
                    boxShadow: inf.isFeatured
                      ? "0 10px 30px rgba(245, 158, 11, 0.12), var(--shadow-sm)"
                      : "var(--shadow-sm)",
                    padding: "32px",
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                    position: "relative",
                    overflow: "hidden"
                  }}
                >
                  {/* Subtle Background Accent */}
                  <div style={{
                    position: "absolute",
                    top: "-20px",
                    right: "-20px",
                    width: "100px",
                    height: "100px",
                    background: "var(--gradient-primary)",
                    opacity: 0.05,
                    filter: "blur(40px)",
                    borderRadius: "8px",
                    pointerEvents: "none"
                  }} />

                  <div style={{ display: "flex", gap: "20px", alignItems: "center", marginBottom: "24px" }}>
                    <div style={{
                      width: "72px",
                      height: "72px",
                      borderRadius: "8px",
                      background: "var(--gradient-primary)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "28px",
                      fontWeight: 900,
                      flexShrink: 0,
                      boxShadow: "0 10px 20px rgba(0,0,0,0.2)"
                    }}>
                      {inf.displayName?.[0] || "I"}
                    </div>
                    <div>
                      <h3 style={{ fontSize: "18px", fontWeight: 800, margin: "0 0 6px", color: "var(--color-text-primary)" }}>
                        {inf.displayName}
                      </h3>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--color-text-muted)" }}>
                        <span>Location:</span>
                        <span>{inf.city || "Global"}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "20px" }}>
                    {inf.isFeatured && (
                      <span style={{
                        fontSize: "11px",
                        fontWeight: 800,
                        padding: "4px 10px",
                        borderRadius: "8px",
                        background: "rgba(245, 158, 11, 0.15)",
                        color: "#f59e0b",
                        border: "1px solid rgba(245, 158, 11, 0.25)",
                        textTransform: "uppercase",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px"
                      }}>
                        ⭐ Featured
                      </span>
                    )}
                    <span style={{
                      fontSize: "11px",
                      fontWeight: 800,
                      padding: "4px 10px",
                      borderRadius: "8px",
                      background: "rgba(16, 185, 129, 0.15)",
                      color: "#10b981",
                      textTransform: "uppercase"
                    }}>
                      TRUST: {inf.trustScore}%
                    </span>
                    <span style={{
                      fontSize: "11px",
                      fontWeight: 800,
                      padding: "4px 10px",
                      borderRadius: "8px",
                      background: "rgba(59, 130, 246, 0.15)",
                      color: "#3b82f6",
                      textTransform: "uppercase"
                    }}>
                      {inf.categories.split(',')[0]}
                    </span>
                  </div>

                  <p style={{
                    fontSize: "14px",
                    color: "var(--color-text-secondary)",
                    lineHeight: "1.6",
                    marginBottom: "28px",
                    flex: 1
                  }}>
                    {inf.bio || "High-impact creator focused on quality content delivery and authentic audience engagement."}
                  </p>

                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: "12px",
                    padding: "20px 0",
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    marginBottom: "24px"
                  }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: 700, marginBottom: "4px", textTransform: "uppercase" }}>Followers</div>
                      <div style={{ fontSize: "15px", fontWeight: 800, color: "var(--color-text-primary)" }}>{formatNumber(inf.instagramFollowers)}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: 700, marginBottom: "4px", textTransform: "uppercase" }}>Subs</div>
                      <div style={{ fontSize: "15px", fontWeight: 800, color: "var(--color-text-primary)" }}>{inf.youtubeSubscribers === -1 ? 'Hidden' : formatNumber(inf.youtubeSubscribers)}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: 700, marginBottom: "4px", textTransform: "uppercase" }}>Deals</div>
                      <div style={{ fontSize: "15px", fontWeight: 800, color: "var(--color-text-primary)" }}>{inf.totalCompletedDeals || 0}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "10px", marginTop: "auto" }}>
                    <Link
                      href={`/dashboard/influencers/${inf.id}`}
                      style={{
                        flex: 1,
                        background: "var(--color-bg-secondary)",
                        textAlign: "center",
                        padding: "12px 8px",
                        borderRadius: "8px",
                        fontSize: "14px",
                        fontWeight: 700,
                        textDecoration: "none",
                        border: "1px solid rgba(255,255,255,0.05)",
                        transition: "all 0.3s"
                      }}
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
                      style={{
                        flex: 1,
                        background: "var(--gradient-primary)",
                        textAlign: "center",
                        padding: "12px 8px",
                        borderRadius: "8px",
                        fontSize: "14px",
                        fontWeight: 700,
                        textDecoration: "none",
                        transition: "all 0.3s",
                        boxShadow: "0 4px 12px rgba(99, 102, 241, 0.2)"
                      }}
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
