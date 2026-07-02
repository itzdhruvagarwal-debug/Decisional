"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
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
}

interface ViewerWallet {
  balance: number;
  availableBalance: number;
}

export default function InfluencerProfilePage() {
  const { id } = useParams() as { id: string };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const router = useRouter();
  const { data: session } = useSession();

  const [profile, setProfile] = useState<InfluencerProfile | null>(null);
  const [wallet, setWallet] = useState<ViewerWallet | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch(`/api/influencers/${id}`);
        const data = await res.json();
        if (data.influencer) {
          setProfile(data.influencer);
          setWallet(data.viewerWallet);
        }
      } catch (e) {
        console.error("[influencer-detail] Failed to load profile:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [id]);

  if (loading)
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        Loading profile...
      </div>
    );
  if (!session)
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        Loading session...
      </div>
    );
  if (session.user?.userType !== "BRAND" && session.user?.userType !== "ADMIN") {
    return (
      <DashboardShell user={session.user}>
        <div className="card" style={{ maxWidth: "680px", margin: "40px auto", textAlign: "center" }}>
          <h1 style={{ fontSize: "24px", fontWeight: 800, marginBottom: "8px" }}>
            Brand access required
          </h1>
          <p style={{ color: "var(--color-text-secondary)", marginBottom: "20px" }}>
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
        <div style={{ padding: "40px", textAlign: "center" }}>
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

  return (
    <DashboardShell user={session.user}>
      <div
      style={{
        maxWidth: "900px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
      }}
    >
      {/* Header / Bio */}
      <div
        className="card"
        style={{
          padding: "32px",
          display: "flex",
          gap: "24px",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            width: "120px",
            height: "120px",
            borderRadius: "50%",
            background: "var(--gradient-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: "48px",
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {profile.displayName?.[0] || "I"}
        </div>
        <div style={{ flex: 1, minWidth: "300px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div>
              <h1
                style={{ fontSize: "32px", fontWeight: 800, margin: "0 0 8px" }}
              >
                {profile.displayName}
              </h1>
              <div
                style={{
                  fontSize: "14px",
                  color: "var(--color-text-secondary)",
                  marginBottom: "12px",
                }}
              >
                {profile.city
                  ? `📍 ${profile.city}, ${profile.state || ""}`
                  : "📍 Global Creator"}
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: "24px",
                  fontWeight: 800,
                  color: "var(--color-primary)",
                }}
              >
                {profile.trustScore}%
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--color-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Trust Score
              </div>
            </div>
          </div>

          <p
            style={{
              fontSize: "15px",
              color: "var(--color-text-primary)",
              lineHeight: 1.6,
              marginBottom: "20px",
            }}
          >
            {profile.bio || "This creator hasn't added a bio yet."}
          </p>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {profile.categories.split(",").map((cat) => (
              <span
                key={cat}
                style={{
                  padding: "4px 12px",
                  background: "var(--color-bg-tertiary)",
                  borderRadius: "16px",
                  fontSize: "12px",
                  fontWeight: 600,
                }}
              >
                #{cat.trim()}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "24px",
        }}
      >
        {/* Stats */}
        <div className="card stagger-children" style={{ padding: "24px" }}>
          <h3
            style={{ fontSize: "16px", fontWeight: 700, marginBottom: "20px" }}
          >
            Audience Reach
          </h3>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              paddingBottom: "16px",
              borderBottom: "1px solid var(--color-border)",
              marginBottom: "16px",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--color-text-secondary)",
                }}
              >
                Instagram Followers
              </div>
              <div style={{ fontSize: "20px", fontWeight: 700 }}>
                {profile.instagramFollowers
                  ? profile.instagramFollowers.toLocaleString("en-IN")
                  : "N/A"}
              </div>
              {profile.instagramHandle && (
                <div
                  style={{ fontSize: "12px", color: "var(--color-primary)" }}
                >
                  @{profile.instagramHandle}
                </div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--color-text-secondary)",
                }}
              >
                Engagement
              </div>
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "var(--color-accent-emerald)",
                }}
              >
                {profile.instagramEngagementRate
                  ? `${profile.instagramEngagementRate}%`
                  : "N/A"}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              paddingBottom: "16px",
              borderBottom: "1px solid var(--color-border)",
              marginBottom: "16px",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--color-text-secondary)",
                }}
              >
                YouTube Subs
              </div>
              <div style={{ fontSize: "20px", fontWeight: 700 }}>
                {profile.youtubeSubscribers === -1
                  ? "Hidden"
                  : profile.youtubeSubscribers
                  ? profile.youtubeSubscribers.toLocaleString("en-IN")
                  : "N/A"}
              </div>
              {profile.youtubeHandle && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--color-accent-rose)",
                  }}
                >
                  {profile.youtubeHandle}
                </div>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--color-text-secondary)",
                }}
              >
                Engagement
              </div>
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "var(--color-accent-emerald)",
                }}
              >
                {profile.youtubeEngagementRate
                  ? `${profile.youtubeEngagementRate}%`
                  : "N/A"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--color-text-secondary)",
                }}
              >
                Completed Deals
              </div>
              <div style={{ fontSize: "20px", fontWeight: 700 }}>
                {profile.totalCompletedDeals}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--color-text-secondary)",
                }}
              >
                Rating
              </div>
              <div style={{ fontSize: "18px", fontWeight: 700 }}>
                {profile.averageRating > 0
                  ? `⭐ ${profile.averageRating.toFixed(1)}`
                  : "No reviews"}
              </div>
            </div>
          </div>
        </div>

        {/* Invite & Budget Check */}
        <div
          className="card"
          style={{
            padding: "24px",
            background: "var(--color-bg-secondary)",
            border: "1px solid var(--color-border)",
          }}
        >
          <h3
            style={{ fontSize: "16px", fontWeight: 700, marginBottom: "20px" }}
          >
            Work Together
          </h3>

          <div
            style={{
              background: "var(--color-bg-primary)",
              padding: "16px",
              borderRadius: "var(--radius-md)",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "8px",
              }}
            >
              <span
                style={{
                  fontSize: "13px",
                  color: "var(--color-text-secondary)",
                }}
              >
                Estimated Rate / Post
              </span>
              <span style={{ fontSize: "16px", fontWeight: 800 }}>
                {minRateStr}
              </span>
            </div>
            {profile.maxRate && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  borderTop: "1px dashed var(--color-border)",
                  paddingTop: "8px",
                }}
              >
                <span
                  style={{
                    fontSize: "13px",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Premium Service Code
                </span>
                <span style={{ fontSize: "14px", fontWeight: 600 }}>
                  Up to ₹{(profile.maxRate / 100).toLocaleString("en-IN")}
                </span>
              </div>
            )}
          </div>

          {isBrandOrIndividual && wallet && (
            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "8px",
                }}
              >
                <span
                  style={{
                    fontSize: "13px",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Your Available Balance
                </span>
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 700,
                    color: canAfford
                      ? "var(--color-accent-emerald)"
                      : "var(--color-accent-rose)",
                  }}
                >
                  {availableBalanceStr}
                </span>
              </div>

              {!canAfford ? (
                <div
                  style={{
                    padding: "12px",
                    background: "rgba(239, 68, 68, 0.1)",
                    color: "var(--color-accent-rose)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "13px",
                    lineHeight: 1.4,
                  }}
                >
                  Your wallet balance is lower than this creator's minimum rate.
                  Consider depositing funds before initiating a deal.
                </div>
              ) : !profile.minRate ? (
                <div
                  style={{
                    padding: "12px",
                    background: "rgba(34, 197, 94, 0.1)",
                    color: "var(--color-accent-emerald)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "13px",
                    lineHeight: 1.4,
                  }}
                >
                  This creator's rate is negotiable. You can propose a custom budget or a barter (product) deal.
                </div>
              ) : (
                <div
                  style={{
                    padding: "12px",
                    background: "rgba(34, 197, 94, 0.1)",
                    color: "var(--color-accent-emerald)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "13px",
                    lineHeight: 1.4,
                  }}
                >
                  Your current wallet balance covers this creator's base rate.
                </div>
              )}
            </div>
          )}

          {isBrandOrIndividual ? (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              <Link
                href={`/dashboard/campaigns/create?invite=${profile?.id || id}`}
                className="btn btn-primary"
                style={{
                  textAlign: "center",
                  textDecoration: "none",
                  padding: "14px",
                  fontSize: "15px",
                }}
              >
                Create Campaign & Invite
              </Link>

              {!canAfford && (
                <Link
                  href="/dashboard/wallet"
                  style={{
                    display: "block",
                    textAlign: "center",
                    fontSize: "14px",
                    color: "var(--color-primary)",
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  Deposit to Wallet
                </Link>
              )}
            </div>
          ) : (
            <div
              style={{
                padding: "16px",
                textAlign: "center",
                background: "var(--color-bg-tertiary)",
                borderRadius: "var(--radius-md)",
                fontSize: "14px",
                color: "var(--color-text-secondary)",
              }}
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
