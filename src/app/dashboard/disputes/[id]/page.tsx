"use client";


import { logger } from "@/lib/logger-client";
import { useState, use, useCallback, useMemo } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import Link from "next/link";
import { ToastContainer, type ToastItem, type ToastType } from "@/components/ui/toast";
import { Button, Card, Input, Select, Textarea } from "@/components/ui";
import { z } from "zod";

export const disputeEscalationSchema = z.object({
  reason: z.string().min(10, "Reason must be at least 10 characters").max(500),
});

export const disputeEvidenceSchema = z.object({
  type: z.enum(["CONTRACT", "DELIVERABLE", "CHAT_LOG", "PAYMENT_PROOF", "OTHER"]),
  url: z.string().url("Please enter a valid URL"),
  description: z.string().min(5, "Description must be at least 5 characters").max(500),
});

interface Finding {
  check: string;
  result: "PASS" | "FAIL" | "WARNING" | "N/A";
  detail: string;
}

interface MediatorAnalysis {
  disputeId: string;
  tier: number;
  verdict: string;
  confidence: string;
  refundPercentage: number;
  influencerPayoutPercentage: number;
  trustScoreChanges: { influencer: number; brand: number };
  explanation: string;
  findings: Finding[];
  suggestedAction: string;
  autoResolvable: boolean;
}

interface DisputeDetail {
  id: string;
  status: string;
  tier: number;
  type: string;
  reason: string;
  description: string;
  createdAt: string;
  resolvedAt?: string | null;
  resolution?: string | null;
  deal: {
    id: string;
    amount: number;
    campaign: {
      title: string;
    };
  };
  evidence: Array<{
    id: string;
    type: string;
    url?: string;
    description?: string;
    submittedAt?: string;
    submittedByUserId?: string;
  }>;
  influencerOutcome?: string | null;
  brandOutcome?: string | null;
}

interface DisputeDetailPageProps {
  readonly params: Promise<{ readonly id: string }>;
}



function getStatusColor(status: string) {
  switch (status) {
    case "OPEN":
      return "var(--color-primary)";
    case "TIER1_AUTO":
      return "var(--color-accent-cyan)";
    case "TIER2_MEDIATION":
      return "var(--color-warning)";
    case "TIER3_ARBITRATION":
      return "#ef4444";
    case "RESOLVED":
      return "var(--color-success)";
    case "CLOSED":
      return "var(--color-text-muted)";
    default:
      return "var(--color-text-secondary)";
  }
}

function getVerdictColor(verdict: string) {
  switch (verdict) {
    case "INFLUENCER_FAVORED":
      return "#22c55e";
    case "BRAND_FAVORED":
      return "#3b82f6";
    case "SPLIT":
      return "#f59e0b";
    case "DISMISSED":
      return "#6b7280";
    case "ESCALATE":
      return "#ef4444";
    default:
      return "var(--color-text-secondary)";
  }
}

function getFindingColor(result: string) {
  switch (result) {
    case "PASS":
      return "#22c55e";
    case "FAIL":
      return "#ef4444";
    case "WARNING":
      return "#f59e0b";
    default:
      return "#6b7280";
  }
}

function getFindingIcon(result: string) {
  switch (result) {
    case "PASS":
      return "✅";
    case "FAIL":
      return "❌";
    case "WARNING":
      return "⚠️";
    default:
      return "➖";
  }
}

interface DisputeTimelineProps {
  readonly dispute: DisputeDetail;
}

