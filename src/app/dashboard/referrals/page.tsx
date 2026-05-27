"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import ReferralList from "@/components/dashboard/referrals/ReferralList";

interface ReferralStats {
  totalReferrals: number;
  activeReferrals: number;
  tier: { name: string; label: string; feeDiscount: number; revenueShare: number; min: number; commission: number };
  earnings: number;
  referralCode: string;
}

export default function ReferralsPage() {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "history">(
    "overview",
  );
  const { data: session } = useSession();

  useEffect(() => {
    fetch("/api/gamification/referrals")
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) setStats(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const copyCode = () => {
    if (stats?.referralCode) {
      navigator.clipboard.writeText(stats.referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading || !session) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="loading"></div>
      </div>
    );
  }

  if (!stats || !stats.tier) {
    return (
      <DashboardShell user={session.user}>
        <div className="text-center py-20">
          <div className="text-2xl font-bold mb-2 text-[var(--color-text-secondary)]">
            Unavailable
          </div>
          <p className="text-[var(--color-text-muted)]">
            Unable to load referral data at this time.
          </p>
        </div>
      </DashboardShell>
    );
  }

  const nextTierMin = stats.tier?.name === "DIAMOND" ? 1000 : (stats as any).nextTier?.min || 10;
  const progress = Math.min((stats.activeReferrals / nextTierMin) * 100, 100);

  return (
    <DashboardShell user={session.user}>
      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "40px 20px" }}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ textAlign: "center", marginBottom: "48px" }}
        >
          <h1 style={{
            fontSize: "42px",
            fontWeight: 900,
            background: "linear-gradient(135deg, #10b981, #06b6d4, #3b82f6)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "-1.5px",
            marginBottom: "12px"
          }}>
            🤝 Partner Network
          </h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "18px", maxWidth: "600px", margin: "0 auto" }}>
            Expand the ReachOut ecosystem and build a lifetime of passive rewards.
          </p>
        </motion.div>

        {/* Tabs - Leaderboard Style */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "40px", maxWidth: "100%" }}>
          <div className="scrollable-tabs" style={{
            background: "rgba(255, 255, 255, 0.03)",
            padding: "6px",
            borderRadius: "16px",
            display: "flex",
            gap: "8px",
            border: "1px solid rgba(255, 255, 255, 0.08)"
          }}>
            {(["overview", "history"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "12px 32px",
                  borderRadius: "12px",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 800,
                  fontSize: "14px",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  background: activeTab === tab ? "var(--gradient-primary)" : "transparent",
                  color: activeTab === tab ? "white" : "var(--color-text-secondary)",
                  boxShadow: activeTab === tab ? "0 10px 20px rgba(99, 102, 241, 0.3)" : "none"
                }}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "overview" ? (
            <motion.div
              key="overview"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.4 }}
            >
              {/* Premium Dashboard Code Card */}
              <motion.div
                style={{
                  padding: "clamp(24px, 5vw, 48px)",
                  background: "rgba(255, 255, 255, 0.03)",
                  backdropFilter: "blur(20px)",
                  borderRadius: "32px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  marginBottom: "48px",
                  textAlign: "center",
                  position: "relative",
                  overflow: "hidden",
                  boxShadow: "0 40px 80px rgba(0,0,0,0.3)"
                }}
              >
                {/* Background Accents */}
                <div style={{
                  position: "absolute",
                  top: -60,
                  right: -60,
                  width: "250px",
                  height: "250px",
                  background: "rgba(16, 185, 129, 0.1)",
                  filter: "blur(100px)",
                  borderRadius: "50%",
                  pointerEvents: "none"
                }} />

                <div style={{ fontSize: "12px", fontWeight: 800, color: "#10b981", textTransform: "uppercase", letterSpacing: "3px", marginBottom: "20px" }}>
                  Your Network Identifier
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "20px", marginBottom: "40px" }}>
                  <div style={{
                    fontSize: "clamp(28px, 6vw, 64px)",
                    fontWeight: 900,
                    fontFamily: "Space Grotesk, sans-serif",
                    background: "linear-gradient(to bottom, #fff, #999)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    letterSpacing: "clamp(1px, 1vw, 4px)",
                    filter: "drop-shadow(0 0 15px rgba(16, 185, 129, 0.3))",
                    wordBreak: "break-all"
                  }}>
                    {stats.referralCode}
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={copyCode}
                    style={{
                      background: copied ? "#10b981" : "white",
                      color: copied ? "white" : "black",
                      border: "none",
                      width: "56px",
                      height: "56px",
                      borderRadius: "18px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "20px",
                      cursor: "pointer",
                      transition: "all 0.3s",
                      boxShadow: "0 10px 20px rgba(0,0,0,0.2)"
                    }}
                  >
                    {copied ? "✓" : "📋"}
                  </motion.button>
                </div>

                {/* Stats Grid - Leaderboard Podium Style */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "20px" }}>
                  <StatBox label="Current Rank" value={stats.tier.label} color="#10b981" icon="🎖️" />
                  <StatBox
                    label={(stats as any).tier.revenueShare > 0 ? "Network Share" : "Fee Bonus"}
                    value={(stats as any).tier.revenueShare > 0 ? `${(stats as any).tier.revenueShare * 100}%` : `${(stats as any).tier.feeDiscount}%`}
                    color="#06b6d4"
                    icon="🌪️"
                  />
                  <StatBox label="Total Earnings" value={`₹${(stats.earnings / 100).toLocaleString()}`} color="#f59e0b" icon="💰" />
                </div>
              </motion.div>

              {/* Progress & Tiers */}
              <div style={{ marginBottom: "64px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
                  <h3 style={{ fontSize: "22px", fontWeight: 900, color: "white" }}>Milestone Progress 🚀</h3>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--color-text-secondary)" }}>
                    <span style={{ color: "#10b981", fontSize: "20px" }}>{stats.activeReferrals}</span> / {nextTierMin} ACTIVE PARTNERS
                  </div>
                </div>

                <div style={{ height: "14px", background: "rgba(255,255,255,0.05)", borderRadius: "20px", overflow: "hidden", marginBottom: "32px", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 1.5, ease: "circOut" }}
                    style={{ height: "100%", background: "linear-gradient(90deg, #10b981, #06b6d4, #3b82f6)", boxShadow: "0 0 20px rgba(16, 185, 129, 0.4)" }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "16px" }}>
                  <TierCard name="BRONZE" percent="1%" min="10" active={stats.tier.label === "Bronze"} color="#cd7f32" delay={0.1} />
                  <TierCard name="SILVER" percent="1.5%" min="50" active={stats.tier.label === "Silver"} color="#c0c0c0" delay={0.2} />
                  <TierCard name="GOLD" percent="2%" min="100" active={stats.tier.label === "Gold"} color="#ffd700" delay={0.3} />
                  <TierCard name="PLATINUM" percent="1% GMV" min="500" active={stats.tier.label === "Platinum"} color="#e5e4e2" delay={0.4} />
                  <TierCard name="DIAMOND" percent="2% GMV" min="1000" active={stats.tier.label === "Diamond"} color="#b9f2ff" delay={0.5} />
                </div>
              </div>

              {/* Steps Guide */}
              <div style={{ background: "rgba(255,255,255,0.02)", padding: "40px", borderRadius: "32px", border: "1px solid rgba(255,255,255,0.05)" }}>
                <h3 style={{ fontSize: "22px", fontWeight: 900, marginBottom: "32px", textAlign: "center" }}>Partnership Roadmap 🗺️</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "24px" }}>
                  <StepCard num="01" title="Broadcast" desc="Deploy your unique code across your socials and network." icon="📢" />
                  <StepCard num="02" title="Activation" desc="Referrals join and complete their first verified brand deal." icon="⚡" />
                  <StepCard num="03" title="Monetize" desc="Unlock scaling GMV shares and permanent fee discounts." icon="💎" />
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="history"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.4 }}
              style={{
                background: "rgba(255, 255, 255, 0.02)",
                padding: "32px",
                borderRadius: "24px",
                border: "1px solid rgba(255, 255, 255, 0.05)"
              }}
            >
              <ReferralList />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DashboardShell>
  );
}

