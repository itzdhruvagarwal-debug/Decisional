"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import DashboardShell from "@/components/dashboard/DashboardShell";

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
}

export default function DiscoverInfluencersPage() {
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [minFollowers, setMinFollowers] = useState("");
  const [minEngagementRate, setMinEngagementRate] = useState("");
  const [minRate, setMinRate] = useState("");
  const [maxRate, setMaxRate] = useState("");
  const [city, setCity] = useState("");
  const [platform, setPlatform] = useState("");
  const { data: session } = useSession();

  const fetchInfluencers = async (
    currentSearch = search,
    currentCategory = category,
    currentMinFollowers = minFollowers,
    currentMinEngagementRate = minEngagementRate,
    currentMinRate = minRate,
    currentMaxRate = maxRate,
    currentCity = city,
    currentPlatform = platform,
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (currentSearch) params.append("search", currentSearch);
      if (currentCategory) params.append("category", currentCategory);
      if (currentMinFollowers)
        params.append("minFollowers", currentMinFollowers);
      if (currentMinEngagementRate)
        params.append("minEngagementRate", currentMinEngagementRate);
      if (currentMinRate) params.append("minRate", currentMinRate);
      if (currentMaxRate) params.append("maxRate", currentMaxRate);
      if (currentCity) params.append("city", currentCity);
      if (currentPlatform) params.append("platform", currentPlatform);

      const res = await fetch(`/api/influencers?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setInfluencers(data.influencers);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const canDiscover =
      session?.user?.userType === "BRAND" ||
      session?.user?.userType === "ADMIN";

    if (canDiscover) {
      fetchInfluencers("", "", "", "", "", "", "", "");
    } else if (session) {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.userType]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchInfluencers();
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
            background: "rgba(255, 255, 255, 0.03)",
            backdropFilter: "blur(20px)",
            borderRadius: "8px",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            boxShadow: "0 20px 40px rgba(0,0,0,0.2)"
          }}
        >
          <div style={{ flex: "1 1 min(280px, 100%)" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0, marginBottom: "10px", color: "var(--color-text-secondary)" }}>
              Search Keywords
            </label>
            <input
              type="text"
              placeholder="Name, bio, or handle..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "14px 18px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(0,0,0,0.2)",
                color: "white",
                fontSize: "15px",
                outline: "none",
                transition: "all 0.3s"
              }}
              onFocus={(e) => e.target.style.borderColor = "var(--color-primary)"}
              onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
            />
          </div>
          <div style={{ flex: "1 1 min(180px, 100%)" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0, marginBottom: "10px", color: "var(--color-text-secondary)" }}>
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{
                width: "100%",
                padding: "14px 18px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(0,0,0,0.2)",
                color: "white",
                fontSize: "15px",
                cursor: "pointer",
                outline: "none"
              }}
            >
              <option value="" style={{ background: "#1a1a2e" }}>All Industries</option>
              {categoriesList.map((c) => (
                <option key={c} value={c} style={{ background: "#1a1a2e" }}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: "1 1 min(180px, 100%)" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0, marginBottom: "10px", color: "var(--color-text-secondary)" }}>
              Platform
            </label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              style={{
                width: "100%",
                padding: "14px 18px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(0,0,0,0.2)",
                color: "white",
                fontSize: "15px",
                cursor: "pointer",
                outline: "none"
              }}
            >
              <option value="" style={{ background: "#1a1a2e" }}>All Platforms</option>
              <option value="instagram" style={{ background: "#1a1a2e" }}>Instagram</option>
              <option value="youtube" style={{ background: "#1a1a2e" }}>YouTube</option>
            </select>
          </div>
          <div style={{ flex: "1 1 min(180px, 100%)" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0, marginBottom: "10px", color: "var(--color-text-secondary)" }}>
              Minimum Reach
            </label>
            <select
              value={minFollowers}
              onChange={(e) => setMinFollowers(e.target.value)}
              style={{
                width: "100%",
                padding: "14px 18px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(0,0,0,0.2)",
                color: "white",
                fontSize: "15px",
                cursor: "pointer",
                outline: "none"
              }}
            >
              <option value="" style={{ background: "#1a1a2e" }}>Any Reach</option>
              <option value="1000" style={{ background: "#1a1a2e" }}>1k+ Subs/Followers</option>
              <option value="10000" style={{ background: "#1a1a2e" }}>10k+ Subs/Followers</option>
              <option value="100000" style={{ background: "#1a1a2e" }}>100k+ Subs/Followers</option>
              <option value="1000000" style={{ background: "#1a1a2e" }}>1M+ Subs/Followers</option>
            </select>
          </div>
          <div style={{ flex: "1 1 min(180px, 100%)" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0, marginBottom: "10px", color: "var(--color-text-secondary)" }}>
              Min Engagement
            </label>
            <select
              value={minEngagementRate}
              onChange={(e) => setMinEngagementRate(e.target.value)}
              style={{
                width: "100%",
                padding: "14px 18px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(0,0,0,0.2)",
                color: "white",
                fontSize: "15px",
                cursor: "pointer",
                outline: "none"
              }}
            >
              <option value="" style={{ background: "#1a1a2e" }}>Any Rate</option>
              <option value="1" style={{ background: "#1a1a2e" }}>1%+</option>
              <option value="2" style={{ background: "#1a1a2e" }}>2%+</option>
              <option value="3" style={{ background: "#1a1a2e" }}>3%+</option>
              <option value="5" style={{ background: "#1a1a2e" }}>5%+</option>
            </select>
          </div>
          <div style={{ flex: "1 1 min(180px, 100%)" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0, marginBottom: "10px", color: "var(--color-text-secondary)" }}>
              City
            </label>
            <input
              type="text"
              placeholder="e.g. Mumbai"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              style={{
                width: "100%",
                padding: "14px 18px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(0,0,0,0.2)",
                color: "white",
                fontSize: "15px",
                outline: "none",
                transition: "all 0.3s"
              }}
              onFocus={(e) => e.target.style.borderColor = "var(--color-primary)"}
              onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
            />
          </div>
          <div style={{ flex: "1 1 min(140px, 100%)" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0, marginBottom: "10px", color: "var(--color-text-secondary)" }}>
              Min Price (₹)
            </label>
            <input
              type="number"
              placeholder="Min"
              value={minRate}
              onChange={(e) => setMinRate(e.target.value)}
              style={{
                width: "100%",
                padding: "14px 18px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(0,0,0,0.2)",
                color: "white",
                fontSize: "15px",
                outline: "none"
              }}
            />
          </div>
          <div style={{ flex: "1 1 min(140px, 100%)" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0, marginBottom: "10px", color: "var(--color-text-secondary)" }}>
              Max Price (₹)
            </label>
            <input
              type="number"
              placeholder="Max"
              value={maxRate}
              onChange={(e) => setMaxRate(e.target.value)}
              style={{
                width: "100%",
                padding: "14px 18px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(0,0,0,0.2)",
                color: "white",
                fontSize: "15px",
                outline: "none"
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", flex: "1 1 auto" }}>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              type="submit"
              style={{
                height: "52px",
                padding: "0 32px",
                background: "var(--gradient-primary)",
                border: "none",
                borderRadius: "8px",
                color: "white",
                fontWeight: 800,
                fontSize: "15px",
                cursor: "pointer",
                boxShadow: "0 10px 20px rgba(99, 102, 241, 0.3)"
              }}
            >
              Search
            </motion.button>
          </div>
        </motion.form>

        <AnimatePresence mode="wait">
          {loading ? (
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
                border: "4px solid rgba(255,255,255,0.1)",
                borderTopColor: "var(--color-primary)",
                borderRadius: "8px",
                margin: "0 auto 24px",
                animation: "spin 1s linear infinite",
              }} />
              <p style={{ fontSize: "16px", fontWeight: 600, letterSpacing: 0 }}>Loading creator data...</p>
            </motion.div>
          ) : influencers.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                textAlign: "center",
                padding: "80px 40px",
                background: "rgba(255,255,255,0.02)",
                borderRadius: "8px",
                border: "1px dashed rgba(255,255,255,0.1)"
              }}
            >
              <div style={{ fontSize: "14px", fontWeight: 800, marginBottom: "12px", color: "var(--color-text-muted)" }}>
                No matches
              </div>
              <h2 style={{ fontSize: "24px", fontWeight: 800, color: "var(--color-text-primary)", marginBottom: "12px" }}>
                Zero Matches Found
              </h2>
              <p style={{ color: "var(--color-text-secondary)", fontSize: "16px" }}>
                Our scouts couldn't find anyone with those exact filters. Try broadening your criteria.
              </p>
            </motion.div>
          ) : (
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
                    background: "rgba(255, 255, 255, 0.03)",
                    backdropFilter: "blur(10px)",
                    borderRadius: "8px",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
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
                      color: "white",
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

                  <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
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
                      <div style={{ fontSize: "15px", fontWeight: 800, color: "var(--color-text-primary)" }}>{inf.instagramFollowers ? (inf.instagramFollowers > 1000 ? (inf.instagramFollowers / 1000).toFixed(1) + 'k' : inf.instagramFollowers) : '-'}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: 700, marginBottom: "4px", textTransform: "uppercase" }}>Subs</div>
                      <div style={{ fontSize: "15px", fontWeight: 800, color: "var(--color-text-primary)" }}>{inf.youtubeSubscribers === -1 ? 'Hidden' : inf.youtubeSubscribers ? (inf.youtubeSubscribers > 1000 ? (inf.youtubeSubscribers / 1000).toFixed(1) + 'k' : inf.youtubeSubscribers) : '-'}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "11px", color: "var(--color-text-muted)", fontWeight: 700, marginBottom: "4px", textTransform: "uppercase" }}>Deals</div>
                      <div style={{ fontSize: "15px", fontWeight: 800, color: "var(--color-text-primary)" }}>{inf.totalCompletedDeals || 0}</div>
                    </div>
                  </div>

                  <Link
                    href={`/dashboard/influencers/${inf.id}`}
                    style={{
                      background: "var(--color-bg-secondary)",
                      color: "white",
                      textAlign: "center",
                      padding: "16px",
                      borderRadius: "8px",
                      fontSize: "15px",
                      fontWeight: 700,
                      textDecoration: "none",
                      border: "1px solid rgba(255,255,255,0.05)",
                      transition: "all 0.3s"
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.background = "var(--gradient-primary)";
                      (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 8px 16px rgba(99, 102, 241, 0.2)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.background = "var(--color-bg-secondary)";
                      (e.currentTarget as HTMLAnchorElement).style.boxShadow = "none";
                    }}
                  >
                    View Profile
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DashboardShell>
  );
}