function DisputeTimeline({ dispute }: Readonly<DisputeTimelineProps>) {
  return (
    <Card className="mb-6">
      <h2 className="section-title text-lg font-bold mb-4">
        📋 Dispute Timeline
      </h2>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 py-2 border-bottom">
          <div
            className="flex-shrink-0 rounded-full" style={{ width: "8px", height: "8px", background: "var(--color-primary)" }}
          />
          <div className="flex-1">
            <div className="text-sm font-semibold">
              Dispute Filed
            </div>
            <div className="text-xs text-secondary">
              {new Date(dispute.createdAt).toLocaleString()}
            </div>
          </div>
        </div>
        {dispute.tier >= 1 && (
          <div className="flex items-center gap-3 py-2 border-bottom">
            <div
              className="flex-shrink-0 rounded-full" style={{ width: "8px", height: "8px", background: "var(--color-accent-cyan)" }}
            />
            <div className="flex-1">
              <div className="text-sm font-semibold">
                AI Mediator Analyzed
              </div>
              <div className="text-xs text-secondary">
                Auto-resolution engine processed
              </div>
            </div>
          </div>
        )}
        {dispute.tier >= 2 && (
          <div className="flex items-center gap-3 py-2 border-bottom">
            <div
              className="flex-shrink-0 rounded-full" style={{ width: "8px", height: "8px", background: "var(--color-warning)" }}
            />
            <div className="flex-1">
              <div className="text-sm font-semibold">
                Escalated to Human Mediation
              </div>
              <div className="text-xs text-secondary">
                Tier 2 review in progress
              </div>
            </div>
          </div>
        )}
        {dispute.tier >= 3 && (
          <div
            className="flex items-center gap-3 border-b-card" style={{ padding: "8px 0" }}
          >
            <div
              className="flex-shrink-0 rounded-full" style={{ width: "8px", height: "8px", background: "#ef4444" }}
            />
            <div className="flex-1">
              <div className="text-sm font-semibold">
                Arbitration
              </div>
              <div className="text-xs text-secondary">
                Final review by admin
              </div>
            </div>
          </div>
        )}
        {dispute.status === "RESOLVED" && (
          <div className="flex items-center gap-3 py-2">
            <div
              className="flex-shrink-0 rounded-full" style={{ width: "8px", height: "8px", background: "var(--color-success)" }}
            />
            <div className="flex-1">
              <div className="text-sm font-semibold">
                Resolved
              </div>
              <div className="text-xs text-secondary">
                {dispute.resolvedAt
                  ? new Date(dispute.resolvedAt).toLocaleString()
                  : "Recently"}
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

interface DisputeEvidenceProps {
  readonly dispute: DisputeDetail;
  readonly showEvidenceForm: boolean;
  readonly setShowEvidenceForm: (show: boolean) => void;
  readonly evidenceType: string;
  readonly setEvidenceType: (type: string) => void;
  readonly evidenceUrl: string;
  readonly setEvidenceUrl: (url: string) => void;
  readonly evidenceDesc: string;
  readonly setEvidenceDesc: (desc: string) => void;
  readonly onSubmit: (e: React.FormEvent) => void;
  readonly isSubmitting: boolean;
}

function DisputeEvidence({
  dispute,
  showEvidenceForm,
  setShowEvidenceForm,
  evidenceType,
  setEvidenceType,
  evidenceUrl,
  setEvidenceUrl,
  evidenceDesc,
  setEvidenceDesc,
  onSubmit,
  isSubmitting,
}: Readonly<DisputeEvidenceProps>) {
  return (
    <Card>
      <div className="section-header-row">
        <h2 className="section-title text-lg font-bold mb-0">
          📎 Evidence
        </h2>
        {["OPEN", "TIER1_AUTO", "TIER2_MEDIATION"].includes(
          dispute.status,
        ) && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowEvidenceForm(!showEvidenceForm)}
          >
            {showEvidenceForm ? "Cancel" : "+ Add Evidence"}
          </Button>
        )}
      </div>

      {showEvidenceForm && (
        <form
          onSubmit={onSubmit}
          className="card mb-6 p-4 bg-tertiary"
        >
          <Select
            label="Type"
            id="evidence-type-select"
            value={evidenceType}
            onChange={(e) => setEvidenceType(e.target.value)}
            className="mb-3"
            fullWidth
          >
            <option value="SCREENSHOT">Screenshot</option>
            <option value="DOCUMENT">Document</option>
            <option value="MESSAGE_LOG">Message Log</option>
            <option value="SCREEN_RECORDING">Screen Recording</option>
            <option value="CONTRACT">Contract</option>
            <option value="OTHER">Other</option>
          </Select>
          
          <Input
            label="URL"
            id="evidence-url-input"
            type="url"
            placeholder="https://drive.google.com/..."
            value={evidenceUrl}
            onChange={(e) => setEvidenceUrl(e.target.value)}
            className="mb-3"
            fullWidth
            required
          />

          <Textarea
            label="Description"
            id="evidence-desc-textarea"
            rows={2}
            placeholder="What does this evidence show?"
            value={evidenceDesc}
            onChange={(e) => setEvidenceDesc(e.target.value)}
            className="mb-4"
            fullWidth
            required
          />
          
          <Button
            variant="primary"
            type="submit"
            disabled={isSubmitting}
            fullWidth
          >
            {isSubmitting ? "Submitting..." : "Submit Evidence"}
          </Button>
        </form>
      )}

      {dispute.evidence.length === 0 ? (
        <p
          className="text-secondary text-sm"
        >
          No evidence submitted yet.
        </p>
      ) : (
        <div
          className="flex flex-col gap-3"
        >
          {dispute.evidence.map((ev) => (
            <div
              key={ev.id}
              className="p-3 border-card rounded-sm"
            >
              <div
                className="flex justify-between mb-1"
              >
                <span className="badge">{ev.type}</span>
                <span
                  className="text-secondary text-xs"
                >
                  {ev.submittedAt ? new Date(ev.submittedAt).toLocaleDateString() : ""}
                </span>
              </div>
              <p className="text-sm mb-2">
                {ev.description}
              </p>
              <a
                href={ev.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary"
              >
                🔗 View File
              </a>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function DisputeDetailPage({
  params,
}: Readonly<DisputeDetailPageProps>) {
  const { id } = use(params);
  const { data: disputeData, isLoading, mutate: fetchDispute } = useSWR<{ dispute?: DisputeDetail; analysis?: MediatorAnalysis }>(
    id ? `/api/disputes/${id}` : null,
    fetcher
  );

  const dispute: DisputeDetail | null = disputeData?.dispute || null;

  const analysis: MediatorAnalysis | null = useMemo(() => {
    if (!disputeData) return null;
    if (disputeData.analysis) return disputeData.analysis;
    if (disputeData.dispute?.influencerOutcome || disputeData.dispute?.brandOutcome) {
      try {
        const iOutcome = JSON.parse(disputeData.dispute.influencerOutcome || "{}");
        const bOutcome = JSON.parse(disputeData.dispute.brandOutcome || "{}");
        return {
          disputeId: disputeData.dispute.id,
          tier: disputeData.dispute.tier,
          verdict: disputeData.dispute.status === "RESOLVED" ? "RESOLVED" : "PENDING",
          confidence: iOutcome.confidence || bOutcome.confidence || "HIGH",
          refundPercentage: bOutcome.refund_percentage || 0,
          influencerPayoutPercentage: iOutcome.payment_percentage || 0,
          trustScoreChanges: {
            influencer: iOutcome.trust_score_change || 0,
            brand: bOutcome.trust_score_change || 0,
          },
          explanation: disputeData.dispute.resolution || "Analysis pending",
          findings: [],
          suggestedAction: "",
          autoResolvable: false,
        };
      } catch {
        return null;
      }
    }
    return null;
  }, [disputeData]);

  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceDesc, setEvidenceDesc] = useState("");
  const [evidenceType, setEvidenceType] = useState("SCREENSHOT");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [escalateReason, setEscalateReason] = useState("");
  const [showEscalateForm, setShowEscalateForm] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const removeToast = (toastId: string) => {
    setToasts(prev => prev.filter(t => t.id !== toastId));
  };
  const showToast = useCallback((type: ToastType, message: string) => {
    const toastId = String(Date.now());
    setToasts(prev => [...prev, { id: toastId, type, message }]);
    setTimeout(() => removeToast(toastId), 5000);
  }, []);

  const handleAddEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispute) return;

    const validation = disputeEvidenceSchema.safeParse({
      type: evidenceType,
      url: evidenceUrl,
      description: evidenceDesc,
    });

    if (!validation.success) {
      showToast("error", validation.error.issues[0]?.message || "Invalid evidence details");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/disputes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_evidence",
          disputeId: dispute.id,
          type: evidenceType,
          url: evidenceUrl,
          description: evidenceDesc,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showToast("success", "Evidence added successfully");
        setShowEvidenceForm(false);
        setEvidenceUrl("");
        setEvidenceDesc("");
        fetchDispute();
      } else {
        showToast("error", data.error || "Failed to add evidence");
      }
    } catch (error) {
      logger.error("[dispute-detail] Failed to add evidence:", error);
      showToast("error", "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisputeAction = async (
    action: "accept_resolution" | "reject_resolution" | "escalate",
  ) => {
    if (!dispute) return;
    if (action === "escalate") {
      const validation = disputeEscalationSchema.safeParse({ reason: escalateReason });
      if (!validation.success) {
        showToast("error", validation.error.issues[0]?.message || "Invalid escalation reason");
        return;
      }
    }
    setActionLoading(action);
    try {
      const res = await fetch("/api/disputes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          disputeId: dispute.id,
          action,
          reason: action === "escalate" ? escalateReason : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", data.message);
        setShowEscalateForm(false);
        fetchDispute();
      } else {
        showToast("error", data.error || "Action failed");
      }
    } catch (error) {
      logger.error("[dispute-detail] Failed to perform dispute action:", error);
      showToast("error", "Something went wrong");
    } finally {
      setActionLoading(null);
    }
  };

  if (isLoading)
    return (
      <div className="loading text-center p-10">
        Loading dispute details...
      </div>
    );
  if (!dispute)
    return (
      <div className="text-center p-10">
        Dispute not found
      </div>
    );

  const canTakeAction = ["TIER1_AUTO", "OPEN"].includes(dispute.status);
  const canEscalate = ["TIER1_AUTO", "TIER2_MEDIATION"].includes(
    dispute.status,
  );

  return (
    <div
      className="flex flex-col" style={{ minHeight: "100vh" }}
    >
      <ToastContainer toasts={toasts} onClose={removeToast} />
      {/* Header */}
      <header
        className="glass border-b-card flex items-center gap-4 flex-wrap" style={{ padding: "16px 24px" }}
      >
        <Link
          href="/dashboard/disputes"
          className="text-sm text-secondary"
        >
          ← Back to Disputes
        </Link>
        <h1 className="text-xl font-extrabold">
          Dispute #{dispute.id.slice(-6)}
        </h1>
        <span
          className="badge text-xs font-semibold rounded-lg" style={{ background: getStatusColor(dispute.status), color: "white", padding: "4px 12px" }}
        >
          {dispute.status.replaceAll("_", " ")}
        </span>
        {dispute.tier > 1 && (
          <span
            className="badge badge-warning text-xs rounded-lg" style={{ padding: "4px 12px" }}
          >
            Tier {dispute.tier}
          </span>
        )}
      </header>

      <main
        className="p-6 w-full" style={{ maxWidth: "1200px", margin: "0 auto" }}
      >
        {/* AI Mediator Analysis Card */}
        {analysis && (
          <div
            className="card mb-6" style={{ border: "1px solid var(--color-primary)", background:
                "linear-gradient(135deg, rgba(139, 92, 246, 0.05), rgba(14, 165, 233, 0.05))" }}
          >
            <div
              className="flex justify-between items-center mb-4"
            >
              <div
                className="flex items-center gap-3"
              >
                <span className="text-2xl">🤖</span>
                <div>
                  <h2 className="text-lg font-bold">
                    AI Mediator Analysis
                  </h2>
                  <span
                    className="text-xs text-secondary"
                  >
                    Tier {analysis.tier} • Auto-Resolution Engine
                  </span>
                </div>
              </div>
              {(() => {
                let confBg = "rgba(239, 68, 68, 0.15)";
                let confColor = "#ef4444";
                if (analysis.confidence === "HIGH") {
                  confBg = "rgba(34, 197, 94, 0.15)";
                  confColor = "#22c55e";
                } else if (analysis.confidence === "MEDIUM") {
                  confBg = "rgba(245, 158, 11, 0.15)";
                  confColor = "#f59e0b";
                }
                return (
                  <span
                    className="font-bold rounded-lg text-xs" style={{ padding: "4px 12px", background: confBg, color: confColor }}
                  >
                    {analysis.confidence} CONFIDENCE
                  </span>
                );
              })()}
            </div>

            {/* Verdict */}
            {analysis.verdict && analysis.verdict !== "PENDING" && (
              <div
                className="p-4 mb-4 bg-tertiary rounded-md"
              >
                <div
                  className="text-xs text-secondary mb-1"
                >
                  VERDICT
                </div>
                <div
                  className="text-base font-bold" style={{ color: getVerdictColor(analysis.verdict) }}
                >
                  {analysis.verdict.replaceAll("_", " ")}
                </div>
              </div>
            )}

            {/* Explanation */}
            <div className="mb-4">
              <div
                className="text-xs text-secondary mb-1"
              >
                EXPLANATION
              </div>
              <p className="text-sm" style={{ lineHeight: "1.6" }}>
                {analysis.explanation}
              </p>
            </div>

            {/* Financial Outcome */}
            {(analysis.refundPercentage > 0 ||
              analysis.influencerPayoutPercentage > 0) && (
              <div
                className="grid gap-3 mb-4" style={{ gridTemplateColumns: "1fr 1fr" }}
              >
                <div
                  className="p-3 bg-tertiary rounded-md"
                >
                  <div
                    className="text-secondary text-xs"
                  >
                    Brand Refund
                  </div>
                  <div className="text-xl font-bold">
                    {analysis.refundPercentage}%
                  </div>
                </div>
                <div
                  className="p-3 bg-tertiary rounded-md"
                >
                  <div
                    className="text-secondary text-xs"
                  >
                    Influencer Payout
                  </div>
                  <div className="text-xl font-bold">
                    {analysis.influencerPayoutPercentage}%
                  </div>
                </div>
              </div>
            )}

            {/* Trust Score Changes */}
            {(analysis.trustScoreChanges.influencer !== 0 ||
              analysis.trustScoreChanges.brand !== 0) && (
              <div
                className="grid gap-3 mb-4" style={{ gridTemplateColumns: "1fr 1fr" }}
              >
                <div
                  className="p-3 bg-tertiary rounded-md"
                >
                  <div
                    className="text-secondary text-xs"
                  >
                    Influencer Trust Δ
                  </div>
                  <div
                    className="text-base font-bold" style={{ color:
                        analysis.trustScoreChanges.influencer >= 0
                          ? "#22c55e"
                          : "#ef4444" }}
                  >
                    {analysis.trustScoreChanges.influencer >= 0 ? "+" : ""}
                    {analysis.trustScoreChanges.influencer}
                  </div>
                </div>
                <div
                  className="p-3 bg-tertiary rounded-md"
                >
                  <div
                    className="text-secondary text-xs"
                  >
                    Brand Trust Δ
                  </div>
                  <div
                    className="text-base font-bold" style={{ color:
                        analysis.trustScoreChanges.brand >= 0
                          ? "#22c55e"
                          : "#ef4444" }}
                  >
                    {analysis.trustScoreChanges.brand >= 0 ? "+" : ""}
                    {analysis.trustScoreChanges.brand}
                  </div>
                </div>
              </div>
            )}

            {/* Findings */}
            {analysis.findings?.length > 0 && (
              <div className="mb-4">
                <div
                  className="text-xs text-secondary mb-2"
                >
                  FINDINGS
                </div>
                <div
                  className="flex flex-col" style={{ gap: "6px" }}
                >
                  {analysis.findings.map((f, idx) => (
                    <div
                      key={f.check + "_" + idx}
                      className="flex items-center gap-2 bg-tertiary" style={{ padding: "8px 12px", borderRadius: "6px", borderLeft: `3px solid ${getFindingColor(f.result)}` }}
                    >
                      <span>{getFindingIcon(f.result)}</span>
                      <div className="flex-1">
                        <div className="text-sm font-semibold">
                          {f.check}
                        </div>
                        <div
                          className="text-xs text-secondary"
                        >
                          {f.detail}
                        </div>
                      </div>
                      <span
                        className="font-bold text-xs" style={{ color: getFindingColor(f.result) }}
                      >
                        {f.result}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {canTakeAction && dispute.status !== "RESOLVED" && (
              <div
                className="flex gap-3 flex-wrap border-top" style={{ paddingTop: "16px" }}
              >
                <Button
                  variant="primary"
                  onClick={() => handleDisputeAction("accept_resolution")}
                  disabled={!!actionLoading}
                  className="flex-1"
                >
                  {actionLoading === "accept_resolution"
                    ? "Processing..."
                    : "✅ Accept Resolution"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleDisputeAction("reject_resolution")}
                  disabled={!!actionLoading}
                  className="flex-1"
                >
                  {actionLoading === "reject_resolution"
                    ? "Processing..."
                    : "❌ Reject & Escalate"}
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="grid-2" style={{ alignItems: "start" }}>
          {/* Left Column: Details */}
          <div>
            <div className="card mb-6">
              <h2
                className="text-lg font-bold mb-4"
              >
                Issue Details
              </h2>
              <div className="mb-4">
                <div
                  className="text-xs text-secondary"
                >
                  Type
                </div>
                <div className="font-semibold">{dispute.type}</div>
              </div>
              <div className="mb-4">
                <div
                  className="text-xs text-secondary"
                >
                  Description
                </div>
                <p className="text-sm" style={{ lineHeight: "1.5" }}>
                  {dispute.description}
                </p>
              </div>
              <div className="mb-4">
                <div
                  className="text-xs text-secondary"
                >
                  Deal
                </div>
                <Link
                  href={`/dashboard/deals/${dispute.deal.id}`}
                  className="text-primary font-semibold"
                >
                  {dispute.deal.campaign.title} ({dispute.deal.amount / 100}{" "}
                  INR)
                </Link>
              </div>
              <div className="mb-4">
                <div
                  className="text-xs text-secondary"
                >
                  Filed on
                </div>
                <div className="text-sm">
                  {new Date(dispute.createdAt).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Resolution */}
            {dispute.resolution && (
              <div
                className="card mb-6" style={{ border: "1px solid var(--color-success)" }}
              >
                <h2
                  className="text-lg font-bold mb-4" style={{ color: "var(--color-success)" }}
                >
                  ✅ Resolution
                </h2>
                <p>{dispute.resolution}</p>
                {dispute.resolvedAt && (
                  <div
                    className="mt-4 text-xs text-secondary"
                  >
                    Resolved on{" "}
                    {dispute.resolvedAt ? new Date(dispute.resolvedAt).toLocaleDateString() : ""}
                  </div>
                )}
              </div>
            )}

            {/* Escalate Button */}
            {canEscalate && dispute.status !== "RESOLVED" && (
              <div className="card mb-6">
                <h2
                  className="text-base font-bold mb-3"
                >
                  ⚖️ Escalate Dispute
                </h2>
                <p
                  className="text-sm text-secondary mb-3"
                >
                  Not satisfied with the AI resolution? Escalate to{" "}
                  {dispute.tier === 1
                    ? "human mediation (Tier 2)"
                    : "arbitration (Tier 3)"}
                  .
                </p>
                {showEscalateForm ? (
                  <div>
                    <Textarea
                      rows={3}
                      placeholder="Why do you want to escalate? Provide your reasoning..."
                      value={escalateReason}
                      onChange={(e) => setEscalateReason(e.target.value)}
                      className="mb-3"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="warning"
                        onClick={() => handleDisputeAction("escalate")}
                        disabled={!escalateReason || !!actionLoading}
                        className="flex-1"
                      >
                        {actionLoading === "escalate"
                          ? "Escalating..."
                          : `Escalate to Tier ${dispute.tier + 1}`}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setShowEscalateForm(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="warning"
                    onClick={() => setShowEscalateForm(true)}
                    className="w-full"
                  >
                    Request Escalation
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Evidence */}
          <div>
            <DisputeTimeline dispute={dispute} />
            <DisputeEvidence
              dispute={dispute}
              showEvidenceForm={showEvidenceForm}
              setShowEvidenceForm={setShowEvidenceForm}
              evidenceType={evidenceType}
              setEvidenceType={setEvidenceType}
              evidenceUrl={evidenceUrl}
              setEvidenceUrl={setEvidenceUrl}
              evidenceDesc={evidenceDesc}
              setEvidenceDesc={setEvidenceDesc}
              onSubmit={handleAddEvidence}
              isSubmitting={isSubmitting}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
