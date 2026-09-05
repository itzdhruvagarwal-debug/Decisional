"use client";

import React from "react";
import { Card, Button, EmptyState } from "@/components/ui";
import {
  type DealDetail,
  type ContentSubmission,
  type ContentUrlEntry,
  type EngagementReport,
  type EngagementSnapshot,
  parseContractTerms,
  formatContractDate,
  getIncludedRevisions,
  getFlatDeliverablesList,
} from "./DealDetailHelpers";

// ==========================================
// 1. DEAL PROGRESS
// ==========================================
interface DealProgressProps {
  readonly status: string;
}

export function DealProgress({ status }: Readonly<DealProgressProps>) {
  const steps = [
    { s: "PENDING_SIGNATURE", label: "Contract Signing" },
    { s: "ACTIVE", label: "Content Creation" },
    { s: "CONTENT_SUBMITTED", label: "Brand Review" },
    { s: "CONTENT_APPROVED", label: "Approved & Posting" },
    { s: "VERIFIED", label: "Verified & Payment" },
    { s: "COMPLETED", label: "Completed" },
  ];

  let lookupStatus = status;
  if (status === "REVISION_REQUESTED") {
    lookupStatus = "CONTENT_SUBMITTED";
  } else if (
    status === "POSTED" ||
    status === "VERIFICATION_PENDING" ||
    status === "PAYMENT_HELD" ||
    status === "DISPUTED"
  ) {
    lookupStatus = "VERIFIED";
  }

  const stepsMap = steps.map((a) => a.s);
  let currentIndex = stepsMap.indexOf(lookupStatus);
  if (currentIndex === -1) {
    currentIndex = 1;
  }
  const isCancelled = status === "CANCELLED";

  return (
    <Card className="deal-progress-card mb-6">
      <h2 className="section-title text-lg font-bold mb-4">Deal Progress</h2>

      <ul
        aria-label="Deal progress stages"
        className="deal-progress-list flex flex-col gap-6"
      >
        {steps.map((step, idx) => {
          const isCompleted = currentIndex > idx;
          const isCurrent = currentIndex === idx;

          let circleStatus = "pending";
          if (isCompleted) {
            circleStatus = "completed";
          } else if (isCurrent && !isCancelled) {
            circleStatus = "current";
          }

          let labelStatusSuffix = "Pending";
          if (isCompleted) {
            labelStatusSuffix = "Completed";
          } else if (isCurrent) {
            labelStatusSuffix = "Current step";
          }

          const labelStatus = isCompleted || isCurrent ? "current" : "pending";
          const liOpacity = isCancelled ? "opacity-50" : "";

          return (
            <li
              key={step.s}
              aria-current={isCurrent ? "step" : undefined}
              aria-label={`${idx + 1}. ${step.label} ${labelStatusSuffix}`}
              className={`flex items-center gap-4 ${liOpacity}`}
            >
              <div
                className={`deal-progress-step-circle flex items-center justify-center font-bold text-sm rounded-full ${circleStatus}`}
              >
                {isCompleted ? (
                  <svg
                    width={14}
                    height={14}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-3.5 h-3.5"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  idx + 1
                )}
              </div>
              <div>
                <div
                  className={`deal-progress-step-label ${
                    isCurrent ? "font-bold text-primary" : "font-semibold text-muted"
                  } ${labelStatus}`}
                >
                  {step.label}
                </div>
                {isCurrent && !isCancelled && (
                  <div className="text-xs text-primary">In Progress</div>
                )}
              </div>
            </li>
          );
        })}
        {isCancelled && (
          <li className="p-3 font-semibold text-center rounded-md text-rose bg-rose-subtle">
            Deal Cancelled
          </li>
        )}
      </ul>
    </Card>
  );
}

// ==========================================
// 2. DEAL CONTRACT CARD
// ==========================================
interface DealContractCardProps {
  readonly deal: DealDetail;
}

