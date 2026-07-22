"use client";

import Link from "next/link";
import Image from "next/image";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils-client";
import EmptyState from "@/components/ui/EmptyState";
import { Button, Input, Textarea } from "@/components/ui";

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
      const specsStr = typeof parsed?.specs === "string" ? parsed.specs.trim() : "";
      return {
        type: typeof parsed?.type === "string" ? parsed.type.trim() : "",
        count: Math.max(1, Number(parsed?.count || 1)),
        ...(specsStr ? { specs: specsStr } : {}),
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
  hasApplied?: boolean;
  applicationStatus?: string | null;
}

interface CampaignDetailResponse {
  data?: { campaign?: RawCampaign; hasApplied?: boolean; applicationStatus?: string };
  campaign?: RawCampaign;
  hasApplied?: boolean;
  applicationStatus?: string;
  message?: string;
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
    maxInfluencers: raw.maxInfluencers ?? null,
    acceptedCount: raw.applications ? raw.applications.length : 0,
  };
}

interface ApplicationsListProps {
  readonly loading: boolean;
  readonly applications: readonly CampaignApplication[];
  readonly actionId: string | null;
  readonly onAction: (id: string, action: "accept" | "reject") => void;
}

function ApplicationsList({
  loading,
  applications,
  actionId,
  onAction,
}: ApplicationsListProps) {
  if (loading) {
    return (
      <div className="p-6 text-center">
        <span className="loading" />
      </div>
    );
  }
  if (applications.length === 0) {
    return (
      <EmptyState
        emoji="✉️"
        title="No Applications Yet"
        description="No creators have applied to this campaign yet."
        compact
      />
    );
  }

  return (
    <div className="grid gap-3">
      {applications.map((application) => {
        const canAct = ["PENDING", "SHORTLISTED"].includes(application.status);
        const matchScore = application.matchScore;
        
        let matchBgColor = "rgba(239, 68, 68, 0.15)";
        let matchTextColor = "#ef4444";
        if (matchScore !== undefined) {
          if (matchScore >= 80) {
            matchBgColor = "rgba(16, 185, 129, 0.15)";
            matchTextColor = "#10b981";
          } else if (matchScore >= 50) {
            matchBgColor = "rgba(245, 158, 11, 0.15)";
            matchTextColor = "#f59e0b";
          }
        }

        return (
          <article
            key={application.id}
            className="grid gap-4 p-4 bg-tertiary rounded-md border-card" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}
          >
            <div className="min-w-0">
              <div
                className="flex items-center flex-wrap mb-2 gap-2-5"
              >
                <strong>{application.influencer.displayName}</strong>
                <span className="badge">{application.status}</span>
                <span className="badge">
                  Trust {application.influencer.user?.trustScore ?? 0}
                </span>
                <span className="badge">
                  {formatCurrency(application.proposedRate)}
                </span>
                {matchScore !== undefined && (
                  <span
                    className="badge font-bold" style={{ backgroundColor: matchBgColor, color: matchTextColor, borderColor: matchTextColor }}
                    title={`Match Score Details:\n- Niche Fit: ${application.matchBreakdown?.categoryScore}%\n- Engagement Fit: ${application.matchBreakdown?.engagementScore}%\n- Authenticity Fit: ${application.matchBreakdown?.authenticityScore}%\n- Reputation Fit: ${application.matchBreakdown?.qualityScore}%\n- ROI/CPV Fit (Projected): ${application.matchBreakdown?.roiScore}%\n- Est. Views (Modelled): ${application.matchBreakdown?.estimatedViews}\n- Est. CPV (Modelled): ₹${((application.matchBreakdown?.estimatedCpvPaise || 0) / 100).toFixed(2)}`}
                  >
                    🔥 {matchScore}% Match
                  </span>
                )}
              </div>
              <p
                className="text-secondary text-sm leading-normal mb-2"
              >
                {application.proposal}
              </p>
              <div
                className="flex flex-wrap text-muted text-xs gap-2-5"
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
                  <span className="text-emerald" style={{ fontWeight: "600" }} title="This is a modelled projection based on follower stats and campaign budget, not verified API statistics.">
                    Projected CPV: ₹{((application.matchBreakdown.estimatedCpvPaise || 0) / 100).toFixed(2)} / view (Est.)
                  </span>
                )}
              </div>
            </div>

            <div
              className="flex items-start gap-2 flex-wrap justify-end"
            >
              <Link
                href={`/dashboard/influencers/${application.influencer.id}`}
                className="btn btn-secondary btn-sm"
              >
                Profile
              </Link>
              {canAct && (
                <>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={actionId === application.id}
                    onClick={() => onAction(application.id, "accept")}
                  >
                    Accept
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={actionId === application.id}
                    onClick={() => onAction(application.id, "reject")}
                  >
                    Reject
                  </Button>
                </>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

interface CampaignDetailClientProps {
  readonly user: { readonly id: string; readonly userType?: string };
  readonly influencerProfile?: {
    readonly id: string;
    readonly instagramFollowers: number | null;
    readonly instagramEngagementRate: number | null;
    readonly youtubeSubscribers: number | null;
    readonly youtubeEngagementRate: number | null;
  } | null;
}

function calculateRecommendedPayout(
  influencerProfile: {
    readonly instagramFollowers: number | null;
    readonly instagramEngagementRate: number | null;
    readonly youtubeSubscribers: number | null;
    readonly youtubeEngagementRate: number | null;
  },
  deliverables: Array<{ type: string; count: number }>
): number {
  let instagramCount = 0;
  let youtubeCount = 0;

  deliverables.forEach((d) => {
    const type = d.type.toUpperCase();
    if (type.startsWith("INSTAGRAM")) {
      instagramCount += d.count;
    } else if (type.startsWith("YOUTUBE")) {
      youtubeCount += d.count;
    }
  });

  const igFollowers = influencerProfile.instagramFollowers || 0;
  const igER = influencerProfile.instagramEngagementRate || 0;
  const instagramPayout = (igFollowers * (igER / 100)) * 2 * instagramCount;

  const ytSubscribers = influencerProfile.youtubeSubscribers || 0;
  const ytER = influencerProfile.youtubeEngagementRate || 0;
  const youtubePayout = (ytSubscribers * (ytER / 100)) * 2.5 * youtubeCount;

  return Math.round(instagramPayout + youtubePayout);
}

function promptNegotiatedRate(proposedRate: number): number | null {
  const proposedRateInRupees = proposedRate / 100;
  const rateInput = prompt(
    `Accept application at the proposed rate of ₹${proposedRateInRupees.toLocaleString()}?\n\nOr enter a custom negotiated payout rate in INR:`,
    proposedRateInRupees.toString()
  );
  if (rateInput === null) {
    return null;
  }
  const customRateRupees = Number(rateInput);
  if (Number.isNaN(customRateRupees) || customRateRupees <= 0) {
    alert("Please enter a valid rate");
    return null;
  }
  return Math.round(customRateRupees * 100);
}

function buildApplicationActionRequest(
  action: "accept" | "reject",
  applicationId: string,
  applications: CampaignApplication[]
): RequestInit | null {
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
}

function useCampaignDetail(
  campaignId: string | null | undefined,
  user: CampaignDetailClientProps["user"],
  influencerProfile: CampaignDetailClientProps["influencerProfile"],
  router: ReturnType<typeof useRouter>
) {
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [proposal, setProposal] = useState("");
  const [proposedRate, setProposedRate] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [applications, setApplications] = useState<CampaignApplication[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [applicationActionId, setApplicationActionId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const { data: payload, isLoading: loading, error: fetchErr, mutate: refreshCampaign } = useSWR<CampaignDetailResponse>(
    campaignId ? `/api/campaigns/${encodeURIComponent(campaignId)}` : null,
    fetcher
  );

  const rawCampaign: RawCampaign | null = payload?.data?.campaign || payload?.campaign || (payload?.data && "id" in payload.data ? (payload.data as RawCampaign) : null);
  const campaign = useMemo(() => rawCampaign ? normalizeCampaign(rawCampaign) : null, [rawCampaign]);
  const error = fetchErr ? "Failed to load campaign" : (!rawCampaign && payload ? (payload?.message || "Campaign not found") : "");

  const hasApplied = Boolean(payload?.data?.hasApplied || rawCampaign?.hasApplied || payload?.hasApplied);
  const applicationStatus = payload?.data?.applicationStatus || rawCampaign?.applicationStatus || payload?.applicationStatus || null;

  const recommendedPayout = useMemo(() => {
    if (!influencerProfile || !campaign) return 0;
    return calculateRecommendedPayout(influencerProfile, campaign.deliverables);
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
        message: (appError instanceof Error ? appError.message : String(appError)) || "Failed to load applications",
      });
    } finally {
      setApplicationsLoading(false);
    }
  }, [campaignId, isOwner]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const handleApplicationAction = async (
    applicationId: string,
    action: "accept" | "reject",
  ) => {
    setApplicationActionId(applicationId);
    setNotice(null);
    try {
      const requestInit = buildApplicationActionRequest(action, applicationId, applications);
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
      refreshCampaign();
      router.push("/dashboard/deals");
    } catch (applyError: unknown) {
      setNotice({ type: "error", message: (applyError instanceof Error ? applyError.message : String(applyError)) || "Failed to submit application" });
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

    if (!globalThis.confirm(confirmText)) return;

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

      refreshCampaign();
      setNotice({ type: "success", message: payload?.message || "Campaign updated successfully" });
      router.refresh();
    } catch (actionError: unknown) {
      setNotice({ type: "error", message: (actionError instanceof Error ? actionError.message : String(actionError)) || "Campaign update failed" });
    }
  };

  return {
    loading,
    error,
    campaign,
    refreshCampaign,
    showApplyModal,
    setShowApplyModal,
    proposal,
    setProposal,
    proposedRate,
    setProposedRate,
    isSubmitting,
    applications,
    applicationsLoading,
    applicationActionId,
    notice,
    setNotice,
    hasApplied,
    applicationStatus,
    recommendedPayout,
    isOwner,
    canApply,
    fetchApplications,
    handleApplicationAction,
    handleApply,
    handleCampaignAction,
  };
}

export default function CampaignDetailClient({
  user,
  influencerProfile,
}: CampaignDetailClientProps) {
  const params = useParams();
  const router = useRouter();

  const campaignId = useMemo(() => {
    const id = params?.id;
    return Array.isArray(id) ? id[0] : id;
  }, [params]);

  const {
    loading,
    error,
    campaign,
    showApplyModal,
    setShowApplyModal,
    proposal,
    setProposal,
    proposedRate,
    setProposedRate,
    isSubmitting,
    applications,
    applicationsLoading,
    applicationActionId,
    notice,
    hasApplied,
    applicationStatus,
    recommendedPayout,
    isOwner,
    canApply,
    fetchApplications,
    handleApplicationAction,
    handleApply,
    handleCampaignAction,
  } = useCampaignDetail(campaignId, user, influencerProfile, router);

  if (loading) {
    return (
      <div className="flex justify-center p-10">
        <span className="loading w-40 h-40" />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="card text-center mx-auto" style={{ maxWidth: "760px" }}>
        <h2 className="mb-2">{error || "Campaign not found"}</h2>
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

  const applicationsList = (
    <ApplicationsList
      loading={applicationsLoading}
      applications={applications}
      actionId={applicationActionId}
      onAction={handleApplicationAction}
    />
  );

  return (
    <div className="campaign-detail-page grid gap-4 max-w-980 mx-auto">
      <Link href="/dashboard/campaigns" className="campaign-detail-back text-sm text-secondary">
        Back to campaigns
      </Link>

      <section className="card campaign-detail-hero grid gap-3">
        <div className="flex justify-between gap-3 flex-wrap">
          <div className="campaign-detail-title-block">
            <div className="campaign-card-logo campaign-detail-logo" aria-hidden="true">
              {campaign.brand?.logo ? (
                <Image src={campaign.brand.logo} alt="" fill unoptimized className="object-cover" />
              ) : (
                (campaign.brand?.companyName || "DC").slice(0, 2).toUpperCase()
              )}
            </div>
            <h1 className="font-extrabold text-3xl">{campaign.title}</h1>
            <p className="text-secondary mt-1">
              {campaign.brand?.companyName || "Unknown Brand"}
              {campaign.brand?.isGstVerified ? " · Verified" : ""}
              {campaign.brand?.averageRating ? ` · ${campaign.brand.averageRating.toFixed(1)} rating` : ""}
            </p>
          </div>

          <div className="campaign-detail-actions flex gap-2 items-start flex-wrap">
            <span className="badge">Status: {campaign.status}</span>
            {isOwner && campaign.status === "DRAFT" && (
              <>
                <Link href={`/dashboard/campaigns/create?edit=${campaign.id}`} className="btn btn-secondary">
                  Edit Campaign
                </Link>
                <Button variant="primary" onClick={() => handleCampaignAction("ACTIVATE")}>
                  Activate Campaign
                </Button>
              </>
            )}
            {isOwner && ["ACTIVE", "PAUSED"].includes(campaign.status) && (
              <Button variant="secondary" onClick={() => handleCampaignAction("CANCEL")}>
                Cancel Campaign
              </Button>
            )}
            {isOwner && ["ACTIVE", "PAUSED", "COMPLETED"].includes(campaign.status) && (
              <Button
                href={`/api/reports/brand/campaign/${campaign.id}/roi?format=csv`}
                variant="secondary"
                className="inline-flex items-center gap-1-5"
              >
                📊 Download ROI Report (CSV)
              </Button>
            )}
            {canApply && (
              <Button variant="primary" onClick={() => setShowApplyModal(true)}>
                Apply Now
              </Button>
            )}
            {user?.userType === "INFLUENCER" && hasApplied && (
              <Button variant="secondary" disabled className="cursor-not-allowed" style={{ opacity: 0.7 }}>
                Applied ({applicationStatus || "PENDING"})
              </Button>
            )}


          </div>
        </div>

        <div className="campaign-detail-stats grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div className="campaign-detail-stat m-0">
            <div className="text-xs text-muted">Per Influencer</div>
            <div className="text-xl font-bold">
              {formatCurrency(campaign.perInfluencerBudget || campaign.totalBudget)}
            </div>
          </div>
          {user?.userType === "INFLUENCER" && recommendedPayout > 0 && (
            <div className="campaign-detail-stat m-0" style={{ border: "1px solid #10b981", background: "rgba(16, 185, 129, 0.08)" }}>
              <div className="text-xs font-semibold text-emerald">💡 Recommended Payout</div>
              <div className="text-xl font-extrabold text-emerald">
                ₹{recommendedPayout.toLocaleString("en-IN")}
              </div>
            </div>
          )}
          <div className="campaign-detail-stat m-0">
            <div className="text-xs text-muted">Applications</div>
            <div className="text-xl font-bold">{applicationsCount}</div>
          </div>
          <div className="campaign-detail-stat m-0">
            <div className="text-xs text-muted">Slots Filled</div>
            <div className="text-xl font-bold">
              {typeof campaign.maxInfluencers === "number"
                ? `${campaign.acceptedCount} / ${campaign.maxInfluencers}`
                : `${campaign.acceptedCount} (Unlimited)`}
            </div>
          </div>
          <div className="campaign-detail-stat m-0">
            <div className="text-xs text-muted">Followers Needed</div>
            <div className="text-xl font-bold">
              {campaign.maxFollowers
                ? `${campaign.minFollowers.toLocaleString()} - ${campaign.maxFollowers.toLocaleString()}`
                : `${campaign.minFollowers.toLocaleString()}+`}
            </div>
          </div>
        </div>
      </section>

      {notice && (
        <div
          className="card px-4-py-3" style={{ borderColor:
              notice.type === "success"
                ? "rgba(34, 197, 94, 0.35)"
                : "rgba(239, 68, 68, 0.35)", color:
              notice.type === "success"
                ? "var(--color-success)"
                : "var(--color-error)" }}
        >
          {notice.message}
        </div>
      )}

      {isOwner && (
        <section className="card">
          <div
            className="flex justify-between items-center gap-3 flex-wrap mb-4"
          >
            <div>
              <h3 className="mb-1">Applications</h3>
              <p className="text-secondary text-sm">
                Review applicants and start deals from this campaign.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={fetchApplications}
              disabled={applicationsLoading}
            >
              {applicationsLoading ? "Refreshing..." : "Refresh"}
            </Button>
          </div>

          {applicationsList}
        </section>
      )}

      <section className="card">
        <h3 className="mb-2">Description</h3>
        <p className="text-secondary whitespace-pre-line">
          {campaign.description || "No description provided."}
        </p>
      </section>

      <section className="card">
        <h3 className="mb-2">Requirements</h3>
        <p className="text-secondary whitespace-pre-line">
          {campaign.requirements || "No requirements provided."}
        </p>
      </section>

      {campaign.guidelines && (
        <section className="card">
          <h3 className="mb-2">Guidelines</h3>
          <p className="text-secondary whitespace-pre-line">
            {campaign.guidelines}
          </p>
        </section>
      )}

      <section className="card">
        <h3 className="mb-2">Deliverables</h3>
        {campaign.deliverables.length === 0 ? (
          <p className="text-secondary">No deliverables specified.</p>
        ) : (
          <div className="grid gap-2">
            {campaign.deliverables.map((item, index) => (
              <div key={`${item.type}-${index}`} className="badge flex justify-between">
                <span>{item.type}</span>
                <span>x{item.count}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h3 className="mb-2">Targeting</h3>
        <div className="grid gap-2-5">
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
        <h3 className="mb-2">Timeline</h3>
        <div className="grid text-secondary gap-1-5">
          <div>Apply by: {formatDate(campaign.applicationDeadline)}</div>
          <div>Content due: {formatDate(campaign.contentDeadline)}</div>
          <div>Posting due: {formatDate(campaign.postingDeadline)}</div>
        </div>
      </section>

      {showApplyModal && (
        <div
          className="fixed flex items-center justify-center p-4 inset-0" style={{ background: "rgba(0,0,0,0.75)", zIndex: 60 }}
        >
          <div className="card w-full" style={{ maxWidth: "560px" }}>
            <h3 className="mb-3">Apply for Campaign</h3>

            <Textarea
              label="Proposal (minimum 50 characters)"
              id="proposal-input"
              rows={5}
              value={proposal}
              onChange={(e) => setProposal(e.target.value)}
              placeholder="Tell the brand why you are a strong fit for this campaign"
              fullWidth
            />
            <p className="text-xs text-muted">
              {proposal.length}/1000
            </p>

            <Input
              label="Your rate (Rs)"
              id="proposed-rate-input"
              type="number"
              min={1}
              value={proposedRate}
              onChange={(e) => setProposedRate(Number(e.target.value) || 0)}
              fullWidth
              className="mt-3"
            />
            {recommendedPayout > 0 && (
              <span className="text-xs mt-1 block text-emerald">
                💡 Recommended Payout Estimate for your stats: <strong>₹{recommendedPayout.toLocaleString("en-IN")}</strong>
              </span>
            )}

            <div className="flex mt-4 gap-2-5">
              <Button
                variant="secondary"
                onClick={() => setShowApplyModal(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleApply}
                disabled={isSubmitting || proposal.trim().length < 50}
              >
                {isSubmitting ? "Submitting..." : "Submit Application"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
