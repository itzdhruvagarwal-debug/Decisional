"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils-client";

interface CampaignDetail {
  id: string;
  title: string;
  description: string;
  requirements: string;
  guidelines: string | null;
  status: string;
  totalBudget: number;
  perInfluencerBudget: number | null;
  minFollowers: number;
  maxFollowers: number | null;
  targetCategories: string[];
  targetCities: string[];
  targetLanguages: string[];
  applicationDeadline: string | null;
  contentDeadline: string;
  postingDeadline: string;
  totalApplications: number;
  selectedInfluencers: number;
  deliverables: Array<{ type: string; count: number; specs?: string }>;
  brand: {
    userId: string;
    companyName: string;
    logo: string | null;
    averageRating: number;
    isGstVerified: boolean;
  } | null;
  _count?: {
    applications?: number;
    deals?: number;
  };
  maxInfluencers: number | null;
  acceptedCount: number;
}

interface CampaignApplication {
  id: string;
  status: string;
  proposal: string;
  proposedRate: number;
  estimatedDelivery: string | null;
  createdAt: string;
  influencer: {
    id: string;
    displayName: string;
    avatar: string | null;
    instagramFollowers: number | null;
    instagramEngagementRate: number | null;
    categories: string;
    averageRating: number;
    completedDeals: number;
    user?: { trustScore?: number | null };
  };
  matchScore?: number;
  matchBreakdown?: {
    categoryScore: number;
    engagementScore: number;
    authenticityScore: number;
    qualityScore: number;
    roiScore: number;
    estimatedViews: number;
    estimatedCpvPaise: number;
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeDeliverables(value: unknown): CampaignDetail["deliverables"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      const parsed = item as { type?: unknown; count?: unknown; specs?: unknown };
      return {
        type: String(parsed?.type || "").trim(),
        count: Math.max(1, Number(parsed?.count || 1)),
        ...(parsed?.specs ? { specs: String(parsed.specs) } : {}),
      };
    })
    .filter((item) => Boolean(item.type));
}

interface RawCampaign {
  id: string;
  title?: string;
  description?: string;
  requirements?: string;
  guidelines?: string | null;
  status?: string;
  totalBudget?: number;
  perInfluencerBudget?: number | null;
  minFollowers?: number;
  maxFollowers?: number | null;
  targetCategories?: unknown;
  targetCities?: unknown;
  targetLanguages?: unknown;
  applicationDeadline?: string | null;
  contentDeadline?: string | null;
  postingDeadline?: string | null;
  totalApplications?: number;
  selectedInfluencers?: number;
  maxInfluencers?: number | null;
  requiresProduct?: boolean;
  productName?: string;
  productValue?: number;
  productDescription?: string;
  deliverables?: unknown;
  brand?: { userId?: string; companyName?: string; logo?: string | null; averageRating?: number; isGstVerified?: boolean };
  createdAt?: string;
  updatedAt?: string;
  _count?: { applications?: number; deals?: number };
  applications?: { id: string; proposedRate: number; [key: string]: unknown }[];
}

