"use client";


import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import ReferralList from "@/components/dashboard/referrals/ReferralList";
import { Button } from "@/components/ui";

interface ReferralStats {
  totalReferrals: number;
  activeReferrals: number;
  tier: { name: string; label: string; feeDiscount: number; revenueShare: number; min: number; commission: number };
  nextTier?: { min: number };
  earnings: number;
  referralCode: string;
}

// ── Share Modal ──────────────────────────────────────────────────────────────

interface ShareModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly referralCode: string;
  readonly referralLink: string;
}

function ShareModal({ open, onClose, referralCode, referralLink }: ShareModalProps) {
  const [linkCopied, setLinkCopied] = useState(false);

  const shareText = `Join me on Decisional — India's most trusted influencer-brand deal platform! Use my referral code ${referralCode} and get started. 🚀`;

  const handleCopyLink = useCallback(async () => {
    await navigator.clipboard.writeText(referralLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
  }, [referralLink]);

  const handleNativeShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join Decisional", text: shareText, url: referralLink });
      } catch {
        // User cancelled — no-op
      }
    }
  }, [shareText, referralLink]);

  const whatsappText = shareText + "\n" + referralLink;
  const channels: { id: string; label: string; icon: string; color: string; bg: string; href: string }[] = [
    {
      id: "whatsapp",
      label: "WhatsApp",
      icon: "📱",
      color: "#25d366",
      bg: "rgba(37,211,102,0.12)",
      href: `https://wa.me/?text=${encodeURIComponent(whatsappText)}`,
    },
    {
      id: "twitter",
      label: "X (Twitter)",
      icon: "𝕏",
      color: "#e7e9ea",
      bg: "rgba(231,233,234,0.08)",
      href: `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(referralLink)}`,
    },
    {
      id: "linkedin",
      label: "LinkedIn",
      icon: "in",
      color: "#0a66c2",
      bg: "rgba(10,102,194,0.15)",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralLink)}`,
    },
  ];

  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={handleBackdropClick}
          className="fixed flex items-center justify-center p-5 inset-0 backdrop-blur" style={{ zIndex: 1000, background: "rgba(0,0,0,0.7)" }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="w-full relative overflow-hidden" style={{ background: "linear-gradient(160deg, rgba(20,20,35,0.98) 0%, rgba(12,12,24,0.98) 100%)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "28px", padding: "clamp(24px,5vw,40px)", maxWidth: "480px", boxShadow: "0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.15)" }}
          >
            {/* Glow accent */}
            <div className="absolute pointer-events-none" style={{ top: -80, left: "50%", transform: "translateX(-50%)", width: "300px", height: "200px", background: "rgba(99,102,241,0.2)", filter: "blur(80px)" }} />

            {/* Header */}
            <div className="flex items-center justify-between relative mb-6">
              <div>
                <div className="font-extrabold text-xs uppercase mb-1" style={{ color: "#6366f1", letterSpacing: "3px" }}>
                  Share &amp; Earn
                </div>
                <h2 className="font-extrabold text-2xl text-white m-0">
                  Invite Your Network 🚀
                </h2>
              </div>
              <Button
                variant="ghost"
                onClick={onClose}
                aria-label="Close share modal"
                className="text-lg flex-shrink-0 p-0" style={{ width: "36px", height: "36px" }}
              >
                ×
              </Button>
            </div>

            {/* Referral link */}
            <div className="mb-6 flex items-center gap-3 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", padding: "14px 16px", minWidth: 0 }}>
              <div className="flex-1" style={{ minWidth: 0 }}>
                <div className="font-bold text-muted mb-1 uppercase text-2xs tracking-wider">
                  Your Referral Link
                </div>
                <div className="text-sm font-semibold text-secondary overflow-hidden whitespace-nowrap font-mono" style={{ textOverflow: "ellipsis" }}>
                  {referralLink}
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={handleCopyLink}
                aria-label="Copy referral link"
                className="text-xs font-bold cursor-pointer flex-shrink-0 flex items-center border-none px-4-py-2 whitespace-nowrap text-white rounded-lg gap-1-5" style={{ background: linkCopied ? "#10b981" : "var(--color-primary)", transition: "background 0.2s" }}
              >
                {linkCopied ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy Link
                  </>
                )}
              </motion.button>
            </div>

            {/* Share channels */}
            <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              {channels.map((ch) => (
                <motion.a
                  key={ch.id}
                  href={ch.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ y: -3, scale: 1.03 }}
                  whileTap={{ scale: 0.96 }}
                  className="text-center flex flex-col items-center gap-2 cursor-pointer rounded-xl no-underline" style={{ background: ch.bg, border: `1px solid ${ch.color}33`, padding: "16px 8px" }}
                >
                  <span className="font-extrabold leading-none" style={{ fontSize: ch.id === "twitter" ? "18px" : "22px", color: ch.color }}>
                    {ch.icon}
                  </span>
                  <span className="font-bold text-secondary text-xs whitespace-nowrap">
                    {ch.label}
                  </span>
                </motion.a>
              ))}
            </div>

            {/* Native share — shown only on devices that support it */}
            {typeof navigator !== "undefined" && "share" in navigator && (
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={handleNativeShare}
                className="w-full text-sm font-bold cursor-pointer flex items-center justify-center gap-2 p-3.5" style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: "14px", color: "#a5b4fc" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                Share via Device
              </motion.button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

export default function ReferralsPage() {
  const { data: session } = useSession();
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "history">("overview");

  const { data: stats, isLoading: loading } = useSWR<ReferralStats>(
    "/api/gamification/referrals",
    fetcher
  );

  const copyCode = () => {
    if (stats?.referralCode) {
      navigator.clipboard.writeText(stats.referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  let referralLink = "";
  if (stats?.referralCode) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    referralLink = `${origin}/register?ref=${stats.referralCode}`;
  }

  if (loading || !session) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="loading"></div>
      </div>
    );
  }

  if (!stats?.tier) {
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

  const nextTierMin = stats.tier?.name === "DIAMOND" ? 1000 : stats.nextTier?.min || 10;
  const progress = Math.min((stats.activeReferrals / nextTierMin) * 100, 100);

  return (
    <DashboardShell user={session.user}>
      <div className="mx-auto" style={{ maxWidth: "1000px", padding: "40px 20px" }}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <h1 className="mb-3 font-extrabold" style={{ fontSize: "42px", background: "linear-gradient(135deg, #10b981, #06b6d4, #3b82f6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "-1.5px" }}>
            🤝 Partner Network
          </h1>
          <p className="text-secondary text-lg max-w-600 mx-auto">
            Expand the Decisional ecosystem and build a lifetime of passive rewards.
          </p>
        </motion.div>

        {/* Tabs */}
        <div className="flex justify-center mb-10">
          <div className="scrollable-tabs flex gap-2 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", padding: "6px", border: "1px solid rgba(255,255,255,0.08)" }}>
            {(["overview", "history"] as const).map((tab) => (
              <Button
                key={tab}
                variant={activeTab === tab ? "primary" : "ghost"}
                onClick={() => setActiveTab(tab)}
                className="font-extrabold text-sm uppercase tracking-wider" style={{ padding: "12px 32px", boxShadow: activeTab === tab ? "0 10px 20px rgba(99,102,241,0.3)" : "none" }}
              >
                {tab}
              </Button>
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
              {/* Code Card */}
              <motion.div
                className="text-center relative overflow-hidden mb-10 backdrop-blur-lg" style={{ padding: "clamp(24px,5vw,48px)", background: "rgba(255,255,255,0.03)", borderRadius: "32px", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 40px 80px rgba(0,0,0,0.3)" }}
              >
                <div className="absolute rounded-full bg-emerald-subtle pointer-events-none" style={{ top: -60, right: -60, width: "250px", height: "250px", filter: "blur(100px)" }} />

                <div className="text-xs font-extrabold mb-5 text-emerald uppercase" style={{ letterSpacing: "3px" }}>
                  Your Network Identifier
                </div>

                {/* Code box */}
                <div className="flex flex-col items-center gap-4 mb-8">
                  <div className="flex items-center gap-4 justify-between bg-secondary rounded-2xl" style={{ border: "2px dashed var(--color-primary)", padding: "14px 24px", maxWidth: "100%" }}>
                    <span className="font-extrabold text-primary break-all tracking-wider" style={{ fontSize: "clamp(18px,4.5vw,32px)", fontFamily: "Space Grotesk, monospace" }}>
                      {stats.referralCode}
                    </span>
                    <motion.button
                      whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      onClick={copyCode}
                      aria-label="Copy referral code"
                      className="cursor-pointer flex items-center justify-center flex-shrink-0 border-none rounded-lg text-white" style={{ background: copied ? "#10b981" : "var(--color-primary)", width: "44px", height: "44px", boxShadow: "0 4px 12px rgba(99,102,241,0.2)", transition: "all 0.2s ease" }}
                    >
                      {copied ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      )}
                    </motion.button>
                  </div>
                  {copied && (
                    <motion.span
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-sm font-bold text-emerald"
                    >
                      Copied to clipboard!
                    </motion.span>
                  )}
                </div>

                {/* ── Share Button ── */}
                <motion.button
                  whileHover={{ scale: 1.04, boxShadow: "0 16px 40px rgba(99,102,241,0.4)" }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setShareOpen(true)}
                  id="share-referral-btn"
                  aria-label="Share referral link"
                  className="font-extrabold cursor-pointer inline-flex items-center mb-8 border-none rounded-xl text-sm text-white gap-2-5" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", padding: "14px 32px", boxShadow: "0 8px 24px rgba(99,102,241,0.3)", letterSpacing: "0.3px" }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                  Share with Friends
                </motion.button>

                {/* Stats */}
                <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                  <StatBox label="Current Rank" value={stats.tier.label} color="#10b981" icon="🎖️" />
                  <StatBox
                    label={stats.tier.revenueShare > 0 ? "Network Share" : "Fee Bonus"}
                    value={stats.tier.revenueShare > 0 ? `${stats.tier.revenueShare * 100}%` : `${stats.tier.feeDiscount}%`}
                    color="#06b6d4" icon="🌪️"
                  />
                  <StatBox label="Total Earnings" value={`₹${(stats.earnings / 100).toLocaleString()}`} color="#f59e0b" icon="💰" />
                </div>
              </motion.div>

              {/* Progress & Tiers */}
              <div style={{ marginBottom: "64px" }}>
                <div className="flex justify-between items-end mb-5 flex-wrap gap-3">
                  <h3 className="font-extrabold text-2xl text-white">Milestone Progress 🚀</h3>
                  <div className="font-bold text-secondary text-sm">
                    <span className="text-xl text-emerald">{stats.activeReferrals}</span> / {nextTierMin} ACTIVE PARTNERS
                  </div>
                </div>
                <div className="overflow-hidden mb-8 rounded-2xl" style={{ height: "14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 1.5, ease: "circOut" }}
                    className="h-full" style={{ background: "linear-gradient(90deg, #10b981, #06b6d4, #3b82f6)", boxShadow: "0 0 20px rgba(16,185,129,0.4)" }}
                  />
                </div>
                <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                  <TierCard name="BRONZE"   percent="1%"     min="10"   active={stats.tier.label === "Bronze"}   color="#cd7f32" delay={0.1} />
                  <TierCard name="SILVER"   percent="1.5%"   min="50"   active={stats.tier.label === "Silver"}   color="#c0c0c0" delay={0.2} />
                  <TierCard name="GOLD"     percent="2%"     min="100"  active={stats.tier.label === "Gold"}     color="#ffd700" delay={0.3} />
                  <TierCard name="PLATINUM" percent="1% GMV" min="500"  active={stats.tier.label === "Platinum"} color="#e5e4e2" delay={0.4} />
                  <TierCard name="DIAMOND"  percent="2% GMV" min="1000" active={stats.tier.label === "Diamond"}  color="#b9f2ff" delay={0.5} />
                </div>
              </div>

              {/* Steps */}
              <div className="p-10" style={{ background: "rgba(255,255,255,0.02)", borderRadius: "32px", border: "1px solid rgba(255,255,255,0.05)" }}>
                <h3 className="mb-8 text-center font-extrabold text-2xl">Partnership Roadmap 🗺️</h3>
                <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))" }}>
                  <StepCard num="01" title="Broadcast"  desc="Deploy your unique code across your socials and network."       icon="📢" />
                  <StepCard num="02" title="Activation" desc="Referrals join and complete their first verified brand deal."    icon="⚡" />
                  <StepCard num="03" title="Monetize"   desc="Unlock scaling GMV shares and permanent fee discounts."         icon="💎" />
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
              className="p-8" style={{ background: "rgba(255,255,255,0.02)", borderRadius: "24px", border: "1px solid rgba(255,255,255,0.05)" }}
            >
              <ReferralList />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Share Modal */}
      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        referralCode={stats.referralCode}
        referralLink={referralLink}
      />
    </DashboardShell>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

interface StatBoxProps {
  readonly label: string;
  readonly value: string | number;
  readonly color: string;
  readonly icon: string;
}
function StatBox({ label, value, color, icon }: StatBoxProps) {
  return (
    <div className="p-6 text-center rounded-2xl" style={{ background: "rgba(0,0,0,0.2)", border: `1px solid ${color}22` }}>
      <div className="text-2xl mb-2">{icon}</div>
      <div className="mb-1 font-extrabold text-2xl text-white">{value}</div>
      <div className="text-xs uppercase tracking-wider" style={{ fontWeight: 800, color }}>{label}</div>
    </div>
  );
}

interface TierCardProps {
  readonly name: string;
  readonly percent: string;
  readonly min: string;
  readonly active: boolean;
  readonly color: string;
  readonly delay: number;
}
function TierCard({ name, percent, min, active, color, delay }: TierCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay }} whileHover={{ y: -5 }}
      className="text-center rounded-2xl" style={{ background: active ? `linear-gradient(135deg, ${color}33, ${color}11)` : "rgba(255,255,255,0.02)", border: active ? `1px solid ${color}` : "1px solid rgba(255,255,255,0.05)", padding: "24px 16px", boxShadow: active ? `0 10px 30px ${color}22` : "none" }}
    >
      <div className="text-xs font-extrabold mb-2" style={{ color: active ? "white" : "var(--color-text-muted)" }}>{name}</div>
      <div className="mb-1 font-extrabold text-2xl" style={{ color: active ? color : "white" }}>{percent}</div>
      <div className="font-bold text-muted text-2xs">{min}+ ACTIVE</div>
    </motion.div>
  );
}

interface StepCardProps {
  readonly num: string;
  readonly title: string;
  readonly desc: string;
  readonly icon: string;
}
function StepCard({ num, title, desc, icon }: StepCardProps) {
  return (
    <div className="p-6 relative" style={{ background: "rgba(0,0,0,0.2)", borderRadius: "24px", border: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="absolute text-3xl font-extrabold" style={{ top: "12px", right: "20px", color: "rgba(255,255,255,0.03)" }}>{num}</div>
      <div className="mb-4 text-3xl">{icon}</div>
      <div className="text-lg font-extrabold mb-2 text-white">{title}</div>
      <div className="text-sm text-secondary leading-normal">{desc}</div>
    </div>
  );
}
