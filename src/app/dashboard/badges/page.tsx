"use client";


import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { BadgeDefinition } from "@/lib/badges";
import EmptyState from "@/components/ui/EmptyState";
import { Button } from "@/components/ui";

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

interface BadgesResponse {
  badges?: BadgeWithStatus[];
  stats?: GamificationStats;
}

export default function BadgesPage() {
  const { data: session } = useSession();
  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [activeRarity, setActiveRarity] = useState<string>("ALL");

  const { data, isLoading: loading, error: fetchErr } = useSWR<BadgesResponse>(
    "/api/gamification/badges",
    fetcher
  );

  const badges = data?.badges || [];
  const stats = data?.stats || null;
  const error = fetchErr ? "Failed to load your achievements. Please refresh the page." : "";

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
      <div className="mx-auto" style={{ maxWidth: "1000px" }}>
        {/* Header */}
        <div className="text-center mb-8">
          <h1
            className="font-extrabold mb-2 text-3xl" style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
          >
            🏆 Badges & Achievements
          </h1>
          <p className="text-secondary text-base">
            Collect badges, earn XP, and level up your profile!
          </p>
        </div>

        {/* Stats Summary - Similar to Hall of Fame styling */}
        {stats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center gap-5 flex-wrap mb-10"
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
          className="scrollable-tabs flex mb-4 gap-2-5" style={{ paddingBottom: "8px" }}
        >
          {categories.map((cat) => (
            <Button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              variant={activeCategory === cat ? "primary" : "ghost"}
              className="font-semibold text-sm px-4-py-2" style={{ border: activeCategory === cat ? "none" : "1px solid var(--color-border)", boxShadow:
                  activeCategory === cat
                    ? "0 4px 12px rgba(99, 102, 241, 0.3)"
                    : "none" }}
            >
              {cat.charAt(0) + cat.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>

        {/* Rarity Filter */}
        <div
          className="scrollable-tabs flex mb-8 gap-2-5" style={{ paddingBottom: "8px" }}
        >
          {rarities.map((rarity) => (
            <Button
              key={rarity}
              onClick={() => setActiveRarity(rarity)}
              variant={activeRarity === rarity ? "primary" : "ghost"}
              className="font-semibold text-sm px-4-py-2" style={{ border: activeRarity === rarity ? "none" : "1px solid var(--color-border)", boxShadow:
                  activeRarity === rarity
                    ? "0 4px 12px rgba(99, 102, 241, 0.3)"
                    : "none" }}
            >
              {rarity.charAt(0) + rarity.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>

        {/* Loading / Error States */}
        {loading && (
          <div className="text-center p-10">
            <div
              className="loading mx-auto" style={{ width: "40px", height: "40px" }}
            />
          </div>
        )}

        {error && (
          <div
            className="text-center p-10 text-rose"
          >
            {error}
            <Button
              onClick={() => globalThis.location.reload()}
              variant="secondary"
              className="mt-4"
            >
              Try Again
            </Button>
          </div>
        )}

        {/* Badges Grid */}
        {!loading && !error && (
          <div
            className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
          >
            <AnimatePresence mode="popLayout">
              {filteredBadges.length === 0 ? (
                <EmptyState
                  emoji="🏆"
                  title="No Badges Found"
                  description="No achievements found matching the selected category."
                  compact
                  style={{ gridColumn: "1 / -1" }}
                />
              ) : (
                filteredBadges.map((badge, index) => (
                  <motion.div
                    key={badge.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: index * 0.05 }}
                    className="card hover-lift p-6 flex flex-col items-center text-center relative rounded-xl" style={{ border: badge.earned
                        ? "1px solid rgba(16, 185, 129, 0.3)"
                        : "1px solid var(--color-border)", background: badge.earned
                        ? "linear-gradient(135deg, rgba(16, 185, 129, 0.05), rgba(99, 102, 241, 0.05))"
                        : "var(--color-bg-secondary)", opacity: badge.earned ? 1 : 0.7, filter: badge.earned ? "none" : "grayscale(0.8)", transition: "all 0.3s" }}
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
                      className="mb-4 text-3xl" style={{ filter: badge.earned
                          ? "drop-shadow(0 4px 8px rgba(0,0,0,0.2))"
                          : "none", transform: badge.earned ? "scale(1.1)" : "scale(1)" }}
                    >
                      {badge.icon}
                    </div>

                    {badge.earned && (
                      <span
                        className="absolute font-extrabold rounded-2xl text-2xs px-2-py-1 text-white" style={{ top: "12px", right: "12px", background: "var(--color-accent-emerald)", boxShadow: "0 2px 4px rgba(16, 185, 129, 0.3)" }}
                      >
                        UNLOCKED
                      </span>
                    )}

                    <h3
                      className="text-lg font-bold mb-2" style={{ color: badge.earned
                          ? "var(--color-text-primary)"
                          : "var(--color-text-secondary)" }}
                    >
                      {badge.name}
                    </h3>

                    <p
                      className="text-sm text-secondary flex-1 leading-normal" style={{ marginBottom: badge.hasProgress && !badge.earned ? "12px" : "16px" }}
                    >
                      {badge.description}
                    </p>

                    {!badge.earned && badge.hasProgress && (
                      <div className="w-full mb-4">
                        <div
                          className="flex justify-between font-bold text-secondary text-xs mb-1"
                        >
                          <span>Progress</span>
                          <span className="font-mono">
                            {badge.id.startsWith("earn_") ? `₹${(badge.currentProgress || 0).toLocaleString()}` : (badge.currentProgress || 0)} / {badge.id.startsWith("earn_") ? `₹${(badge.targetProgress || 1).toLocaleString()}` : (badge.targetProgress || 1)}
                          </span>
                        </div>
                        <div
                          className="w-full overflow-hidden" style={{ height: "6px", borderRadius: "3px", background: "rgba(255, 255, 255, 0.1)" }}
                        >
                          <div
                            className="h-full" style={{ width: `${Math.min(100, Math.max(0, ((badge.currentProgress || 0) / (badge.targetProgress || 1)) * 100))}%`, background: "linear-gradient(90deg, #f59e0b, #ef4444)", borderRadius: "3px", transition: "width 0.5s ease-out" }}
                          />
                        </div>
                      </div>
                    )}

                    <div
                      className="w-full flex justify-between items-center text-xs border-top pt-4"
                    >
                      <span
                        className="font-semibold text-muted"
                      >
                        {badge.category}
                      </span>
                      <span
                        className="font-bold text-primary bg-indigo-subtle px-2-py-05 rounded-md"
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
      className="flex-1 p-6 text-center rounded-xl" style={{ minWidth: "160px", background: `linear-gradient(135deg, ${color}11, ${color}05)`, border: `1px solid ${color}33`, boxShadow: `0 4px 12px ${color}11` }}
    >
      <div
        className="font-extrabold mb-1 text-3xl leading-none" style={{ color: color }}
      >
        {value}
      </div>
      <div
        className="text-xs font-bold text-secondary uppercase tracking-wider"
      >
        {label}
      </div>
    </motion.div>
  );
}