function normalizeCampaign(raw: RawCampaign): CampaignDetail {
  return {
    id: raw.id,
    title: raw.title || "Untitled Campaign",
    description: raw.description || "",
    requirements: raw.requirements || "",
    guidelines: raw.guidelines || null,
    status: raw.status || "DRAFT",
    totalBudget: Number(raw.totalBudget || 0),
    perInfluencerBudget:
      raw.perInfluencerBudget === null || raw.perInfluencerBudget === undefined
        ? null
        : Number(raw.perInfluencerBudget),
    minFollowers: Number(raw.minFollowers || 0),
    maxFollowers:
      raw.maxFollowers === null || raw.maxFollowers === undefined
        ? null
        : Number(raw.maxFollowers),
    targetCategories: normalizeStringArray(raw.targetCategories),
    targetCities: normalizeStringArray(raw.targetCities),
    targetLanguages: normalizeStringArray(raw.targetLanguages),
    applicationDeadline: raw.applicationDeadline || null,
    contentDeadline: raw.contentDeadline || "",
    postingDeadline: raw.postingDeadline || "",
    totalApplications: Number(raw.totalApplications || raw?._count?.applications || 0),
    selectedInfluencers: Number(raw.selectedInfluencers || 0),
    deliverables: normalizeDeliverables(raw.deliverables),
    brand: raw.brand
      ? {
          userId: raw.brand.userId || "",
          companyName: raw.brand.companyName || "Unknown Brand",
          logo: raw.brand.logo || null,
          averageRating: Number(raw.brand.averageRating || 0) / 100,
          isGstVerified: Boolean(raw.brand.isGstVerified),
        }
      : null,
    _count: {
      applications: Number(raw?._count?.applications || 0),
      deals: Number(raw?._count?.deals || 0),
    },
    maxInfluencers: raw.maxInfluencers !== undefined ? raw.maxInfluencers : null,
    acceptedCount: raw.applications ? raw.applications.length : 0,
  };
}

