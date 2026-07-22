"use client";


import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import EmptyState from "@/components/ui/EmptyState";
import { Button, Select } from "@/components/ui";

const rankColorMap: Record<number, string> = {
  0: "#ffd700",
  1: "#c0c0c0",
  2: "#cd7f32",
};

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

  const params = new URLSearchParams({ filter });
  if (city) params.set("city", city);
  if (category) params.set("category", category);

  const { data: leaderboardData, isLoading: loading, error: fetchErr } = useSWR<{ influencers?: LeaderboardUser[]; brands?: LeaderboardUser[]; hallOfFame?: HallOfFameUser[] }>(
    `/api/gamification/leaderboard?${params.toString()}`,
    fetcher
  );

  const influencers: LeaderboardUser[] = leaderboardData?.influencers || [];
  const brands: LeaderboardUser[] = leaderboardData?.brands || [];
  const hallOfFame: HallOfFameUser[] = leaderboardData?.hallOfFame || [];
  const error = fetchErr ? "Failed to load leaderboard. Please try again later." : null;

  const activeList = tab === "influencers" ? influencers : brands;
  let scoreLabel = "";
  if (tab === "influencers") {
    scoreLabel = filter === "weekly" ? "Deals This Week" : "XP";
  } else {
    scoreLabel = filter === "weekly" ? "Deals This Week" : "Trust Score";
  }

  let leaderboardContent;
  if (loading) {
    leaderboardContent = Array.from({ length: 5 }).map((_, idx) => (
      <div
        key={"skeleton-" + idx}
        className="rounded-lg bg-secondary opacity-50" style={{ height: "64px", animation: "pulse 2s ease-in-out infinite" }}
      />
    ));
  } else if (error) {
    leaderboardContent = (
      <div
        className="text-center p-10 text-rose"
      >
        {error}
        <Button
          onClick={() => globalThis.location.reload()}
          variant="primary"
          className="mt-4 px-4-py-2"
        >
          Retry
        </Button>
      </div>
    );
  } else if (activeList.length === 0) {
    leaderboardContent = (
      <EmptyState
        emoji="🏆"
        title="No Rankings Found"
        description="No users match the selected leaderboard filters at the moment."
        compact
      />
    );
  } else {
    leaderboardContent = activeList.map((user, index) => (
      <motion.div
        key={user.id}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.03 }}
        className="grid items-center cursor-pointer rounded-lg px-4-py-3" style={{ gridTemplateColumns: "40px 1fr 100px 80px", background:
            index < 3
              ? "linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(139, 92, 246, 0.05))"
              : "var(--color-bg-secondary)", border:
            index === 0
              ? "1px solid rgba(245, 158, 11, 0.3)"
              : "1px solid transparent", transition: "all 0.2s" }}
        whileHover={{ x: 4 }}
      >
        {/* Rank */}
        <span
          className="font-extrabold" style={{ fontSize: index < 3 ? "20px" : "14px", color: rankColorMap[index] || "var(--color-text-secondary)" }}
        >
          {index < 3 ? ["🥇", "🥈", "🥉"][index] : index + 1}
        </span>

        {/* User Info */}
        <div
          className="flex items-center gap-3"
        >
          <div
            className="flex items-center justify-center text-base font-bold overflow-hidden rounded-full text-white" style={{ width: "40px", height: "40px", background: `linear-gradient(135deg, hsl(${(index * 40) % 360}, 70%, 50%), hsl(${(index * 40 + 60) % 360}, 70%, 60%))` }}
          >
            {user.avatar ? (
              <Image
                src={user.avatar}
                alt={user.name + " avatar"}
                fill
                unoptimized
                className="object-cover"
              />
            ) : (
              user.name?.charAt(0)?.toUpperCase() || "?"
            )}
          </div>
          <div>
            <div
              className="font-semibold text-sm flex items-center gap-1-5"
            >
              {user.name || "Anonymous"}
              {user.isWeeklyChampion && (
                <span
                  className="font-bold text-amber text-2xs px-2-py-05 rounded-md" style={{ background: "rgba(245, 158, 11, 0.2)" }}
                >
                  🔥 HOT
                </span>
              )}
            </div>
            <div
              className="text-xs text-secondary"
            >
              {user.subtitle}
              {user.city ? ` • ${user.city}` : ""}
            </div>
          </div>
        </div>

        {/* Score */}
        <div
          className="text-right font-bold text-sm text-primary"
        >
          {typeof user.score === "number"
            ? user.score.toLocaleString()
            : user.score}
        </div>

        {/* Level */}
        <div className="text-right">
          <span
            className="text-xs font-bold rounded-md px-2-py-1" style={{ background: "rgba(139, 92, 246, 0.15)", color: "#a855f7" }}
          >
            Lv.{user.level}
          </span>
        </div>
      </motion.div>
    ));
  }

  if (!session) {
    return (
      <DashboardShell user={null}>
        <div className="flex items-center justify-center min-h-60vh">
          <span className="loading" />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell user={session.user}>
      <div className="max-w-900 mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1
            className="font-extrabold text-3xl bg-gradient-amber-rose" style={{ WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
          >
            🏆 Leaderboard
          </h1>
          <p className="text-secondary mt-2">
            Top performers on CollabX
          </p>
        </div>

        {/* Filter Controls */}
        <div
          className="scrollable-tabs flex gap-3 mb-6 items-center pb-2"
        >
          {/* Influencer/Brand Toggle */}
          <div
            className="flex bg-secondary rounded-lg p-1"
          >
            {(["influencers", "brands"] as const).map((t) => (
              <Button
                key={t}
                onClick={() => setTab(t)}
                variant={tab === t ? "primary" : "ghost"}
                className="font-semibold text-sm px-4-py-2 rounded-lg" style={{ transition: "all 0.2s", color: tab === t ? "white" : "var(--color-text-secondary)" }}
              >
                {t === "influencers" ? "👤 Creators" : "🏢 Brands"}
              </Button>
            ))}
          </div>

          {/* Weekly/All-time Toggle */}
          <div
            className="flex bg-secondary rounded-lg p-1"
          >
            {(["all-time", "weekly"] as const).map((f) => (
              <Button
                key={f}
                onClick={() => setFilter(f)}
                variant={filter === f ? (f === "weekly" ? "warning" : "primary") : "ghost"}
                className="font-semibold text-sm px-4-py-2 rounded-lg" style={{ transition: "all 0.2s", color: filter === f ? "white" : "var(--color-text-secondary)" }}
              >
                {f === "weekly" ? "🔥 This Week" : "🏛️ All-Time"}
              </Button>
            ))}
          </div>

          {/* City Filter */}
          <Select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="px-2-py-1" style={{ width: "160px" }}
          >
            <option value="">🏙️ All Cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>

          {/* Category Filter */}
          {tab === "influencers" && (
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-2-py-1 w-180"
            >
              <option value="">📂 All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </div>

        {/* Hall of Fame Section (all-time only) */}
        {filter === "all-time" &&
          tab === "influencers" &&
          hallOfFame.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-center items-end gap-4 flex-wrap mb-10 rounded-xl" style={{ padding: "32px 16px", background:
                  "linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(239, 68, 68, 0.08))", border: "1px solid rgba(245, 158, 11, 0.2)" }}
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
              className="flex items-center gap-4 mb-6 flex-wrap p-5 rounded-xl" style={{ background:
                  "linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(239, 68, 68, 0.15))", border: "2px solid #f59e0b" }}
            >
              <div className="text-3xl">🔥</div>
              <div>
                <div
                  className="font-bold text-xs text-amber uppercase tracking-wider"
                >
                  🏆 HOT CREATOR OF THE WEEK
                </div>
                <div
                  className="text-xl font-extrabold mt-1 text-primary"
                >
                  {influencers[0].name}
                </div>
                <div
                  className="text-sm text-secondary"
                >
                  {influencers[0].score} deals completed this week
                </div>
              </div>
            </motion.div>
          )}

        {/* Leaderboard List */}
        <div className="flex flex-col gap-2">
          {/* Header Row */}
          <div
            className="grid font-bold text-secondary text-xs uppercase px-4-py-2 tracking-wider" style={{ gridTemplateColumns: "40px 1fr 100px 80px" }}
          >
            <span>#</span>
            <span>Name</span>
            <span className="text-right">{scoreLabel}</span>
            <span className="text-right">Level</span>
          </div>

          <AnimatePresence>
            {leaderboardContent}
          </AnimatePresence>
        </div>
      </div>
    </DashboardShell>
  );
}

interface PodiumUserProps {
  readonly user: HallOfFameUser;
  readonly rank: number;
  readonly color: string;
  readonly height: number;
  readonly delay: number;
  readonly isFirst?: boolean;
  readonly unit: string;
}

function PodiumUser({
  user,
  rank,
  color,
  height,
  delay,
  isFirst,
  unit,
}: PodiumUserProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      className="flex flex-col items-center gap-2"
    >
      {isFirst && <div className="text-3xl">👑</div>}
      <div
        className="flex items-center justify-center font-bold overflow-hidden rounded-full text-white" style={{ width: isFirst ? "64px" : "52px", height: isFirst ? "64px" : "52px", background: `linear-gradient(135deg, ${color}, ${color}88)`, border: `3px solid ${color}`, fontSize: isFirst ? "24px" : "18px", boxShadow: `0 0 20px ${color}44` }}
      >
        {user.avatar ? (
          <Image
            src={user.avatar}
            alt=""
            fill
            unoptimized
            className="object-cover"
          />
        ) : (
          user.name?.charAt(0)?.toUpperCase() || "?"
        )}
      </div>
      <div
        className="font-bold text-center" style={{ fontSize: isFirst ? "15px" : "13px", maxWidth: "100px" }}
      >
        {user.name || "Anonymous"}
      </div>
      <div
        className="flex items-center justify-center flex-col gap-1" style={{ width: isFirst ? "100px" : "80px", height: `${height}px`, borderRadius: "12px 12px 0 0", background: `linear-gradient(to top, ${color}33, ${color}11)`, border: `1px solid ${color}44` }}
      >
        <div
          className="font-extrabold" style={{ fontSize: isFirst ? "22px" : "18px", color }}
        >
          {rank}
        </div>
        <div className="text-secondary text-xs">
          {user.xp.toLocaleString()} {unit}
        </div>
      </div>
    </motion.div>
  );
}
