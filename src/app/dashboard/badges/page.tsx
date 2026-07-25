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
      <div className="mx-auto max-w-1000">
        {/* Header */}
        <div className="text-center mb-8">
          <h1
            className="badges-title font-extrabold mb-2 text-3xl bg-gradient-amber-rose"
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
          className="scrollable-tabs flex mb-4 gap-2-5 pb-2"
        >
          {categories.map((cat) => (
            <Button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              variant={activeCategory === cat ? "primary" : "ghost"}
              className="badges-filter-btn font-semibold text-sm px-4-py-2"
              data-active={activeCategory === cat}
            >
              {cat.charAt(0) + cat.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>

        {/* Rarity Filter */}
        <div
          className="scrollable-tabs flex mb-8 gap-2-5 pb-2"
        >
          {rarities.map((rarity) => (
            <Button
              key={rarity}
              onClick={() => setActiveRarity(rarity)}
              variant={activeRarity === rarity ? "primary" : "ghost"}
              className="badges-filter-btn font-semibold text-sm px-4-py-2"
              data-active={activeRarity === rarity}
            >
              {rarity.charAt(0) + rarity.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>

        {/* Loading / Error States */}
        {loading && (
          <div className="text-center p-10">
            <div
              className="loading mx-auto w-40 h-40"
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
            className="grid gap-5 grid-auto-280"
          >
            <AnimatePresence mode="popLayout">
              {filteredBadges.length === 0 ? (
                <EmptyState
                  emoji="🏆"
                  title="No Badges Found"
                  description="No achievements found matching the selected category."
                  compact
                  className="grid-full"
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
                    className="badge-card card hover-lift p-6 flex flex-col items-center text-center relative rounded-xl"
                    data-earned={badge.earned}
                  >
                    <div
                      className="badge-card-icon mb-4 text-3xl"
                      data-earned={badge.earned}
                    >
                      {badge.icon}
                    </div>

                    {badge.earned && (
                      <span
                        className="badge-unlocked absolute font-extrabold rounded-2xl text-2xs px-2-py-1 text-white"
                      >
                        UNLOCKED
                      </span>
                    )}

                    <h3
                      className="badge-card-name text-lg font-bold mb-2"
                      data-earned={badge.earned}
                    >
                      {badge.name}
                    </h3>

                    <p
                      className="badge-card-description text-sm text-secondary flex-1 leading-normal"
                      data-has-progress={Boolean(badge.hasProgress && !badge.earned)}
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
                        <progress
                          className="badge-progress w-full"
                          value={Math.min(100, Math.max(0, ((badge.currentProgress || 0) / (badge.targetProgress || 1)) * 100))}
                          max={100}
                          aria-label={`${badge.name} progress`}
                        />
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
      className="badge-stat-card flex-1 p-6 text-center rounded-xl"
      data-tone={color === "#8b5cf6" ? "purple" : color === "#f59e0b" ? "amber" : "emerald"}
    >
      <div
        className="badge-stat-value font-extrabold mb-1 text-3xl leading-none"
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
