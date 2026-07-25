"use client";

import React from "react";
import { Button } from "@/components/ui";
import {
  MediatorAnalysis,
  DisputeDetail,
  getFindingIcon,
} from "./DisputeHelpers";

interface DisputeAnalysisCardProps {
  readonly analysis: MediatorAnalysis | null;
  readonly dispute: DisputeDetail;
  readonly canTakeAction: boolean;
  readonly actionLoading: string | null;
  readonly handleDisputeAction: (action: string) => Promise<void>;
}

export function DisputeAnalysisCard({
  analysis,
  dispute,
  canTakeAction,
  actionLoading,
  handleDisputeAction,
}: Readonly<DisputeAnalysisCardProps>) {
  if (!analysis) return null;

  const confidenceTone = analysis.confidence === "HIGH"
    ? "success"
    : analysis.confidence === "MEDIUM"
      ? "warning"
      : "danger";

  const trustTone = (value: number) => (value >= 0 ? "positive" : "negative");
  const verdictTone = (() => {
    switch (analysis.verdict) {
      case "INFLUENCER_FAVORED":
        return "influencer";
      case "BRAND_FAVORED":
        return "brand";
      case "SPLIT":
        return "warning";
      case "ESCALATE":
        return "danger";
      case "DISMISSED":
        return "muted";
      default:
        return "neutral";
    }
  })();

  return (
    <div className="card mb-6 dispute-analysis-card">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🤖</span>
          <div>
            <h2 className="text-lg font-bold">AI Mediator Analysis</h2>
            <span className="text-xs text-secondary">
              Tier {analysis.tier} • Auto-Resolution Engine
            </span>
          </div>
        </div>
        <span
          className="font-bold rounded-lg text-xs px-2 py-1 dispute-confidence"
          data-tone={confidenceTone}
        >
          {analysis.confidence} CONFIDENCE
        </span>
      </div>

      {/* Verdict */}
      {analysis.verdict && analysis.verdict !== "PENDING" && (
        <div className="p-4 mb-4 bg-tertiary rounded-md">
          <div className="text-xs text-secondary mb-1">VERDICT</div>
          <div className="text-base font-bold dispute-verdict" data-tone={verdictTone}>
            {analysis.verdict.replaceAll("_", " ")}
          </div>
        </div>
      )}

      {/* Explanation */}
      <div className="mb-4">
        <div className="text-xs text-secondary mb-1">EXPLANATION</div>
        <p className="text-sm leading-1-6">{analysis.explanation}</p>
      </div>

      {/* Financial Outcome */}
      {(analysis.refundPercentage > 0 || analysis.influencerPayoutPercentage > 0) && (
        <div className="grid gap-3 mb-4 dispute-two-grid">
          <div className="p-3 bg-tertiary rounded-md">
            <div className="text-secondary text-xs">Brand Refund</div>
            <div className="text-xl font-bold">{analysis.refundPercentage}%</div>
          </div>
          <div className="p-3 bg-tertiary rounded-md">
            <div className="text-secondary text-xs">Influencer Payout</div>
            <div className="text-xl font-bold">{analysis.influencerPayoutPercentage}%</div>
          </div>
        </div>
      )}

      {/* Trust Score Changes */}
      {(analysis.trustScoreChanges.influencer !== 0 || analysis.trustScoreChanges.brand !== 0) && (
        <div className="grid gap-3 mb-4 dispute-two-grid">
          <div className="p-3 bg-tertiary rounded-md">
            <div className="text-secondary text-xs">Influencer Trust Δ</div>
            <div
              className="text-base font-bold dispute-trust-delta"
              data-tone={trustTone(analysis.trustScoreChanges.influencer)}
            >
              {analysis.trustScoreChanges.influencer >= 0 ? "+" : ""}
              {analysis.trustScoreChanges.influencer}
            </div>
          </div>
          <div className="p-3 bg-tertiary rounded-md">
            <div className="text-secondary text-xs">Brand Trust Δ</div>
            <div
              className="text-base font-bold dispute-trust-delta"
              data-tone={trustTone(analysis.trustScoreChanges.brand)}
            >
              {analysis.trustScoreChanges.brand >= 0 ? "+" : ""}
              {analysis.trustScoreChanges.brand}
            </div>
          </div>
        </div>
      )}

      {/* Findings */}
      {analysis.findings && analysis.findings.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-secondary mb-2">FINDINGS</div>
          <div className="flex flex-col gap-1.5">
            {analysis.findings.map((f, idx) => (
              <div
                key={f.check + "_" + idx}
                className="flex items-center gap-2 bg-tertiary px-3 py-2 rounded-md dispute-finding-row"
                data-result={f.result}
              >
                <span>{getFindingIcon(f.result)}</span>
                <div className="flex-1">
                  <div className="text-sm font-semibold">{f.check}</div>
                  <div className="text-xs text-secondary">{f.detail}</div>
                </div>
                <span className="font-bold text-xs dispute-finding-result" data-result={f.result}>
                  {f.result}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {canTakeAction && dispute.status !== "RESOLVED" && (
        <div className="flex gap-3 flex-wrap border-top pt-4">
          <Button
            variant="primary"
            onClick={() => handleDisputeAction("accept_resolution")}
            disabled={!!actionLoading}
            className="flex-1"
          >
            {actionLoading === "accept_resolution" ? "Processing..." : "✅ Accept Resolution"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleDisputeAction("reject_resolution")}
            disabled={!!actionLoading}
            className="flex-1"
          >
            {actionLoading === "reject_resolution" ? "Processing..." : "❌ Reject & Escalate"}
          </Button>
        </div>
      )}
    </div>
  );
}
