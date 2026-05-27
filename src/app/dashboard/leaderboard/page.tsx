"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/dashboard/DashboardShell";

interface LeaderboardUser {
  id: string;
  name: string;
  avatar: string;
  subtitle: string;
  city?: string;
  score: number;
  level: number;
  trustScore?: number;
  deals?: number;
  isWeeklyChampion?: boolean;
}

interface HallOfFameUser {
  rank: number;
  id: string;
  name: string;
  avatar: string;
  xp: number;
  level: number;
  deals: number;
}

export default function LeaderboardPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<"influencers" | "brands">("influencers");
  const [filter, setFilter] = useState<"all-time" | "weekly">("all-time");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [influencers, setInfluencers] = useState<LeaderboardUser[]>([]);
  const [brands, setBrands] = useState<LeaderboardUser[]>([]);
  const [hallOfFame, setHallOfFame] = useState<HallOfFameUser[]>([]);
  const [loading, setLoading] = useState(true);

  const categories = [
    "Fashion",
    "Tech",
    "Food",
    "Fitness",
    "Beauty",
    "Travel",
    "Gaming",
    "Education",
    "Lifestyle",
  ];
  const cities = [
    "Mumbai",
    "Delhi",
    "Bangalore",
    "Hyderabad",
    "Chennai",
    "Kolkata",
    "Pune",
    "Jaipur",
  ];

  useEffect(() => {
    let isMounted = true;
    async function fetchLeaderboard() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ filter });
        if (city) params.set("city", city);
        if (category) params.set("category", category);

        const res = await fetch(`/api/gamification/leaderboard?${params}`);
        const data = await res.json();
        if (isMounted) {
          setInfluencers(data.influencers || []);
          setBrands(data.brands || []);
          setHallOfFame(data.hallOfFame || []);
        }
      } catch {
        console.error("Failed to fetch leaderboard");
      }
      if (isMounted) setLoading(false);
    }

    fetchLeaderboard();
    return () => {
      isMounted = false;
    };
  }, [filter, city, category]);

  const activeList = tab === "influencers" ? influencers : brands;
  const scoreLabel =
    tab === "influencers"
      ? filter === "weekly"
        ? "Deals This Week"
        : "XP"
      : filter === "weekly"
        ? "Deals This Week"
        : "Trust Score";

  if (!session)
    return <div className="p-8 text-center text-muted">Loading...</div>;

  return (
    <DashboardShell user={session.user}>
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <h1
            style={{
              fontSize: "32px",
              fontWeight: 800,
              background: "linear-gradient(135deg, #f59e0b, #ef4444)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            🏆 Leaderboard
          </h1>
          <p style={{ color: "var(--color-text-secondary)", marginTop: "8px" }}>
            Top performers on CollabX
          </p>
        </div>

        {/* Filter Controls */}
        <div
          className="scrollable-tabs"
          style={{
            display: "flex",
            gap: "12px",
            marginBottom: "24px",
            alignItems: "center",
            paddingBottom: "8px",
          }}
        >
          {/* Influencer/Brand Toggle */}
          <div
            style={{
              display: "flex",
              background: "var(--color-bg-secondary)",
              borderRadius: "12px",
              padding: "4px",
            }}
          >
            {(["influencers", "brands"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: "8px 20px",
                  borderRadius: "10px",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "13px",
                  transition: "all 0.2s",
                  background:
                    tab === t ? "var(--color-primary)" : "transparent",
                  color: tab === t ? "white" : "var(--color-text-secondary)",
                }}
              >
                {t === "influencers" ? "👤 Creators" : "🏢 Brands"}
              </button>
            ))}
          </div>

          {/* Weekly/All-time Toggle */}
          <div
            style={{
              display: "flex",
              background: "var(--color-bg-secondary)",
              borderRadius: "12px",
              padding: "4px",
            }}
          >
            {(["all-time", "weekly"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "10px",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "13px",
                  transition: "all 0.2s",
                  background:
                    filter === f
                      ? f === "weekly"
                        ? "#f59e0b"
                        : "var(--color-primary)"
                      : "transparent",
                  color: filter === f ? "white" : "var(--color-text-secondary)",
                }}
              >
                {f === "weekly" ? "🔥 This Week" : "🏛️ All-Time"}
              </button>
            ))}
          </div>

          {/* City Filter */}
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            style={{
              padding: "8px 14px",
              borderRadius: "10px",
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-secondary)",
              color: "var(--color-text-primary)",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            <option value="">🏙️ All Cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Category Filter */}
          {tab === "influencers" && (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{
                padding: "8px 14px",
                borderRadius: "10px",
                border: "1px solid var(--color-border)",
                background: "var(--color-bg-secondary)",
                color: "var(--color-text-primary)",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              <option value="">📂 All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Hall of Fame Section (all-time only) */}
        {filter === "all-time" &&
          tab === "influencers" &&
          hallOfFame.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-end",
                gap: "16px",
                marginBottom: "40px",
                padding: "32px 16px",
                background:
                  "linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(239, 68, 68, 0.08))",
                borderRadius: "16px",
                border: "1px solid rgba(245, 158, 11, 0.2)",
                flexWrap: "wrap",
              }}
            >
              {/* 2nd place */}
              {hallOfFame[1] && (
                <PodiumUser
                  user={hallOfFame[1]}
                  rank={2}
                  color="#c0c0c0"
                  height={100}
                  delay={0.1}
                  unit="XP"
                />
              )}
              {/* 1st place */}
              {hallOfFame[0] && (
                <PodiumUser
                  user={hallOfFame[0]}
                  rank={1}
                  color="#ffd700"
                  height={130}
                  delay={0}
                  isFirst
                  unit="XP"
                />
              )}
              {/* 3rd place */}
              {hallOfFame[2] && (
                <PodiumUser
                  user={hallOfFame[2]}
                  rank={3}
                  color="#cd7f32"
                  height={80}
                  delay={0.2}
                  unit="XP"
                />
              )}
            </motion.div>
          )}

        {/* Weekly Champion Banner */}
        {filter === "weekly" &&
          influencers[0]?.isWeeklyChampion &&
          tab === "influencers" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                padding: "20px",
                background:
                  "linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(239, 68, 68, 0.15))",
                borderRadius: "16px",
                border: "2px solid #f59e0b",
                marginBottom: "24px",
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontSize: "48px" }}>🔥</div>
              <div>
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#f59e0b",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                  }}
                >
                  🏆 HOT CREATOR OF THE WEEK
                </div>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: 800,
                    color: "var(--color-text-primary)",
                    marginTop: "4px",
                  }}
                >
                  {influencers[0].name}
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {influencers[0].score} deals completed this week
                </div>
              </div>
            </motion.div>
          )}

        {/* Leaderboard List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {/* Header Row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "40px 1fr 100px 80px",
              padding: "8px 16px",
              fontSize: "11px",
              fontWeight: 700,
              color: "var(--color-text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            <span>#</span>
            <span>Name</span>
            <span style={{ textAlign: "right" }}>{scoreLabel}</span>
            <span style={{ textAlign: "right" }}>Level</span>
          </div>

          <AnimatePresence>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: "64px",
                    borderRadius: "12px",
                    background: "var(--color-bg-secondary)",
                    opacity: 0.5,
                    animation: "pulse 2s ease-in-out infinite",
                  }}
                />
              ))
            ) : activeList.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "40px",
                  color: "var(--color-text-secondary)",
                }}
              >
                No users found with the selected filters.
              </div>
            ) : (
              activeList.map((user, index) => (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03 }}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "40px 1fr 100px 80px",
                    alignItems: "center",
                    padding: "12px 16px",
                    borderRadius: "12px",
                    background:
                      index < 3
                        ? "linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(139, 92, 246, 0.05))"
                        : "var(--color-bg-secondary)",
                    border:
                      index === 0
                        ? "1px solid rgba(245, 158, 11, 0.3)"
                        : "1px solid transparent",
                    transition: "all 0.2s",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.transform =
                      "translateX(4px)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.transform =
                      "translateX(0)";
                  }}
                >
                  {/* Rank */}
                  <span
                    style={{
                      fontSize: index < 3 ? "20px" : "14px",
                      fontWeight: 800,
                      color:
                        index === 0
                          ? "#ffd700"
                          : index === 1
                            ? "#c0c0c0"
                            : index === 2
                              ? "#cd7f32"
                              : "var(--color-text-secondary)",
                    }}
                  >
                    {index < 3 ? ["🥇", "🥈", "🥉"][index] : index + 1}
                  </span>

                  {/* User Info */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        background: `linear-gradient(135deg, hsl(${(index * 40) % 360}, 70%, 50%), hsl(${(index * 40 + 60) % 360}, 70%, 60%))`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "16px",
                        fontWeight: 700,
                        color: "white",
                        overflow: "hidden",
                      }}
                    >
                      {user.avatar ? (
                        <img
                          src={user.avatar}
                          alt={user.name + " avatar"}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        user.name?.charAt(0)?.toUpperCase() || "?"
                      )}
                    </div>
                    <div>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "14px",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        {user.name || "Anonymous"}
                        {user.isWeeklyChampion && (
                          <span
                            style={{
                              fontSize: "10px",
                              padding: "2px 6px",
                              borderRadius: "6px",
                              background: "rgba(245, 158, 11, 0.2)",
                              color: "#f59e0b",
                              fontWeight: 700,
                            }}
                          >
                            🔥 HOT
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {user.subtitle}
                        {user.city ? ` • ${user.city}` : ""}
                      </div>
                    </div>
                  </div>

                  {/* Score */}
                  <div
                    style={{
                      textAlign: "right",
                      fontWeight: 700,
                      fontSize: "14px",
                      color: "var(--color-primary)",
                    }}
                  >
                    {typeof user.score === "number"
                      ? user.score.toLocaleString()
                      : user.score}
                  </div>

                  {/* Level */}
                  <div style={{ textAlign: "right" }}>
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 700,
                        padding: "4px 10px",
                        borderRadius: "8px",
                        background: "rgba(139, 92, 246, 0.15)",
                        color: "#a855f7",
                      }}
                    >
                      Lv.{user.level}
                    </span>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>
    </DashboardShell>
  );
}

