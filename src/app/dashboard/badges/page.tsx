"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { BadgeDefinition } from "@/lib/badges";

interface BadgeWithStatus extends BadgeDefinition {
  earned: boolean;
  earnedAt?: string;
  hasProgress?: boolean;
  currentProgress?: number;
  targetProgress?: number;
}

interface GamificationStats {
  xp: number;
  level: number;
  totalBadges: number;
  availableBadges: number;
}

export default function BadgesPage() {
  const { data: session } = useSession();
  const [badges, setBadges] = useState<BadgeWithStatus[]>([]);
  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [activeRarity, setActiveRarity] = useState<string>("ALL");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/gamification/badges")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load badges");
        return res.json();
      })
      .then((data) => {
        setBadges(data.badges || []);
        setStats(data.stats || null);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") {
          console.error("[badges] Failed to load achievements:", err);
          setError("Failed to load your achievements. Please refresh the page.");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const categories = [
    "ALL",
    "MILESTONE",
    "ACHIEVEMENT",
    "COMMUNITY",
    "SPECIAL",
    "VERIFICATION",
  ];

  const rarities = [
    "ALL",
    "COMMON",
    "RARE",
    "EPIC",
    "LEGENDARY",
  ];

  const filteredBadges = badges.filter((b) => {
    const categoryMatch = activeCategory === "ALL" || b.category === activeCategory;
    const rarityMatch = activeRarity === "ALL" || b.rarity === activeRarity;
    return categoryMatch && rarityMatch;
  });

  if (!session)
    return <div className="p-8 text-center text-muted">Loading...</div>;

  return (
    <DashboardShell user={session.user}>
      <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <h1
            style={{
              fontSize: "32px",
              fontWeight: 800,
              background: "linear-gradient(135deg, #f59e0b, #ef4444)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              marginBottom: "8px",
            }}
          >
            🏆 Badges & Achievements
          </h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "16px" }}>
            Collect badges, earn XP, and level up your profile!
          </p>
        </div>

        {/* Stats Summary - Similar to Hall of Fame styling */}
        {stats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "20px",
              marginBottom: "40px",
              flexWrap: "wrap",
            }}
          >
            <StatCard
              label="Current Level"
              value={stats.level.toString()}
              color="#8b5cf6"
              delay={0}
            />
            <StatCard
              label="Total XP"
              value={stats.xp.toLocaleString()}
              color="#f59e0b"
              delay={0.1}
            />
            <StatCard
              label="Badges Earned"
              value={`${stats.totalBadges}/${stats.availableBadges}`}
              color="#10b981"
              delay={0.2}
            />
          </motion.div>
        )}

        {/* Categories Filter */}
        <div
          className="scrollable-tabs"
          style={{
            display: "flex",
            gap: "10px",
            marginBottom: "16px",
            paddingBottom: "8px",
          }}
        >
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: "8px 20px",
                borderRadius: "100px",
                border:
                  activeCategory === cat
                    ? "none"
                    : "1px solid var(--color-border)",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "13px",
                transition: "all 0.2s",
                background:
                  activeCategory === cat
                    ? "var(--color-primary)"
                    : "var(--color-bg-secondary)",
                color:
                  activeCategory === cat
                    ? "white"
                    : "var(--color-text-secondary)",
                boxShadow:
                  activeCategory === cat
                    ? "0 4px 12px rgba(99, 102, 241, 0.3)"
                    : "none",
              }}
            >
              {cat.charAt(0) + cat.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Rarity Filter */}
        <div
          className="scrollable-tabs"
          style={{
            display: "flex",
            gap: "10px",
            marginBottom: "32px",
            paddingBottom: "8px",
          }}
        >
          {rarities.map((rarity) => (
            <button
              key={rarity}
              onClick={() => setActiveRarity(rarity)}
              style={{
                padding: "8px 20px",
                borderRadius: "100px",
                border:
                  activeRarity === rarity
                    ? "none"
                    : "1px solid var(--color-border)",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "13px",
                transition: "all 0.2s",
                background:
                  activeRarity === rarity
                    ? "var(--color-primary)"
                    : "var(--color-bg-secondary)",
                color:
                  activeRarity === rarity
                    ? "white"
                    : "var(--color-text-secondary)",
                boxShadow:
                  activeRarity === rarity
                    ? "0 4px 12px rgba(99, 102, 241, 0.3)"
                    : "none",
              }}
            >
              {rarity.charAt(0) + rarity.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Loading / Error States */}
        {loading && (
          <div style={{ padding: "60px", textAlign: "center" }}>
            <div
              className="loading"
              style={{ width: "40px", height: "40px", margin: "0 auto" }}
            />
          </div>
        )}

        {error && (
          <div
            style={{
              textAlign: "center",
              padding: "40px",
              color: "var(--color-accent-rose)",
            }}
          >
            {error}
            <button
              onClick={() => globalThis.location.reload()}
              className="btn btn-secondary"
              style={{ marginTop: "16px" }}
            >
              Try Again
            </button>
          </div>
        )}

        {/* Badges Grid */}
        {!loading && !error && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "20px",
            }}
          >
            <AnimatePresence mode="popLayout">
              {filteredBadges.length === 0 ? (
                <div
                  style={{
                    gridColumn: "1 / -1",
                    textAlign: "center",
                    padding: "40px",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  No badges found in this category.
                </div>
              ) : (
                filteredBadges.map((badge, index) => (
                  <motion.div
                    key={badge.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: index * 0.05 }}
                    className="card hover-lift"
                    style={{
                      padding: "24px",
                      borderRadius: "16px",
                      border: badge.earned
                        ? "1px solid rgba(16, 185, 129, 0.3)"
                        : "1px solid var(--color-border)",
                      background: badge.earned
                        ? "linear-gradient(135deg, rgba(16, 185, 129, 0.05), rgba(99, 102, 241, 0.05))"
                        : "var(--color-bg-secondary)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      textAlign: "center",
                      position: "relative",
                      opacity: badge.earned ? 1 : 0.7,
                      filter: badge.earned ? "none" : "grayscale(0.8)",
                      transition: "all 0.3s",
                    }}
                    onMouseEnter={(e) => {
                      if (!badge.earned)
                        e.currentTarget.style.filter = "grayscale(0)";
                      if (!badge.earned) e.currentTarget.style.opacity = "1";
                    }}
                    onMouseLeave={(e) => {
                      if (!badge.earned)
                        e.currentTarget.style.filter = "grayscale(0.8)";
                      if (!badge.earned) e.currentTarget.style.opacity = "0.7";
                    }}
                  >
                    <div
                      style={{
                        fontSize: "48px",
                        marginBottom: "16px",
                        filter: badge.earned
                          ? "drop-shadow(0 4px 8px rgba(0,0,0,0.2))"
                          : "none",
                        transform: badge.earned ? "scale(1.1)" : "scale(1)",
                      }}
                    >
                      {badge.icon}
                    </div>

                    {badge.earned && (
                      <span
                        style={{
                          position: "absolute",
                          top: "12px",
                          right: "12px",
                          fontSize: "10px",
                          fontWeight: 800,
                          padding: "4px 8px",
                          borderRadius: "20px",
                          background: "var(--color-accent-emerald)",
                          color: "white",
                          boxShadow: "0 2px 4px rgba(16, 185, 129, 0.3)",
                        }}
                      >
                        UNLOCKED
                      </span>
                    )}

                    <h3
                      style={{
                        fontSize: "18px",
                        fontWeight: 700,
                        marginBottom: "8px",
                        color: badge.earned
                          ? "var(--color-text-primary)"
                          : "var(--color-text-secondary)",
                      }}
                    >
                      {badge.name}
                    </h3>

                    <p
                      style={{
                        fontSize: "13px",
                        color: "var(--color-text-secondary)",
                        marginBottom: badge.hasProgress && !badge.earned ? "12px" : "16px",
                        lineHeight: 1.5,
                        flex: 1,
                      }}
                    >
                      {badge.description}
                    </p>

                    {!badge.earned && badge.hasProgress && (
                      <div style={{ width: "100%", marginBottom: "16px" }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "11px",
                            fontWeight: 700,
                            color: "var(--color-text-secondary)",
                            marginBottom: "6px",
                          }}
                        >
                          <span>Progress</span>
                          <span style={{ fontFamily: "monospace" }}>
                            {badge.id.startsWith("earn_") ? `₹${(badge.currentProgress || 0).toLocaleString()}` : (badge.currentProgress || 0)} / {badge.id.startsWith("earn_") ? `₹${(badge.targetProgress || 1).toLocaleString()}` : (badge.targetProgress || 1)}
                          </span>
                        </div>
                        <div
                          style={{
                            width: "100%",
                            height: "6px",
                            borderRadius: "3px",
                            background: "rgba(255, 255, 255, 0.1)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, Math.max(0, ((badge.currentProgress || 0) / (badge.targetProgress || 1)) * 100))}%`,
                              height: "100%",
                              background: "linear-gradient(90deg, #f59e0b, #ef4444)",
                              borderRadius: "3px",
                              transition: "width 0.5s ease-out",
                            }}
                          />
                        </div>
                      </div>
                    )}

                    <div
                      style={{
                        width: "100%",
                        paddingTop: "16px",
                        borderTop: "1px solid var(--color-border)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "12px",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          color: "var(--color-text-muted)",
                        }}
                      >
                        {badge.category}
                      </span>
                      <span
                        style={{
                          fontWeight: 700,
                          color: "var(--color-primary)",
                          background: "rgba(99, 102, 241, 0.1)",
                          padding: "2px 8px",
                          borderRadius: "6px",
                        }}
                      >
                        +{badge.xpReward} XP
                      </span>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

function StatCard({
  label,
  value,
  color,
  delay,
}: {
  readonly label: string;
  readonly value: string;
  readonly color: string;
  readonly delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      style={{
        flex: 1,
        minWidth: "160px",
        padding: "24px",
        borderRadius: "16px",
        background: `linear-gradient(135deg, ${color}11, ${color}05)`,
        border: `1px solid ${color}33`,
        textAlign: "center",
        boxShadow: `0 4px 12px ${color}11`,
      }}
    >
      <div
        style={{
          fontSize: "32px",
          fontWeight: 800,
          color: color,
          marginBottom: "4px",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: "12px",
          fontWeight: 700,
          color: "var(--color-text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "1px",
        }}
      >
        {label}
      </div>
    </motion.div>
  );
}