function StatBox({ label, value, color, icon }: any) {
  return (
    <div style={{
      background: "rgba(0, 0, 0, 0.2)",
      padding: "24px",
      borderRadius: "20px",
      border: `1px solid ${color}22`,
      textAlign: "center"
    }}>
      <div style={{ fontSize: "24px", marginBottom: "8px" }}>{icon}</div>
      <div style={{ fontSize: "22px", fontWeight: 900, color: "white", marginBottom: "4px" }}>{value}</div>
      <div style={{ fontSize: "11px", fontWeight: 800, color, textTransform: "uppercase", letterSpacing: "1px" }}>{label}</div>
    </div>
  );
}

function TierCard({ name, percent, min, active, color, delay }: any) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      whileHover={{ y: -5 }}
      style={{
        background: active ? `linear-gradient(135deg, ${color}33, ${color}11)` : "rgba(255,255,255,0.02)",
        border: active ? `1px solid ${color}` : "1px solid rgba(255,255,255,0.05)",
        padding: "24px 16px",
        borderRadius: "20px",
        textAlign: "center",
        boxShadow: active ? `0 10px 30px ${color}22` : "none"
      }}
    >
      <div style={{ fontSize: "12px", fontWeight: 800, color: active ? "white" : "var(--color-text-muted)", marginBottom: "8px" }}>{name}</div>
      <div style={{ fontSize: "22px", fontWeight: 900, color: active ? color : "white", marginBottom: "4px" }}>{percent}</div>
      <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--color-text-muted)" }}>{min}+ ACTIVE</div>
    </motion.div>
  );
}

function StepCard({ num, title, desc, icon }: any) {
  return (
    <div style={{
      padding: "24px",
      background: "rgba(0, 0, 0, 0.2)",
      borderRadius: "24px",
      border: "1px solid rgba(255, 255, 255, 0.05)",
      position: "relative"
    }}>
      <div style={{ position: "absolute", top: "12px", right: "20px", fontSize: "32px", fontWeight: 900, color: "rgba(255,255,255,0.03)" }}>{num}</div>
      <div style={{ fontSize: "32px", marginBottom: "16px" }}>{icon}</div>
      <div style={{ fontSize: "18px", fontWeight: 800, color: "white", marginBottom: "8px" }}>{title}</div>
      <div style={{ fontSize: "14px", color: "var(--color-text-secondary)", lineHeight: "1.5" }}>{desc}</div>
    </div>
  );
}