function PodiumUser({
  user,
  rank,
  color,
  height,
  delay,
  isFirst,
  unit,
}: {
  user: HallOfFameUser;
  rank: number;
  color: string;
  height: number;
  delay: number;
  isFirst?: boolean;
  unit: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
      }}
    >
      {isFirst && <div style={{ fontSize: "28px" }}>👑</div>}
      <div
        style={{
          width: isFirst ? "64px" : "52px",
          height: isFirst ? "64px" : "52px",
          borderRadius: "50%",
          background: `linear-gradient(135deg, ${color}, ${color}88)`,
          border: `3px solid ${color}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: isFirst ? "24px" : "18px",
          fontWeight: 700,
          color: "white",
          overflow: "hidden",
          boxShadow: `0 0 20px ${color}44`,
        }}
      >
        {user.avatar ? (
          <img
            src={user.avatar}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          user.name?.charAt(0)?.toUpperCase() || "?"
        )}
      </div>
      <div
        style={{
          fontWeight: 700,
          fontSize: isFirst ? "15px" : "13px",
          textAlign: "center",
          maxWidth: "100px",
        }}
      >
        {user.name || "Anonymous"}
      </div>
      <div
        style={{
          width: isFirst ? "100px" : "80px",
          height: `${height}px`,
          borderRadius: "12px 12px 0 0",
          background: `linear-gradient(to top, ${color}33, ${color}11)`,
          border: `1px solid ${color}44`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: "4px",
        }}
      >
        <div
          style={{
            fontSize: isFirst ? "22px" : "18px",
            fontWeight: 800,
            color,
          }}
        >
          {rank}
        </div>
        <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
          {user.xp.toLocaleString()} {unit}
        </div>
      </div>
    </motion.div>
  );
}