export default function CampaignDetailClient({
  user,
  influencerProfile,
}: {
  user: { id: string; userType?: string };
  influencerProfile?: {
    id: string;
    instagramFollowers: number | null;
    instagramEngagementRate: number | null;
    youtubeSubscribers: number | null;
    youtubeEngagementRate: number | null;
  } | null;
}) {
  const params = useParams();
  const router = useRouter();

  const campaignId = useMemo(() => {
    const id = params?.id;
    return Array.isArray(id) ? id[0] : id;
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);

  const [showApplyModal, setShowApplyModal] = useState(false);
  const [proposal, setProposal] = useState("");
  const [proposedRate, setProposedRate] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [applications, setApplications] = useState<CampaignApplication[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [applicationActionId, setApplicationActionId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [hasApplied, setHasApplied] = useState(false);
  const [applicationStatus, setApplicationStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignId) return;

    const controller = new AbortController();

    fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((payload) => {
        const rawCampaign =
          payload?.data?.campaign || payload?.campaign || payload?.data || null;

        if (!rawCampaign) {
          setError(payload?.message || "Campaign not found");
          setLoading(false);
          return;
        }

        const normalized = normalizeCampaign(rawCampaign);
        setCampaign(normalized);
        
        let defaultRate = Math.round((normalized.perInfluencerBudget || 0) / 100);
        if (influencerProfile) {
          let instagramCount = 0;
          let youtubeCount = 0;
          normalized.deliverables.forEach((d) => {
            const type = d.type.toUpperCase();
            if (type.startsWith("INSTAGRAM")) instagramCount += d.count;
            else if (type.startsWith("YOUTUBE")) youtubeCount += d.count;
          });
          const igFollowers = influencerProfile.instagramFollowers || 0;
          const igER = influencerProfile.instagramEngagementRate || 0;
          const instagramPayout = (igFollowers * (igER / 100)) * 2.0 * instagramCount;

          const ytSubscribers = influencerProfile.youtubeSubscribers || 0;
          const ytER = influencerProfile.youtubeEngagementRate || 0;
          const youtubePayout = (ytSubscribers * (ytER / 100)) * 2.5 * youtubeCount;

          const calculatedPayout = Math.round(instagramPayout + youtubePayout);
          if (calculatedPayout > 0) {
            defaultRate = calculatedPayout;
          }
        }
        setProposedRate(defaultRate);
        
        const applied = Boolean(payload?.data?.hasApplied || rawCampaign?.hasApplied || payload?.hasApplied);
        const appStatus = payload?.data?.applicationStatus || rawCampaign?.applicationStatus || payload?.applicationStatus || null;
        setHasApplied(applied);
        setApplicationStatus(appStatus);
        
        setLoading(false);
      })
      .catch((loadError) => {
        if (loadError?.name === "AbortError") return;
        setError("Failed to load campaign");
        setLoading(false);
      });

    return () => controller.abort();
  }, [campaignId, influencerProfile]);

  const recommendedPayout = useMemo(() => {
    if (!influencerProfile || !campaign) return 0;

    let instagramCount = 0;
    let youtubeCount = 0;

    campaign.deliverables.forEach((d) => {
      const type = d.type.toUpperCase();
      if (type.startsWith("INSTAGRAM")) {
        instagramCount += d.count;
      } else if (type.startsWith("YOUTUBE")) {
        youtubeCount += d.count;
      }
    });

    const igFollowers = influencerProfile.instagramFollowers || 0;
    const igER = influencerProfile.instagramEngagementRate || 0;
    const instagramPayout = (igFollowers * (igER / 100)) * 2.0 * instagramCount;

    const ytSubscribers = influencerProfile.youtubeSubscribers || 0;
    const ytER = influencerProfile.youtubeEngagementRate || 0;
    const youtubePayout = (ytSubscribers * (ytER / 100)) * 2.5 * youtubeCount;

    return Math.round(instagramPayout + youtubePayout);
  }, [influencerProfile, campaign]);

  const isOwner = Boolean(campaign?.brand?.userId && campaign?.brand?.userId === user?.id);
  const canApply = user?.userType === "INFLUENCER" && campaign?.status === "ACTIVE" && !hasApplied;

  const fetchApplications = useCallback(async () => {
    if (!campaignId || !isOwner) return;
    setApplicationsLoading(true);
    try {
      const response = await fetch(`/api/applications?campaignId=${encodeURIComponent(campaignId)}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "Failed to load applications");
      }
      setApplications(payload?.data?.applications || []);
    } catch (appError: unknown) {
      setNotice({
        type: "error",
        message: (appError instanceof Error ? (appError instanceof Error ? (appError instanceof Error ? appError.message : String(appError)) : String(appError)) : String(appError)) || "Failed to load applications",
      });
    } finally {
      setApplicationsLoading(false);
    }
  }, [campaignId, isOwner]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const promptNegotiatedRate = (proposedRate: number): number | null => {
    const proposedRateInRupees = proposedRate / 100;
    const rateInput = prompt(
      `Accept application at the proposed rate of ₹${proposedRateInRupees.toLocaleString()}?\n\nOr enter a custom negotiated payout rate in INR:`,
      proposedRateInRupees.toString()
    );
    if (rateInput === null) {
      return null;
    }
    const customRateRupees = Number(rateInput);
    if (isNaN(customRateRupees) || customRateRupees <= 0) {
      alert("Please enter a valid rate");
      return null;
    }
    return Math.round(customRateRupees * 100);
  };

  const buildApplicationActionRequest = (
    action: "accept" | "reject",
    applicationId: string
  ): RequestInit | null => {
    const requestInit: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    };

    if (action === "reject") {
      requestInit.body = JSON.stringify({
        reason: "Application rejected by brand.",
      });
      return requestInit;
    }

    const app = applications.find((a: CampaignApplication) => a.id === applicationId);
    if (app) {
      const customRatePaise = promptNegotiatedRate(app.proposedRate);
      if (customRatePaise === null) {
        return null;
      }
      requestInit.body = JSON.stringify({ customRate: customRatePaise });
    }
    return requestInit;
  };

  const handleApplicationAction = async (
    applicationId: string,
    action: "accept" | "reject",
  ) => {
    setApplicationActionId(applicationId);
    setNotice(null);
    try {
      const requestInit = buildApplicationActionRequest(action, applicationId);
      if (!requestInit) {
        setApplicationActionId(null);
        return;
      }

      const response = await fetch(`/api/applications/${applicationId}/${action}`, requestInit);
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || `Failed to ${action} application`);
      }

      setNotice({
        type: "success",
        message:
          action === "accept"
            ? "Application accepted. Deal has been initiated."
            : "Application rejected.",
      });
      await fetchApplications();
      router.refresh();
    } catch (actionError: unknown) {
      setNotice({
        type: "error",
        message: (actionError instanceof Error ? actionError.message : String(actionError)) || `Failed to ${action} application`,
      });
    } finally {
      setApplicationActionId(null);
    }
  };

  const handleApply = async () => {
    if (!campaign) return;
    if (proposal.trim().length < 50) {
      setNotice({ type: "error", message: "Please write at least 50 characters in proposal." });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.id,
          proposal: proposal.trim(),
          proposedRate: Math.max(1, Math.round(proposedRate * 100)),
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "Failed to submit application");
      }

      setShowApplyModal(false);
      setNotice({ type: "success", message: "Application submitted successfully." });
      setHasApplied(true);
      setApplicationStatus("PENDING");
      router.push("/dashboard/deals");
    } catch (applyError: unknown) {
      setNotice({ type: "error", message: (applyError instanceof Error ? (applyError instanceof Error ? (applyError instanceof Error ? applyError.message : String(applyError)) : String(applyError)) : String(applyError)) || "Failed to submit application" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCampaignAction = async (action: "ACTIVATE" | "CANCEL") => {
    if (!campaignId) return;

    const confirmText =
      action === "ACTIVATE"
        ? "Activate this campaign and hold funds from wallet?"
        : "Cancel this campaign? This cannot be undone.";

    if (!window.confirm(confirmText)) return;

    try {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "Campaign update failed");
      }

      setCampaign((prev) =>
        prev
          ? {
              ...prev,
              status:
                payload?.data?.campaign?.status ||
                (action === "ACTIVATE" ? "ACTIVE" : "CANCELLED"),
            }
          : prev,
      );
      setNotice({ type: "success", message: payload?.message || "Campaign updated successfully" });
      router.refresh();
    } catch (actionError: unknown) {
      setNotice({ type: "error", message: (actionError instanceof Error ? (actionError instanceof Error ? (actionError instanceof Error ? actionError.message : String(actionError)) : String(actionError)) : String(actionError)) || "Campaign update failed" });
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "64px" }}>
        <span className="loading" style={{ width: "40px", height: "40px" }} />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="card" style={{ maxWidth: "760px", margin: "0 auto", textAlign: "center" }}>
        <h2 style={{ marginBottom: "8px" }}>{error || "Campaign not found"}</h2>
        <Link href="/dashboard/campaigns" className="btn btn-secondary">
          Back to Campaigns
        </Link>
      </div>
    );
  }

  const applicationsCount = Math.max(
    campaign.totalApplications,
    Number(campaign?._count?.applications || 0),
  );

  return (
    <div className="campaign-detail-page" style={{ maxWidth: "980px", margin: "0 auto", display: "grid", gap: "16px" }}>
      <Link href="/dashboard/campaigns" className="campaign-detail-back" style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>
        Back to campaigns
      </Link>

      <section className="card campaign-detail-hero" style={{ display: "grid", gap: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div className="campaign-detail-title-block">
            <div className="campaign-card-logo campaign-detail-logo" aria-hidden="true">
              {campaign.brand?.logo ? (
                <img src={campaign.brand.logo} alt="" />
              ) : (
                (campaign.brand?.companyName || "DC").slice(0, 2).toUpperCase()
              )}
            </div>
            <h1 style={{ fontSize: "28px", fontWeight: 800 }}>{campaign.title}</h1>
            <p style={{ color: "var(--color-text-secondary)", marginTop: "6px" }}>
              {campaign.brand?.companyName || "Unknown Brand"}
              {campaign.brand?.isGstVerified ? " · Verified" : ""}
              {campaign.brand?.averageRating ? ` · ${campaign.brand.averageRating.toFixed(1)} rating` : ""}
            </p>
          </div>

          <div className="campaign-detail-actions" style={{ display: "flex", gap: "8px", alignItems: "flex-start", flexWrap: "wrap" }}>
            <span className="badge">Status: {campaign.status}</span>
            {isOwner && campaign.status === "DRAFT" && (
              <>
                <Link href={`/dashboard/campaigns/create?edit=${campaign.id}`} className="btn btn-secondary">
                  Edit Campaign
                </Link>
                <button className="btn btn-primary" onClick={() => handleCampaignAction("ACTIVATE")}>
                  Activate Campaign
                </button>
              </>
            )}
            {isOwner && ["ACTIVE", "PAUSED"].includes(campaign.status) && (
              <button className="btn btn-secondary" onClick={() => handleCampaignAction("CANCEL")}>
                Cancel Campaign
              </button>
            )}
            {canApply && (
              <button className="btn btn-primary" onClick={() => setShowApplyModal(true)}>
                Apply Now
              </button>
            )}
            {user?.userType === "INFLUENCER" && hasApplied && (
              <button className="btn btn-secondary" disabled style={{ opacity: 0.7, cursor: "not-allowed" }}>
                Applied ({applicationStatus || "PENDING"})
              </button>
            )}
          </div>
        </div>

        <div className="campaign-detail-stats" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
          <div className="campaign-detail-stat" style={{ margin: 0 }}>
            <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Per Influencer</div>
            <div style={{ fontSize: "20px", fontWeight: 700 }}>
              {formatCurrency(campaign.perInfluencerBudget || campaign.totalBudget)}
            </div>
          </div>
          {user?.userType === "INFLUENCER" && recommendedPayout > 0 && (
            <div className="campaign-detail-stat" style={{ margin: 0, border: "1px solid #10b981", background: "rgba(16, 185, 129, 0.08)" }}>
              <div style={{ fontSize: "12px", color: "#10b981", fontWeight: 600 }}>💡 Recommended Payout</div>
              <div style={{ fontSize: "20px", fontWeight: 800, color: "#10b981" }}>
                ₹{recommendedPayout.toLocaleString("en-IN")}
              </div>
            </div>
          )}
          <div className="campaign-detail-stat" style={{ margin: 0 }}>
            <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Applications</div>
            <div style={{ fontSize: "20px", fontWeight: 700 }}>{applicationsCount}</div>
          </div>
          <div className="campaign-detail-stat" style={{ margin: 0 }}>
            <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Slots Filled</div>
            <div style={{ fontSize: "20px", fontWeight: 700 }}>
              {campaign.maxInfluencers !== null && campaign.maxInfluencers !== undefined
                ? `${campaign.acceptedCount} / ${campaign.maxInfluencers}`
                : `${campaign.acceptedCount} (Unlimited)`}
            </div>
          </div>
          <div className="campaign-detail-stat" style={{ margin: 0 }}>
            <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Followers Needed</div>
            <div style={{ fontSize: "20px", fontWeight: 700 }}>
              {campaign.maxFollowers
                ? `${campaign.minFollowers.toLocaleString()} - ${campaign.maxFollowers.toLocaleString()}`
                : `${campaign.minFollowers.toLocaleString()}+`}
            </div>
          </div>
        </div>
      </section>

      {notice && (
        <div
          className="card"
          style={{
            padding: "12px 16px",
            borderColor:
              notice.type === "success"
                ? "rgba(34, 197, 94, 0.35)"
                : "rgba(239, 68, 68, 0.35)",
            color:
              notice.type === "success"
                ? "var(--color-success)"
                : "var(--color-error)",
          }}
        >
          {notice.message}
        </div>
      )}

      {isOwner && (
        <section className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
              marginBottom: "16px",
            }}
          >
            <div>
              <h3 style={{ marginBottom: "4px" }}>Applications</h3>
              <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
                Review applicants and start deals from this campaign.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={fetchApplications}
              disabled={applicationsLoading}
            >
              {applicationsLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {applicationsLoading ? (
            <div style={{ padding: "24px", textAlign: "center" }}>
              <span className="loading" />
            </div>
          ) : applications.length === 0 ? (
            <div
              style={{
                padding: "32px 16px",
                textAlign: "center",
                color: "var(--color-text-secondary)",
                border: "1px dashed var(--color-border)",
                borderRadius: "var(--radius-md)",
              }}
            >
              No applications yet.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {applications.map((application) => {
                const canAct = ["PENDING", "SHORTLISTED"].includes(application.status);
                return (
                  <article
                    key={application.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      gap: "16px",
                      padding: "16px",
                      background: "var(--color-bg-tertiary)",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          flexWrap: "wrap",
                          marginBottom: "8px",
                        }}
                      >
                        <strong>{application.influencer.displayName}</strong>
                        <span className="badge">{application.status}</span>
                        <span className="badge">
                          Trust {application.influencer.user?.trustScore ?? 0}
                        </span>
                        <span className="badge">
                          {formatCurrency(application.proposedRate)}
                        </span>
                        {application.matchScore !== undefined && (
                          <span
                            className="badge"
                            style={{
                              backgroundColor:
                                application.matchScore >= 80
                                  ? "rgba(16, 185, 129, 0.15)"
                                  : application.matchScore >= 50
                                  ? "rgba(245, 158, 11, 0.15)"
                                  : "rgba(239, 68, 68, 0.15)",
                              color:
                                application.matchScore >= 80
                                  ? "#10b981"
                                  : application.matchScore >= 50
                                  ? "#f59e0b"
                                  : "#ef4444",
                              borderColor:
                                application.matchScore >= 80
                                  ? "#10b981"
                                  : application.matchScore >= 50
                                  ? "#f59e0b"
                                  : "#ef4444",
                              fontWeight: "bold",
                            }}
                            title={`Match Score Details:\n- Niche Fit: ${application.matchBreakdown?.categoryScore}%\n- Engagement Fit: ${application.matchBreakdown?.engagementScore}%\n- Authenticity Fit: ${application.matchBreakdown?.authenticityScore}%\n- Reputation Fit: ${application.matchBreakdown?.qualityScore}%\n- ROI/CPV Fit (Projected): ${application.matchBreakdown?.roiScore}%\n- Est. Views (Modelled): ${application.matchBreakdown?.estimatedViews}\n- Est. CPV (Modelled): ₹${((application.matchBreakdown?.estimatedCpvPaise || 0) / 100).toFixed(2)}`}
                          >
                            🔥 {application.matchScore}% Match
                          </span>
                        )}
                      </div>
                      <p
                        style={{
                          color: "var(--color-text-secondary)",
                          fontSize: "14px",
                          lineHeight: 1.5,
                          marginBottom: "10px",
                        }}
                      >
                        {application.proposal}
                      </p>
                      <div
                        style={{
                          display: "flex",
                          gap: "10px",
                          flexWrap: "wrap",
                          color: "var(--color-text-muted)",
                          fontSize: "12px",
                        }}
                      >
                        <span>
                          Followers:{" "}
                          {(application.influencer.instagramFollowers || 0).toLocaleString("en-IN")}
                        </span>
                        <span>
                          Deals: {application.influencer.completedDeals || 0}
                        </span>
                        <span>
                          Category: {application.influencer.categories?.split(",")[0] || "Other"}
                        </span>
                        {application.matchBreakdown && (
                          <span style={{ color: "#10b981", fontWeight: "600" }} title="This is a modelled projection based on follower stats and campaign budget, not verified API statistics.">
                            Projected CPV: ₹{((application.matchBreakdown.estimatedCpvPaise || 0) / 100).toFixed(2)} / view (Est.)
                          </span>
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "8px",
                        flexWrap: "wrap",
                        justifyContent: "flex-end",
                      }}
                    >
                      <Link
                        href={`/dashboard/influencers/${application.influencer.id}`}
                        className="btn btn-secondary btn-sm"
                      >
                        Profile
                      </Link>
                      {canAct && (
                        <>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={applicationActionId === application.id}
                            onClick={() => handleApplicationAction(application.id, "accept")}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={applicationActionId === application.id}
                            onClick={() => handleApplicationAction(application.id, "reject")}
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="card">
        <h3 style={{ marginBottom: "8px" }}>Description</h3>
        <p style={{ color: "var(--color-text-secondary)", whiteSpace: "pre-line" }}>
          {campaign.description || "No description provided."}
        </p>
      </section>

      <section className="card">
        <h3 style={{ marginBottom: "8px" }}>Requirements</h3>
        <p style={{ color: "var(--color-text-secondary)", whiteSpace: "pre-line" }}>
          {campaign.requirements || "No requirements provided."}
        </p>
      </section>

      {campaign.guidelines && (
        <section className="card">
          <h3 style={{ marginBottom: "8px" }}>Guidelines</h3>
          <p style={{ color: "var(--color-text-secondary)", whiteSpace: "pre-line" }}>
            {campaign.guidelines}
          </p>
        </section>
      )}

      <section className="card">
        <h3 style={{ marginBottom: "8px" }}>Deliverables</h3>
        {campaign.deliverables.length === 0 ? (
          <p style={{ color: "var(--color-text-secondary)" }}>No deliverables specified.</p>
        ) : (
          <div style={{ display: "grid", gap: "8px" }}>
            {campaign.deliverables.map((item, index) => (
              <div key={`${item.type}-${index}`} className="badge" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{item.type}</span>
                <span>x{item.count}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h3 style={{ marginBottom: "8px" }}>Targeting</h3>
        <div style={{ display: "grid", gap: "10px" }}>
          <div>
            <strong>Categories:</strong>{" "}
            {campaign.targetCategories.length > 0
              ? campaign.targetCategories.join(", ")
              : "Any"}
          </div>
          <div>
            <strong>Cities:</strong>{" "}
            {campaign.targetCities.length > 0 ? campaign.targetCities.join(", ") : "Any"}
          </div>
          <div>
            <strong>Languages:</strong>{" "}
            {campaign.targetLanguages.length > 0
              ? campaign.targetLanguages.join(", ")
              : "Any"}
          </div>
        </div>
      </section>

      <section className="card">
        <h3 style={{ marginBottom: "8px" }}>Timeline</h3>
        <div style={{ display: "grid", gap: "6px", color: "var(--color-text-secondary)" }}>
          <div>Apply by: {formatDate(campaign.applicationDeadline)}</div>
          <div>Content due: {formatDate(campaign.contentDeadline)}</div>
          <div>Posting due: {formatDate(campaign.postingDeadline)}</div>
        </div>
      </section>

      {showApplyModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            padding: "16px",
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: "560px" }}>
            <h3 style={{ marginBottom: "12px" }}>Apply for Campaign</h3>

            <label className="label">Proposal (minimum 50 characters)</label>
            <textarea
              className="input"
              rows={5}
              value={proposal}
              onChange={(e) => setProposal(e.target.value)}
              placeholder="Tell the brand why you are a strong fit for this campaign"
            />
            <p style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
              {proposal.length}/1000
            </p>

            <label className="label" style={{ marginTop: "12px" }}>Your rate (Rs)</label>
            <input
              className="input"
              type="number"
              min={1}
              value={proposedRate}
              onChange={(e) => setProposedRate(Number(e.target.value) || 0)}
            />
            {recommendedPayout > 0 && (
              <span style={{ fontSize: "12px", color: "#10b981", marginTop: "4px", display: "block" }}>
                💡 Recommended Payout Estimate for your stats: <strong>₹{recommendedPayout.toLocaleString("en-IN")}</strong>
              </span>
            )}

            <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowApplyModal(false)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleApply}
                disabled={isSubmitting || proposal.trim().length < 50}
              >
                {isSubmitting ? "Submitting..." : "Submit Application"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
