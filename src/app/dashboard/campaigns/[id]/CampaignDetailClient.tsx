"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/utils-client";
import { Button, Input, Textarea } from "@/components/ui";
import { ApplicationsList } from "@/components/dashboard/campaigns/details/ApplicationsList";
import { useCampaignDetail } from "@/components/dashboard/campaigns/details/useCampaignDetail";

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

export default function CampaignDetailClient({
  user,
  influencerProfile = null,
}: CampaignDetailClientProps) {
  const { id: campaignId } = useParams() as { id: string };
  const router = useRouter();

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
    setNotice,
    hasApplied,
    applicationStatus,
    recommendedPayout,
    isOwner,
    canApply,
    handleApplicationAction,
    handleApply,
    handleCampaignAction,
  } = useCampaignDetail({
    campaignId,
    user,
    influencerProfile,
    router,
  });

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <span className="loading w-32 h-32" />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="p-6 text-center max-w-500 mx-auto">
        <div className="text-3xl mb-4">⚠️</div>
        <h2 className="font-bold text-xl mb-2 text-primary">Error Loading Campaign</h2>
        <p className="text-secondary mb-6">{error || "Campaign not found"}</p>
        <Link href="/dashboard/campaigns" className="btn btn-primary">
          Back to Campaigns
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 max-w-1000 mx-auto pb-16">
      {/* Header section */}
      <header className="flex justify-between items-start gap-4 flex-wrap pb-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1 className="font-black text-2xl md:text-3xl tracking-tight text-primary">
              {campaign.title}
            </h1>
            <span className="badge font-bold uppercase tracking-wider">{campaign.status}</span>
          </div>
          {campaign.brand && (
            <div className="flex items-center gap-2 text-sm text-secondary">
              {campaign.brand.logo && (
                <Image
                  src={campaign.brand.logo}
                  alt={campaign.brand.companyName}
                  width={20}
                  height={20}
                  className="rounded-full object-cover"
                />
              )}
              <span className="font-semibold text-primary">{campaign.brand.companyName}</span>
              {campaign.brand.averageRating > 0 && (
                <span>⭐ {(campaign.brand.averageRating).toFixed(1)}</span>
              )}
              {campaign.brand.isGstVerified && (
                <span className="text-emerald" title="GST details verified for legal compliance">✓ GST Verified</span>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <Link href="/dashboard/campaigns" className="btn btn-secondary">
            Back
          </Link>
          {isOwner && campaign.status === "DRAFT" && (
            <>
              <Link href={`/dashboard/campaigns/create?edit=${campaign.id}`} className="btn btn-secondary">
                Edit Draft
              </Link>
              <Button
                type="button"
                variant="primary"
                onClick={() => handleCampaignAction("ACTIVATE")}
              >
                Launch Campaign
              </Button>
            </>
          )}
          {isOwner && campaign.status === "ACTIVE" && (
            <Button
              type="button"
              variant="danger"
              onClick={() => handleCampaignAction("CANCEL")}
            >
              Cancel Campaign
            </Button>
          )}
        </div>
      </header>

      {notice && (
        <div className={`p-4 rounded-md border-card text-sm text-center ${notice.type === "success" ? "bg-emerald-subtle text-emerald border-emerald" : "bg-rose-subtle text-rose border-rose"}`}>
          {notice.message}
        </div>
      )}

      {/* Grid container */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left main info */}
        <div className="md:col-span-2 grid gap-6">
          <section className="card p-6">
            <h3 className="text-lg font-bold mb-3 text-primary">Campaign Details</h3>
            <p className="text-secondary text-sm leading-relaxed whitespace-pre-wrap">
              {campaign.description}
            </p>
          </section>

          <section className="card p-6">
            <h3 className="text-lg font-bold mb-3 text-primary">Requirements & Guidelines</h3>
            <p className="text-secondary text-sm leading-relaxed whitespace-pre-wrap">
              {campaign.requirements}
            </p>
          </section>

          {/* Applications list for campaign owner */}
          {isOwner && (
            <section className="card p-6">
              <h3 className="text-lg font-bold mb-4 text-primary">
                Applications ({campaign.totalApplications})
              </h3>
              <ApplicationsList
                loading={applicationsLoading}
                applications={applications}
                actionId={applicationActionId}
                onAction={handleApplicationAction}
              />
            </section>
          )}
        </div>

        {/* Right sidebar */}
        <div className="grid gap-6 h-fit">
          <section className="card p-6">
            <h3 className="text-base font-bold mb-4 text-primary">Key Metrics</h3>
            <div className="grid gap-4">
              <div>
                <span className="text-xs text-muted block uppercase tracking-wider">Total Escrow Budget</span>
                <strong className="text-xl font-extrabold text-primary">
                  {formatCurrency(campaign.totalBudget)}
                </strong>
              </div>

              {campaign.perInfluencerBudget !== null && (
                <div>
                  <span className="text-xs text-muted block uppercase tracking-wider">Per Creator Payout</span>
                  <strong className="text-base font-bold text-primary">
                    {formatCurrency(campaign.perInfluencerBudget)}
                  </strong>
                </div>
              )}

              <div>
                <span className="text-xs text-muted block uppercase tracking-wider">Target Followers</span>
                <strong className="text-sm font-semibold text-primary">
                  {campaign.minFollowers.toLocaleString()}
                  {campaign.maxFollowers ? ` - ${campaign.maxFollowers.toLocaleString()}` : "+"}
                </strong>
              </div>

              {campaign.maxInfluencers && (
                <div>
                  <span className="text-xs text-muted block uppercase tracking-wider">Slots Filled</span>
                  <strong className="text-sm font-semibold text-primary">
                    {campaign.acceptedCount} / {campaign.maxInfluencers}
                  </strong>
                </div>
              )}

              {campaign.applicationDeadline && (
                <div>
                  <span className="text-xs text-muted block uppercase tracking-wider">Application Deadline</span>
                  <strong className="text-sm font-semibold text-primary">
                    {formatDate(campaign.applicationDeadline)}
                  </strong>
                </div>
              )}

              <div>
                <span className="text-xs text-muted block uppercase tracking-wider">Posting Target Date</span>
                <strong className="text-sm font-semibold text-primary">
                  {formatDate(campaign.postingDeadline)}
                </strong>
              </div>
            </div>

            {/* Application button for influencer */}
            {canApply && (
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setNotice(null);
                  setShowApplyModal(true);
                }}
                className="w-full mt-6"
              >
                Apply to Campaign
              </Button>
            )}

            {hasApplied && (
              <div className="mt-6 p-3 bg-secondary rounded-md text-center border-card">
                <span className="text-xs text-muted block mb-1">Your Application Status</span>
                <strong className="text-sm font-bold uppercase text-primary">
                  {applicationStatus || "SUBMITTED"}
                </strong>
              </div>
            )}
          </section>

          {/* Deliverables card */}
          <section className="card p-6">
            <h3 className="text-base font-bold mb-3 text-primary">Deliverables Checklist</h3>
            <ul className="grid gap-2-5 list-none">
              {campaign.deliverables.map((item, idx) => (
                <li key={`${item.type}-${idx}`} className="flex items-start gap-2-5 text-sm text-secondary">
                  <span className="flex-shrink-0 text-emerald">✓</span>
                  <div>
                    <span className="font-semibold text-primary">
                      {item.count}x {item.type.replace(/_/g, " ").toLowerCase()}
                    </span>
                    {item.specs && (
                      <p className="text-muted text-xs mt-0.5 leading-relaxed">{item.specs}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Target Niches */}
          {campaign.targetCategories.length > 0 && (
            <section className="card p-6">
              <h3 className="text-base font-bold mb-3 text-primary">Target Niches</h3>
              <div className="flex flex-wrap gap-1-5">
                {campaign.targetCategories.map((c) => (
                  <span key={c} className="badge bg-tertiary">
                    {c}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Apply Modal */}
      {showApplyModal && (
        <div className="modal-overlay">
          <div className="modal-content max-w-500 card p-6">
            <h3 className="font-bold text-lg mb-4 text-primary">Apply to Campaign</h3>

            <div className="grid gap-4">
              <Textarea
                label="Proposal Description (Why should the brand hire you?)"
                id="proposal"
                placeholder="Write a professional proposal explaining your content ideas and fit for this campaign (Minimum 50 characters)..."
                value={proposal}
                onChange={(e) => setProposal(e.target.value)}
                required
                className="h-160"
              />

              <div>
                <Input
                  label="Your Proposed Payout (Rs)"
                  id="proposed-rate"
                  type="number"
                  placeholder="Rate in Rs"
                  value={proposedRate || ""}
                  onChange={(e) => setProposedRate(Number(e.target.value))}
                  required
                />
                {recommendedPayout > 0 && (
                  <span className="text-muted text-2xs mt-1 block">
                    💡 Recommended for your stats: ₹{(recommendedPayout / 100).toLocaleString()}
                  </span>
                )}
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowApplyModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleApply}
                  disabled={isSubmitting || proposedRate <= 0}
                >
                  {isSubmitting ? "..." : "Submit"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
