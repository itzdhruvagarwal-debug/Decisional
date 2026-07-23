"use client";

import Link from "next/link";
import { Button } from "@/components/ui";
import EmptyState from "@/components/ui/EmptyState";
import { formatCurrency } from "@/lib/utils-client";
import { CampaignApplication } from "./CampaignDetailHelpers";

interface ApplicationsListProps {
  readonly loading: boolean;
  readonly applications: readonly CampaignApplication[];
  readonly actionId: string | null;
  readonly onAction: (id: string, action: "accept" | "reject") => void;
}

export function ApplicationsList({
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