export function DealContractCard({ deal }: Readonly<DealContractCardProps>) {
  const contractTerms = parseContractTerms(deal.contractTerms);
  const terms = contractTerms;
  const requiresProduct = Boolean(deal.requiresProduct || terms?.requiresProduct);

  return (
    <Card className="card p-6">
      <h3 className="font-bold text-lg mb-4">Contract Terms</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 className="font-semibold mb-2">Obligations & Deliverables</h4>
          <div className="text-sm text-secondary">
            {requiresProduct && (
              <div className="mb-2">
                <strong>Requires Product Seeding:</strong> Yes
              </div>
            )}
            <div className="mb-2">
              <strong>Included Revisions:</strong> {getIncludedRevisions(terms, deal)}
            </div>
            {terms?.mandatoryElements && (
              <div className="mb-2">
                <strong>Mandatory Elements:</strong>{" "}
                {Array.isArray(terms.mandatoryElements)
                  ? terms.mandatoryElements.join(", ")
                  : String(terms.mandatoryElements)}
              </div>
            )}
          </div>
        </div>

        <div>
          <h4 className="font-semibold mb-2">Timeline & Execution</h4>
          <div className="text-sm text-secondary">
            <div className="mb-2">
              <strong>Submission Deadline:</strong>{" "}
              {formatContractDate(terms?.submissionDeadline)}
            </div>
            <div className="mb-2">
              <strong>Posting Deadline:</strong>{" "}
              {formatContractDate(terms?.postingDeadline)}
            </div>
            <div className="mb-2">
              <strong>Review Window:</strong>{" "}
              {typeof terms?.reviewPeriodHours === "number"
                ? terms.reviewPeriodHours
                : 48}{" "}
              hours
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ==========================================
// 3. ENGAGEMENT CARD
// ==========================================
export function EngagementCard({
  engagement,
  disclaimer,
  isClient,
}: {
  readonly engagement: EngagementReport | null;
  readonly disclaimer: string | null;
  readonly isClient: boolean;
}) {
  if (!engagement || engagement.snapshots.length === 0) return null;

  const trendLabels: Record<string, string> = {
    GROWING: "↗ Growing",
    STABLE: "→ Stable",
    DECLINING: "↘ Declining",
    INSUFFICIENT_DATA: "— Insufficient data",
  };
  const latestSnap = engagement.snapshots.at(-1);
  const roi = engagement.roi;
  const trend = engagement.trend ?? "INSUFFICIENT_DATA";

  return (
    <Card className="card mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold mb-0 flex items-center gap-2">
          <svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4.5 h-4.5 text-blue-500"
          >
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          Post Performance
        </h2>
        <span className="text-sm font-semibold engagement-trend" data-trend={trend}>
          {trendLabels[trend]}
        </span>
      </div>

      {disclaimer && (
        <div className="text-xs rounded-sm text-amber px-3 py-2 mb-3 engagement-disclaimer">
          {disclaimer}
        </div>
      )}

      <div className="flex gap-2 flex-wrap mb-4">
        {engagement.snapshots.map(
          (
            snap: EngagementSnapshot & { interval?: string; isEstimated?: boolean },
            idx: number
          ) => (
            <div
              key={`${snap.timestamp || snap.interval || "snapshot"}_${idx}`}
              className="p-3 bg-tertiary rounded-sm border-card engagement-snapshot"
            >
              <div className="text-muted mb-2 font-bold text-xs uppercase">
                {snap.interval || "Interval"}
                {snap.isEstimated ? " (est.)" : ""}
              </div>
              <div className="grid gap-1">
                {(
                  [
                    ["Views", snap.metrics.views.toLocaleString("en-IN")],
                    ["Likes", snap.metrics.likes.toLocaleString("en-IN")],
                    ["Comments", snap.metrics.comments.toLocaleString("en-IN")],
                    ["Shares", (snap.metrics.shares || 0).toLocaleString("en-IN")],
                    ["Reach", (snap.metrics.estimatedReach ?? 0).toLocaleString("en-IN")],
                    ["Eng. Rate", `${(snap.metrics.engagementRate ?? 0).toFixed(2)}%`],
                  ] as [string, string][]
                ).map(([label, val]) => (
                  <div key={label} className="flex justify-between text-xs">
                    <span className="text-muted">{label}</span>
                    <span className="font-semibold">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </div>

      {isClient && roi && (
        <div className="rounded-sm p-3.5 engagement-roi-card">
          <div className="text-sm font-bold mb-2 flex items-center gap-2">
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4 text-emerald"
            >
              <rect width="20" height="12" x="2" y="6" rx="2" />
              <circle cx="12" cy="12" r="2" />
              <path d="M6 12h.01M18 12h.01" />
            </svg>
            ROI Summary
          </div>
          <div className="grid gap-2.5 engagement-roi-grid">
            {(
              [
                ["Est. Value", `₹${((roi.estimatedValue ?? 0) / 100).toLocaleString("en-IN")}`],
                ["ROI", `${(roi.roiPercentage ?? 0) >= 0 ? "+" : ""}${roi.roiPercentage ?? 0}%`],
                ["Cost/View", `₹${((roi.costPerView ?? 0) / 100).toFixed(2)}`],
                ["Cost/Eng.", `₹${((roi.costPerEngagement ?? 0) / 100).toFixed(2)}`],
              ] as [string, string][]
            ).map(([label, val]) => (
              <div key={label} className="p-2 bg-secondary rounded-sm">
                <div className="text-muted text-2xs mb-0.5">{label}</div>
                <div
                  className="text-sm font-extrabold engagement-roi-value"
                  data-positive={(roi.roiPercentage ?? 0) >= 0 ? "true" : "false"}
                >
                  {val}
                </div>
              </div>
            ))}
          </div>
          <div className="text-muted mt-2 text-xs">
            Based on {latestSnap?.interval || "latest"} data. EMV: views=₹0.20, engagements=₹1.00, clicks=₹5.00.
          </div>
        </div>
      )}
    </Card>
  );
}

// ==========================================
// 4. CONTENT SUBMISSIONS CARD
// ==========================================
interface ContentSubmissionsCardProps {
  readonly submissions?: ContentSubmission[] | undefined;
}

export function ContentSubmissionsCard({
  submissions,
}: Readonly<ContentSubmissionsCardProps>) {
  if (!submissions || submissions.length === 0) {
    return (
      <EmptyState
        emoji=""
        title="No Submissions Yet"
        description="No content has been submitted for this deal."
        compact
      />
    );
  }

  const latestSub = submissions[0];
  if (!latestSub) return null;
  const notes = latestSub.notes || "";
  const subUrls: ContentUrlEntry[] = Array.isArray(latestSub.contentUrls)
    ? latestSub.contentUrls
    : [];

  return (
    <Card className="card p-6">
      <h3 className="font-bold text-lg mb-4">Submissions History</h3>
      <div className="flex flex-col gap-4">
        {subUrls.map((urlObj: ContentUrlEntry) => {
          let statusClass = "bg-color-primary-subtle text-color-primary";
          if (urlObj.status === "APPROVED") {
            statusClass = "bg-success-subtle text-success";
          } else if (urlObj.status === "REVISION_REQUESTED") {
            statusClass = "bg-rose-subtle text-rose";
          }

          return (
            <div
              key={urlObj.type}
              className="flex justify-between items-center p-3 bg-secondary rounded-md border-card"
            >
              <div>
                <div className="font-semibold text-sm">
                  {urlObj.type.replace(/_\d+$/, "").replaceAll("_", " ")}
                </div>
                <div className="text-xs text-secondary mt-0.5">
                  Submitted on {formatContractDate(latestSub.createdAt)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-1 rounded-full font-bold ${statusClass}`}>
                  {urlObj.status || "PENDING"}
                </span>
                <a
                  href={urlObj.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-primary hover:underline"
                >
                  View File ↗
                </a>
              </div>
            </div>
          );
        })}
        {notes.trim() && (
          <div className="p-3 bg-tertiary rounded-md text-sm text-secondary">
            <strong>Notes:</strong> {notes}
          </div>
        )}
      </div>
    </Card>
  );
}

// ==========================================
// 5. DEAL ACTION BUTTONS
// ==========================================
interface DealActionButtonsProps {
  readonly dealStatus: string;
  readonly dealId: string;
  readonly isInfluencer: boolean;
  readonly isClient: boolean;
  readonly isSubmitting: boolean;
  readonly canSubmitContent: boolean;
  readonly deal: DealDetail;
  readonly handleSignContract: () => void;
  readonly handleRejectInvite: () => void;
  readonly handleCancelDeal: () => void;
  readonly handleAction: (
    action: string,
    payload?: Record<string, unknown>
  ) => Promise<boolean>;
  readonly setItemizedUrls: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  readonly setContentForm: React.Dispatch<
    React.SetStateAction<{ contentUrl: string; notes: string }>
  >;
  readonly setShowSubmitModal: (v: boolean) => void;
  readonly setShowVerifyModal: (v: boolean) => void;
  readonly setItemizedReviews: React.Dispatch<
    React.SetStateAction<
      Record<string, { status: "APPROVED" | "REVISION_REQUESTED"; feedback: string }>
    >
  >;
  readonly setShowReviewModal: (v: boolean) => void;
}

export function DealActionButtons({
  dealStatus,
  dealId,
  isInfluencer,
  isClient,
  isSubmitting,
  canSubmitContent,
  deal,
  handleSignContract,
  handleRejectInvite,
  handleCancelDeal,
  handleAction,
  setItemizedUrls,
  setContentForm,
  setShowSubmitModal,
  setShowVerifyModal,
  setItemizedReviews,
  setShowReviewModal,
}: Readonly<DealActionButtonsProps>) {
  return (
    <div
      className="deal-detail-actions flex gap-3 mb-6 flex-wrap"
      aria-label="Deal actions"
    >
      {dealStatus === "PENDING_SIGNATURE" && (
        <>
          <Button
            variant="primary"
            onClick={handleSignContract}
            disabled={isSubmitting}
          >
            Sign Contract
          </Button>
          {isInfluencer && (
            <Button
              variant="danger"
              onClick={handleRejectInvite}
              disabled={isSubmitting}
            >
              Reject Invite
            </Button>
          )}
        </>
      )}

      {isInfluencer &&
        ["ACTIVE", "PAYMENT_HELD", "REVISION_REQUESTED"].includes(dealStatus) && (
          <Button
            variant="primary"
            onClick={() => {
              const latestSub = deal?.contentSubmissions?.[0];
              const prevUrls: Record<string, string> = {};
              if (latestSub?.contentUrls && Array.isArray(latestSub.contentUrls)) {
                latestSub.contentUrls.forEach((item: ContentUrlEntry) => {
                  prevUrls[item.type] = item.url || "";
                });
              }
              setItemizedUrls(prevUrls);
              setContentForm({
                contentUrl: latestSub?.contentUrl || "",
                notes: latestSub?.notes || "",
              });
              setShowSubmitModal(true);
            }}
            disabled={!canSubmitContent}
          >
            Submit Content
          </Button>
        )}

      {isInfluencer && dealStatus === "CONTENT_APPROVED" && (
        <Button
          variant="primary"
          onClick={() => setShowVerifyModal(true)}
        >
          Submit Post URL
        </Button>
      )}

      {isClient && dealStatus === "CONTENT_SUBMITTED" && (
        <Button
          variant="primary"
          onClick={() => {
            const latestSub = deal?.contentSubmissions?.[0];
            const prevReviews: Record<
              string,
              { status: "APPROVED" | "REVISION_REQUESTED"; feedback: string }
            > = {};
            const deliverablesList = getFlatDeliverablesList(deal);
            deliverablesList.forEach((item) => {
              const existing =
                latestSub?.contentUrls && Array.isArray(latestSub.contentUrls)
                  ? latestSub.contentUrls.find(
                      (urlObj: ContentUrlEntry) => urlObj.type === item.type
                    )
                  : null;
              prevReviews[item.type] = {
                status:
                  existing?.status === "APPROVED" ? "APPROVED" : "REVISION_REQUESTED",
                feedback: existing?.feedback || "",
              };
            });
            setItemizedReviews(prevReviews);
            setShowReviewModal(true);
          }}
        >
          Review Content
        </Button>
      )}

      {isClient && dealStatus === "POSTED" && (
        <Button
          variant="primary"
          onClick={() => {
            if (
              !confirm(
                "Release payment to the influencer? This will mark the deal as complete and transfer funds. This cannot be undone."
              )
            )
              return;
            handleAction("complete_deal");
          }}
          disabled={isSubmitting}
        >
          Release Payment
        </Button>
      )}

      {isClient && !["COMPLETED", "CANCELLED", "DISPUTED"].includes(dealStatus) && (
        <Button
          variant="danger"
          size="sm"
          onClick={handleCancelDeal}
          disabled={isSubmitting}
        >
          Cancel Deal
        </Button>
      )}

      <Button
        href={`/dashboard/messages?deal=${dealId}`}
        variant="secondary"
      >
        Message
      </Button>
      <Button
        href={`/dashboard/deals/${dealId}/dispute`}
        variant="danger"
      >
        Resolve Issue
      </Button>
    </div>
  );
}
