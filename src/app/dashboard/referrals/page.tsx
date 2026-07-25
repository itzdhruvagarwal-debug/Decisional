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
          className="referral-modal-overlay fixed flex items-center justify-center p-5 inset-0 backdrop-blur z-1000"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="referral-share-modal w-full relative overflow-hidden"
          >
            {/* Glow accent */}
            <div className="referral-share-glow absolute pointer-events-none" />

            {/* Header */}
            <div className="flex items-center justify-between relative mb-6">
              <div>
                <div className="font-extrabold text-xs uppercase mb-1 text-indigo tracking-widest">
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
                className="text-lg flex-shrink-0 p-0 w-36 h-36"
              >
                ×
              </Button>
            </div>

            {/* Referral link */}
            <div className="referral-link-box mb-6 flex items-center gap-3 rounded-xl min-w-0 bg-glass-card">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-muted mb-1 uppercase text-2xs tracking-wider">
                  Your Referral Link
                </div>
                <div className="text-sm font-semibold text-secondary overflow-hidden whitespace-nowrap font-mono text-ellipsis">
                  {referralLink}
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={handleCopyLink}
                aria-label="Copy referral link"
                className="referral-copy-btn text-xs font-bold cursor-pointer flex-shrink-0 flex items-center border-none px-4-py-2 whitespace-nowrap text-white rounded-lg gap-1-5"
                data-copied={linkCopied}
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
            <div className="grid gap-3 mb-4 grid-cols-3">
              {channels.map((ch) => (
                <motion.a
                  key={ch.id}
                  href={ch.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ y: -3, scale: 1.03 }}
                  whileTap={{ scale: 0.96 }}
                  className="referral-channel text-center flex flex-col items-center gap-2 cursor-pointer rounded-xl no-underline"
                  data-channel={ch.id}
                >
                  <span className="referral-channel-icon font-extrabold leading-none">
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
                className="referral-native-share w-full text-sm font-bold cursor-pointer flex items-center justify-center gap-2 p-3.5 rounded-lg bg-indigo-12 text-indigo-light"
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
      <div className="referrals-page mx-auto max-w-1000">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <h1 className="referrals-title mb-3 font-extrabold text-5xl">
            🤝 Partner Network
          </h1>
          <p className="text-secondary text-lg max-w-600 mx-auto">
            Expand the Decisional ecosystem and build a lifetime of passive rewards.
          </p>
        </motion.div>

        {/* Tabs */}
        <div className="flex justify-center mb-10">
          <div className="referrals-tabs scrollable-tabs flex gap-2 rounded-xl bg-glass-light">
            {(["overview", "history"] as const).map((tab) => (
              <Button
                key={tab}
                variant={activeTab === tab ? "primary" : "ghost"}
                onClick={() => setActiveTab(tab)}
                className="referrals-tab-btn font-extrabold text-sm uppercase tracking-wider"
                data-active={activeTab === tab}
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
                className="referral-code-card text-center relative overflow-hidden mb-10 backdrop-blur-lg rounded-3xl bg-glass-light"
              >
                <div className="referral-card-glow absolute rounded-full bg-emerald-subtle pointer-events-none" />

                <div className="text-xs font-extrabold mb-5 text-emerald uppercase tracking-widest">
                  Your Network Identifier
                </div>

                {/* Code box */}
                <div className="flex flex-col items-center gap-4 mb-8">
                  <div className="referral-code-box flex items-center gap-4 justify-between bg-secondary rounded-2xl">
                    <span className="referral-code-text font-extrabold text-primary break-all tracking-wider">
                      {stats.referralCode}
                    </span>
                    <motion.button
                      whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      onClick={copyCode}
                      aria-label="Copy referral code"
                      className="referral-code-copy cursor-pointer flex items-center justify-center flex-shrink-0 border-none rounded-lg text-white"
                      data-copied={copied}
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
                  className="referral-share-btn font-extrabold cursor-pointer inline-flex items-center mb-8 border-none rounded-xl text-sm text-white gap-2-5 bg-gradient-indigo"
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
                <div className="grid gap-5 grid-auto-180">
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
              <div className="referral-progress-section">
                <div className="flex justify-between items-end mb-5 flex-wrap gap-3">
                  <h3 className="font-extrabold text-2xl text-white">Milestone Progress 🚀</h3>
                  <div className="font-bold text-secondary text-sm">
                    <span className="text-xl text-emerald">{stats.activeReferrals}</span> / {nextTierMin} ACTIVE PARTNERS
                  </div>
                </div>
                <div className="referral-progress-track overflow-hidden mb-8 rounded-2xl h-3-5-rem bg-glass-card">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 1.5, ease: "circOut" }}
                    className="referral-progress-fill h-full"
                  />
                </div>
                <div className="grid gap-4 grid-auto-160">
                  <TierCard name="BRONZE"   percent="1%"     min="10"   active={stats.tier.label === "Bronze"}   color="#cd7f32" delay={0.1} />
                  <TierCard name="SILVER"   percent="1.5%"   min="50"   active={stats.tier.label === "Silver"}   color="#c0c0c0" delay={0.2} />
                  <TierCard name="GOLD"     percent="2%"     min="100"  active={stats.tier.label === "Gold"}     color="#ffd700" delay={0.3} />
                  <TierCard name="PLATINUM" percent="1% GMV" min="500"  active={stats.tier.label === "Platinum"} color="#e5e4e2" delay={0.4} />
                  <TierCard name="DIAMOND"  percent="2% GMV" min="1000" active={stats.tier.label === "Diamond"}  color="#b9f2ff" delay={0.5} />
                </div>
              </div>

              {/* Steps */}
              <div className="referral-roadmap p-10 rounded-3xl bg-glass">
                <h3 className="mb-8 text-center font-extrabold text-2xl">Partnership Roadmap 🗺️</h3>
                <div className="grid gap-6 grid-auto-250">
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
              className="referral-history p-8 rounded-3xl bg-glass"
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
function getStatTone(color: string) {
  if (color === "#10b981") return "emerald";
  if (color === "#06b6d4") return "cyan";
  if (color === "#f59e0b") return "amber";
  return "indigo";
}

function StatBox({ label, value, color, icon }: StatBoxProps) {
  const tone = getStatTone(color);
  return (
    <div className="referral-stat-box p-6 text-center rounded-2xl" data-tone={tone}>
      <div className="text-2xl mb-2">{icon}</div>
      <div className="mb-1 font-extrabold text-2xl text-white">{value}</div>
      <div className="referral-stat-label text-xs uppercase tracking-wider font-extrabold">{label}</div>
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
function TierCard({ name, percent, min, active, color: _color, delay }: TierCardProps) {
  const tier = name.toLowerCase();
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay }} whileHover={{ y: -5 }}
      className="referral-tier-card text-center rounded-2xl"
      data-active={active}
      data-tier={tier}
    >
      <div className="referral-tier-name text-xs font-extrabold mb-2">{name}</div>
      <div className="referral-tier-percent mb-1 font-extrabold text-2xl">{percent}</div>
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
    <div className="referral-step-card p-6 relative rounded-3xl bg-black-20">
      <div className="referral-step-num absolute text-3xl font-extrabold">{num}</div>
      <div className="mb-4 text-3xl">{icon}</div>
      <div className="text-lg font-extrabold mb-2 text-white">{title}</div>
      <div className="text-sm text-secondary leading-normal">{desc}</div>
    </div>
  );
}
