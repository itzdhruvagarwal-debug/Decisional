"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/dashboard/DashboardShell";

interface InfluencerProfile {
  id: string;
  userId: string;
  displayName: string;
  bio: string | null;
  avatar: string | null;
  city: string | null;
  state: string | null;
  instagramHandle: string | null;
  instagramFollowers: number | null;
  instagramEngagementRate: number | null;
  youtubeHandle: string | null;
  youtubeSubscribers: number | null;
  youtubeEngagementRate: number | null;
  categories: string;
  languages: string;
  minRate: number | null;
  maxRate: number | null;
  trustScore: number;
  totalCompletedDeals: number;
  averageRating: number;
  isFeatured?: boolean;
}

interface ViewerWallet {
  balance: number;
  availableBalance: number;
}

interface InfluencerDetailResponse {
  influencer?: InfluencerProfile;
  viewerWallet?: ViewerWallet;
}

function getYoutubeSubsLabel(subscribers: number | null): string {
  if (subscribers === -1) return "Hidden";
  if (subscribers) return subscribers.toLocaleString("en-IN");
  return "N/A";
}

function getBudgetNotice(canAfford: boolean, minRate: number | null) {
  if (!canAfford) {
    return {
      text: "Your wallet balance is lower than this creator's minimum rate. Consider depositing funds before initiating a deal.",
      style: {
        padding: "12px",
        background: "rgba(239, 68, 68, 0.1)",
        color: "var(--color-accent-rose)",
        borderRadius: "var(--radius-md)",
        fontSize: "13px",
        lineHeight: 1.4,
      },
    };
  }
  if (minRate) {
    return {
      text: `Your wallet balance covers this creator's minimum rate (Rs ${(minRate / 100).toLocaleString("en-IN")}).`,
      style: {
        padding: "12px",
        background: "rgba(16, 185, 129, 0.1)",
        color: "var(--color-success)",
        borderRadius: "var(--radius-md)",
        fontSize: "13px",
        lineHeight: 1.4,
      },
    };
  }
  return null;
}

export default function InfluencerProfilePage() {
  const { data: session } = useSession();
  const params = useParams();
  const id = params?.id as string;

  const { data, isLoading: loading } = useSWR<InfluencerDetailResponse>(
    id ? `/api/influencers/${id}` : null,
    fetcher
  );

  const profile = data?.influencer || null;
  const wallet = data?.viewerWallet || null;

  if (loading)
    return (
      <div className="text-center" style={{ padding: "40px" }}>
        Loading profile...
      </div>
    );
  if (!session)
    return (
      <div className="text-center" style={{ padding: "40px" }}>
        Loading session...
      </div>
    );
  if (session.user?.userType !== "BRAND" && session.user?.userType !== "ADMIN") {
    return (
      <DashboardShell user={session.user}>
        <div className="card text-center" style={{ maxWidth: "680px", margin: "40px auto" }}>
          <h1 className="text-2xl font-extrabold mb-2">
            Brand access required
          </h1>
          <p className="text-secondary mb-5">
            Creator profiles are available for brand campaign planning.
          </p>
          <Link href="/dashboard/campaigns" className="btn btn-primary">
            Browse Campaigns
          </Link>
        </div>
      </DashboardShell>
    );
  }
  if (!profile)
    return (
      <DashboardShell user={session.user}>
        <div className="text-center" style={{ padding: "40px" }}>
          Influencer not found.
        </div>
      </DashboardShell>
    );

  const availableBalanceStr = wallet
    ? `₹${(wallet.availableBalance / 100).toLocaleString("en-IN")}`
    : "₹0";
  const minRateStr = profile.minRate
    ? `₹${(profile.minRate / 100).toLocaleString("en-IN")}`
    : "Negotiable";

  const canAfford =
    !profile.minRate || (wallet && wallet.availableBalance >= profile.minRate);
  const isBrandOrIndividual = session?.user?.userType === "BRAND";

  const youtubeSubsLabel = getYoutubeSubsLabel(profile.youtubeSubscribers);
  const budgetNotice = getBudgetNotice(Boolean(canAfford), profile.minRate);
  const budgetNoticeText = budgetNotice?.text || "";
  const budgetNoticeStyle = budgetNotice?.style || {};

  return (
    <DashboardShell user={session.user}>
      <div
      className="flex flex-col gap-6" style={{ maxWidth: "900px", margin: "0 auto" }}
    >
      {/* Header / Bio */}
      <div
        className="card flex gap-6 flex-wrap" style={{ padding: "32px" }}
      >
        <div
          className="flex items-center justify-center font-extrabold flex-shrink-0" style={{ width: "120px", height: "120px", borderRadius: "50%", background: "var(--gradient-primary)", color: "#fff", fontSize: "48px" }}
        >
          {profile.displayName?.[0] || "I"}
        </div>
        <div className="flex-1" style={{ minWidth: "300px" }}>
          <div
            className="flex justify-between items-start"
          >
            <div>
              <h1
                className="font-extrabold" style={{ fontSize: "32px", margin: "0 0 8px" }}
              >
                {profile.displayName}
              </h1>
              <div
                className="text-sm text-secondary mb-3"
              >
                {profile.city
                  ? `📍 ${profile.city}, ${profile.state || ""}`
                  : "📍 Global Creator"}
              </div>
            </div>
            <div className="text-center">
              <div
                className="text-2xl font-extrabold text-primary"
              >
                {profile.trustScore}%
              </div>
              <div
                className="text-muted" style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}
              >
                Trust Score
              </div>
            </div>
          </div>

          <p
            className="mb-5" style={{ fontSize: "15px", color: "var(--color-text-primary)", lineHeight: 1.6 }}
          >
            {profile.bio || "This creator hasn't added a bio yet."}
          </p>

          <div className="flex gap-2 flex-wrap">
            {profile.isFeatured && (
              <span
                className="text-xs font-extrabold inline-flex items-center gap-1" style={{ padding: "4px 12px", background: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.25)", borderRadius: "16px", textTransform: "uppercase" }}
              >
                ⭐ Featured Creator
              </span>
            )}
            {profile.categories.split(",").map((cat) => (
              <span
                key={cat}
                className="text-xs font-semibold" style={{ padding: "4px 12px", background: "var(--color-bg-tertiary)", borderRadius: "16px" }}
              >
                #{cat.trim()}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div
        className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}
      >
        {/* Stats */}
        <div className="card stagger-children p-6">
          <h3
            className="text-base font-bold mb-5"
          >
            Audience Reach
          </h3>

          <div
            className="flex justify-between border-b-card mb-4" style={{ paddingBottom: "16px" }}
          >
            <div>
              <div
                className="text-sm text-secondary"
              >
                Instagram Followers
              </div>
              <div className="text-xl font-bold">
                {profile.instagramFollowers
                  ? profile.instagramFollowers.toLocaleString("en-IN")
                  : "N/A"}
              </div>
              {profile.instagramHandle && (
                <div
                  className="text-xs text-primary"
                >
                  @{profile.instagramHandle}
                </div>
              )}
            </div>
            <div className="text-right">
              <div
                className="text-sm text-secondary"
              >
                Engagement
              </div>
              <div
                className="text-base font-semibold" style={{ color: "var(--color-accent-emerald)" }}
              >
                {profile.instagramEngagementRate
                  ? `${profile.instagramEngagementRate}%`
                  : "N/A"}
              </div>
            </div>
          </div>

          <div
            className="flex justify-between border-b-card mb-4" style={{ paddingBottom: "16px" }}
          >
            <div>
              <div
                className="text-sm text-secondary"
              >
                YouTube Subs
              </div>
              <div className="text-xl font-bold">
                {youtubeSubsLabel}
              </div>
              {profile.youtubeHandle && (
                <div
                  className="text-xs" style={{ color: "var(--color-accent-rose)" }}
                >
                  {profile.youtubeHandle}
                </div>
              )}
            </div>
            <div className="text-right">
              <div
                className="text-sm text-secondary"
              >
                Engagement
              </div>
              <div
                className="text-base font-semibold" style={{ color: "var(--color-accent-emerald)" }}
              >
                {profile.youtubeEngagementRate
                  ? `${profile.youtubeEngagementRate}%`
                  : "N/A"}
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <div>
              <div
                className="text-sm text-secondary"
              >
                Completed Deals
              </div>
              <div className="text-xl font-bold">
                {profile.totalCompletedDeals}
              </div>
            </div>
            <div className="text-right">
              <div
                className="text-sm text-secondary"
              >
                Rating
              </div>
              <div className="text-lg font-bold">
                {profile.averageRating > 0
                  ? `⭐ ${profile.averageRating.toFixed(1)}`
                  : "No reviews"}
              </div>
            </div>
          </div>
        </div>

        {/* Invite & Budget Check */}
        <div
          className="card p-6" style={{ background: "var(--color-bg-secondary)", border: "1px solid var(--color-border)" }}
        >
          <h3
            className="text-base font-bold mb-5"
          >
            Work Together
          </h3>

          <div
            className="p-4 mb-6" style={{ background: "var(--color-bg-primary)", borderRadius: "var(--radius-md)" }}
          >
            <div
              className="flex justify-between mb-2"
            >
              <span
                className="text-sm text-secondary"
              >
                Estimated Rate / Post
              </span>
              <span className="text-base font-extrabold">
                {minRateStr}
              </span>
            </div>
            {profile.maxRate && (
              <div
                className="flex justify-between" style={{ borderTop: "1px dashed var(--color-border)", paddingTop: "8px" }}
              >
                <span
                  className="text-sm text-secondary"
                >
                  Premium Service Code
                </span>
                <span className="text-sm font-semibold">
                  Up to ₹{(profile.maxRate / 100).toLocaleString("en-IN")}
                </span>
              </div>
            )}
          </div>

          {isBrandOrIndividual && wallet && (
            <div className="mb-6">
              <div
                className="flex justify-between mb-2"
              >
                <span
                  className="text-sm text-secondary"
                >
                  Your Available Balance
                </span>
                <span
                  className="text-sm font-bold" style={{ color: canAfford
                      ? "var(--color-accent-emerald)"
                      : "var(--color-accent-rose)" }}
                >
                  {availableBalanceStr}
                </span>
              </div>

              {budgetNoticeText && (
                <div style={budgetNoticeStyle}>
                  {budgetNoticeText}
                </div>
              )}
            </div>
          )}

          {isBrandOrIndividual ? (
            <div
              className="flex flex-col gap-3"
            >
              <Link
                href={`/dashboard/campaigns/create?invite=${profile?.id || id}`}
                className="btn btn-primary text-center" style={{ textDecoration: "none", padding: "14px", fontSize: "15px" }}
              >
                Create Campaign & Invite
              </Link>

              {!canAfford && (
                <Link
                  href="/dashboard/wallet"
                  className="block text-center text-sm text-primary font-semibold" style={{ textDecoration: "none" }}
                >
                  Deposit to Wallet
                </Link>
              )}
            </div>
          ) : (
            <div
              className="p-4 text-center text-sm text-secondary" style={{ background: "var(--color-bg-tertiary)", borderRadius: "var(--radius-md)" }}
            >
              Log in as a Brand to invite this creator to campaigns.
            </div>
          )}
        </div>
      </div>
      </div>
    </DashboardShell>
  );
}
