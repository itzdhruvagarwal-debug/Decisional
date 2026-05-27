"use client";

import { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";

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

export default function DisputeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [dispute, setDispute] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceDesc, setEvidenceDesc] = useState("");
  const [evidenceType, setEvidenceType] = useState("SCREENSHOT");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  const [analysis, setAnalysis] = useState<MediatorAnalysis | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [escalateReason, setEscalateReason] = useState("");
  const [showEscalateForm, setShowEscalateForm] = useState(false);

  const fetchDispute = useCallback(() => {
    fetch(`/api/disputes/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.dispute) {
          setDispute(data.dispute);
          // If the dispute has mediator analysis stored, parse and show it
          if (data.dispute.influencerOutcome || data.dispute.brandOutcome) {
            try {
              const iOutcome = JSON.parse(
                data.dispute.influencerOutcome || "{}",
              );
              const bOutcome = JSON.parse(data.dispute.brandOutcome || "{}");
              // Reconstruct partial analysis for display
              setAnalysis({
                disputeId: data.dispute.id,
                tier: data.dispute.tier,
                verdict:
                  data.dispute.status === "RESOLVED" ? "RESOLVED" : "PENDING",
                confidence: "HIGH",
                refundPercentage: bOutcome.refund_percentage || 0,
                influencerPayoutPercentage: iOutcome.payment_percentage || 0,
                trustScoreChanges: {
                  influencer: iOutcome.trust_score_change || 0,
                  brand: bOutcome.trust_score_change || 0,
                },
                explanation: data.dispute.resolution || "Analysis pending",
                findings: [],
                suggestedAction: "",
                autoResolvable: false,
              });
            } catch {
              /* ignore parse errors */
            }
          }
        } else if (data.error) {
          alert(data.error);
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setIsLoading(false));
  }, [id]);

  useEffect(() => {
    fetchDispute();
  }, [fetchDispute]);

  const handleAddEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evidenceUrl || !evidenceDesc) return;

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
        alert("Evidence added successfully");
        setShowEvidenceForm(false);
        setEvidenceUrl("");
        setEvidenceDesc("");
        fetchDispute();
      } else {
        alert(data.error || "Failed to add evidence");
      }
    } catch (error) {
      console.error(error);
      alert("Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisputeAction = async (
    action: "accept_resolution" | "reject_resolution" | "escalate",
  ) => {
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
        alert(data.message);
        setShowEscalateForm(false);
        fetchDispute();
      } else {
        alert(data.error || "Action failed");
      }
    } catch (error) {
      console.error(error);
      alert("Something went wrong");
    } finally {
      setActionLoading(null);
    }
  };

  if (isLoading)
    return (
      <div className="loading" style={{ padding: "40px", textAlign: "center" }}>
        Loading dispute details...
      </div>
    );
  if (!dispute)
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        Dispute not found
      </div>
    );

  const getStatusColor = (status: string) => {
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
  };

  const getVerdictColor = (verdict: string) => {
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
  };

  const getFindingColor = (result: string) => {
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
  };

  const getFindingIcon = (result: string) => {
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
  };

  const canTakeAction = ["TIER1_AUTO", "OPEN"].includes(dispute.status);
  const canEscalate = ["TIER1_AUTO", "TIER2_MEDIATION"].includes(
    dispute.status,
  );

  return (
    <div
      style={{ display: "flex", minHeight: "100vh", flexDirection: "column" }}
    >
      {/* Header */}
      <header
        className="glass"
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <Link
          href="/dashboard/disputes"
          style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}
        >
          ← Back to Disputes
        </Link>
        <h1 style={{ fontSize: "20px", fontWeight: 800 }}>
          Dispute #{dispute.id.slice(-6)}
        </h1>
        <span
          className="badge"
          style={{
            background: getStatusColor(dispute.status),
            color: "white",
            padding: "4px 12px",
            borderRadius: "12px",
            fontSize: "12px",
            fontWeight: 600,
          }}
        >
          {dispute.status.replace(/_/g, " ")}
        </span>
        {dispute.tier > 1 && (
          <span
            className="badge badge-warning"
            style={{
              padding: "4px 12px",
              borderRadius: "12px",
              fontSize: "12px",
            }}
          >
            Tier {dispute.tier}
          </span>
        )}
      </header>

      <main
        style={{
          padding: "24px",
          maxWidth: "1200px",
          margin: "0 auto",
          width: "100%",
        }}
      >
        {/* AI Mediator Analysis Card */}
        {analysis && (
          <div
            className="card"
            style={{
              marginBottom: "24px",
              border: "1px solid var(--color-primary)",
              background:
                "linear-gradient(135deg, rgba(139, 92, 246, 0.05), rgba(14, 165, 233, 0.05))",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "12px" }}
              >
                <span style={{ fontSize: "24px" }}>🤖</span>
                <div>
                  <h2 style={{ fontSize: "18px", fontWeight: 700 }}>
                    AI Mediator Analysis
                  </h2>
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    Tier {analysis.tier} • Auto-Resolution Engine
                  </span>
                </div>
              </div>
              {analysis.confidence && (
                <span
                  style={{
                    padding: "4px 12px",
                    borderRadius: "12px",
                    fontSize: "11px",
                    fontWeight: 700,
                    background:
                      analysis.confidence === "HIGH"
                        ? "rgba(34, 197, 94, 0.15)"
                        : analysis.confidence === "MEDIUM"
                          ? "rgba(245, 158, 11, 0.15)"
                          : "rgba(239, 68, 68, 0.15)",
                    color:
                      analysis.confidence === "HIGH"
                        ? "#22c55e"
                        : analysis.confidence === "MEDIUM"
                          ? "#f59e0b"
                          : "#ef4444",
                  }}
                >
                  {analysis.confidence} CONFIDENCE
                </span>
              )}
            </div>

            {/* Verdict */}
            {analysis.verdict && analysis.verdict !== "PENDING" && (
              <div
                style={{
                  padding: "16px",
                  background: "var(--color-bg-tertiary)",
                  borderRadius: "8px",
                  marginBottom: "16px",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--color-text-secondary)",
                    marginBottom: "4px",
                  }}
                >
                  VERDICT
                </div>
                <div
                  style={{
                    fontSize: "16px",
                    fontWeight: 700,
                    color: getVerdictColor(analysis.verdict),
                  }}
                >
                  {analysis.verdict.replace(/_/g, " ")}
                </div>
              </div>
            )}

            {/* Explanation */}
            <div style={{ marginBottom: "16px" }}>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--color-text-secondary)",
                  marginBottom: "4px",
                }}
              >
                EXPLANATION
              </div>
              <p style={{ fontSize: "14px", lineHeight: "1.6" }}>
                {analysis.explanation}
              </p>
            </div>

            {/* Financial Outcome */}
            {(analysis.refundPercentage > 0 ||
              analysis.influencerPayoutPercentage > 0) && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                  marginBottom: "16px",
                }}
              >
                <div
                  style={{
                    padding: "12px",
                    background: "var(--color-bg-tertiary)",
                    borderRadius: "8px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    Brand Refund
                  </div>
                  <div style={{ fontSize: "20px", fontWeight: 700 }}>
                    {analysis.refundPercentage}%
                  </div>
                </div>
                <div
                  style={{
                    padding: "12px",
                    background: "var(--color-bg-tertiary)",
                    borderRadius: "8px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    Influencer Payout
                  </div>
                  <div style={{ fontSize: "20px", fontWeight: 700 }}>
                    {analysis.influencerPayoutPercentage}%
                  </div>
                </div>
              </div>
            )}

            {/* Trust Score Changes */}
            {(analysis.trustScoreChanges.influencer !== 0 ||
              analysis.trustScoreChanges.brand !== 0) && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                  marginBottom: "16px",
                }}
              >
                <div
                  style={{
                    padding: "12px",
                    background: "var(--color-bg-tertiary)",
                    borderRadius: "8px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    Influencer Trust Δ
                  </div>
                  <div
                    style={{
                      fontSize: "16px",
                      fontWeight: 700,
                      color:
                        analysis.trustScoreChanges.influencer >= 0
                          ? "#22c55e"
                          : "#ef4444",
                    }}
                  >
                    {analysis.trustScoreChanges.influencer >= 0 ? "+" : ""}
                    {analysis.trustScoreChanges.influencer}
                  </div>
                </div>
                <div
                  style={{
                    padding: "12px",
                    background: "var(--color-bg-tertiary)",
                    borderRadius: "8px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "11px",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    Brand Trust Δ
                  </div>
                  <div
                    style={{
                      fontSize: "16px",
                      fontWeight: 700,
                      color:
                        analysis.trustScoreChanges.brand >= 0
                          ? "#22c55e"
                          : "#ef4444",
                    }}
                  >
                    {analysis.trustScoreChanges.brand >= 0 ? "+" : ""}
                    {analysis.trustScoreChanges.brand}
                  </div>
                </div>
              </div>
            )}

            {/* Findings */}
            {analysis.findings?.length > 0 && (
              <div style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--color-text-secondary)",
                    marginBottom: "8px",
                  }}
                >
                  FINDINGS
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  {analysis.findings.map((f, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "8px 12px",
                        background: "var(--color-bg-tertiary)",
                        borderRadius: "6px",
                        borderLeft: `3px solid ${getFindingColor(f.result)}`,
                      }}
                    >
                      <span>{getFindingIcon(f.result)}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "13px", fontWeight: 600 }}>
                          {f.check}
                        </div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          {f.detail}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: getFindingColor(f.result),
                        }}
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
                style={{
                  display: "flex",
                  gap: "12px",
                  flexWrap: "wrap",
                  borderTop: "1px solid var(--color-border)",
                  paddingTop: "16px",
                }}
              >
                <button
                  className="btn btn-primary"
                  onClick={() => handleDisputeAction("accept_resolution")}
                  disabled={!!actionLoading}
                  style={{ flex: 1 }}
                >
                  {actionLoading === "accept_resolution"
                    ? "Processing..."
                    : "✅ Accept Resolution"}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleDisputeAction("reject_resolution")}
                  disabled={!!actionLoading}
                  style={{ flex: 1 }}
                >
                  {actionLoading === "reject_resolution"
                    ? "Processing..."
                    : "❌ Reject & Escalate"}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="grid-2" style={{ alignItems: "start" }}>
          {/* Left Column: Details */}
          <div>
            <div className="card" style={{ marginBottom: "24px" }}>
              <h2
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  marginBottom: "16px",
                }}
              >
                Issue Details
              </h2>
              <div style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Type
                </div>
                <div style={{ fontWeight: 600 }}>{dispute.type}</div>
              </div>
              <div style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Description
                </div>
                <p style={{ fontSize: "14px", lineHeight: "1.5" }}>
                  {dispute.description}
                </p>
              </div>
              <div style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Deal
                </div>
                <Link
                  href={`/dashboard/deals/${dispute.deal.id}`}
                  style={{ color: "var(--color-primary)", fontWeight: 600 }}
                >
                  {dispute.deal.campaign.title} ({dispute.deal.amount / 100}{" "}
                  INR)
                </Link>
              </div>
              <div style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Filed on
                </div>
                <div style={{ fontSize: "14px" }}>
                  {new Date(dispute.createdAt).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Resolution */}
            {dispute.resolution && (
              <div
                className="card"
                style={{
                  marginBottom: "24px",
                  border: "1px solid var(--color-success)",
                }}
              >
                <h2
                  style={{
                    fontSize: "18px",
                    fontWeight: 700,
                    marginBottom: "16px",
                    color: "var(--color-success)",
                  }}
                >
                  ✅ Resolution
                </h2>
                <p>{dispute.resolution}</p>
                {dispute.resolvedAt && (
                  <div
                    style={{
                      marginTop: "16px",
                      fontSize: "12px",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    Resolved on{" "}
                    {new Date(dispute.resolvedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            )}

            {/* Escalate Button */}
            {canEscalate && dispute.status !== "RESOLVED" && (
              <div className="card" style={{ marginBottom: "24px" }}>
                <h2
                  style={{
                    fontSize: "16px",
                    fontWeight: 700,
                    marginBottom: "12px",
                  }}
                >
                  ⚖️ Escalate Dispute
                </h2>
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--color-text-secondary)",
                    marginBottom: "12px",
                  }}
                >
                  Not satisfied with the AI resolution? Escalate to{" "}
                  {dispute.tier === 1
                    ? "human mediation (Tier 2)"
                    : "arbitration (Tier 3)"}
                  .
                </p>
                {showEscalateForm ? (
                  <div>
                    <textarea
                      className="input"
                      rows={3}
                      placeholder="Why do you want to escalate? Provide your reasoning..."
                      value={escalateReason}
                      onChange={(e) => setEscalateReason(e.target.value)}
                      style={{ marginBottom: "12px" }}
                    />
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        className="btn btn-warning"
                        onClick={() => handleDisputeAction("escalate")}
                        disabled={!escalateReason || !!actionLoading}
                        style={{ flex: 1 }}
                      >
                        {actionLoading === "escalate"
                          ? "Escalating..."
                          : `Escalate to Tier ${dispute.tier + 1}`}
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => setShowEscalateForm(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn btn-warning"
                    onClick={() => setShowEscalateForm(true)}
                    style={{ width: "100%" }}
                  >
                    Request Escalation
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Evidence */}
          <div>
            {/* Timeline */}
            <div className="card" style={{ marginBottom: "24px" }}>
              <h2
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  marginBottom: "16px",
                }}
              >
                📋 Dispute Timeline
              </h2>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "8px 0",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "var(--color-primary)",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "13px", fontWeight: 600 }}>
                      Dispute Filed
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      {new Date(dispute.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
                {dispute.tier >= 1 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "8px 0",
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "var(--color-accent-cyan)",
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600 }}>
                        AI Mediator Analyzed
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        Auto-resolution engine processed
                      </div>
                    </div>
                  </div>
                )}
                {dispute.tier >= 2 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "8px 0",
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "var(--color-warning)",
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600 }}>
                        Escalated to Human Mediation
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        Tier 2 review in progress
                      </div>
                    </div>
                  </div>
                )}
                {dispute.tier >= 3 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "8px 0",
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "#ef4444",
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600 }}>
                        Arbitration
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        Final review by admin
                      </div>
                    </div>
                  </div>
                )}
                {dispute.status === "RESOLVED" && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "8px 0",
                    }}
                  >
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "var(--color-success)",
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600 }}>
                        Resolved
                      </div>
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {dispute.resolvedAt
                          ? new Date(dispute.resolvedAt).toLocaleString()
                          : "Recently"}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Evidence */}
            <div className="card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px",
                }}
              >
                <h2 style={{ fontSize: "18px", fontWeight: 700 }}>
                  📎 Evidence
                </h2>
                {["OPEN", "TIER1_AUTO", "TIER2_MEDIATION"].includes(
                  dispute.status,
                ) && (
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => setShowEvidenceForm(!showEvidenceForm)}
                  >
                    {showEvidenceForm ? "Cancel" : "+ Add Evidence"}
                  </button>
                )}
              </div>

              {showEvidenceForm && (
                <form
                  onSubmit={handleAddEvidence}
                  style={{
                    marginBottom: "24px",
                    padding: "16px",
                    background: "var(--color-bg-tertiary)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <div style={{ marginBottom: "12px" }}>
                    <label className="label">Type</label>
                    <select
                      className="input"
                      value={evidenceType}
                      onChange={(e) => setEvidenceType(e.target.value)}
                    >
                      <option value="SCREENSHOT">Screenshot</option>
                      <option value="DOCUMENT">Document</option>
                      <option value="MESSAGE_LOG">Message Log</option>
                      <option value="SCREEN_RECORDING">Screen Recording</option>
                      <option value="CONTRACT">Contract</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  <div style={{ marginBottom: "12px" }}>
                    <label className="label">URL</label>
                    <input
                      type="url"
                      className="input"
                      placeholder="https://drive.google.com/..."
                      value={evidenceUrl}
                      onChange={(e) => setEvidenceUrl(e.target.value)}
                      required
                    />
                  </div>
                  <div style={{ marginBottom: "12px" }}>
                    <label className="label">Description</label>
                    <textarea
                      className="input"
                      rows={2}
                      placeholder="What does this evidence show?"
                      value={evidenceDesc}
                      onChange={(e) => setEvidenceDesc(e.target.value)}
                      required
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ width: "100%" }}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Submitting..." : "Submit Evidence"}
                  </button>
                </form>
              )}

              {dispute.evidence.length === 0 ? (
                <p
                  style={{
                    color: "var(--color-text-secondary)",
                    fontSize: "14px",
                  }}
                >
                  No evidence submitted yet.
                </p>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}
                >
                  {dispute.evidence.map((ev: any) => (
                    <div
                      key={ev.id}
                      style={{
                        padding: "12px",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-sm)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "4px",
                        }}
                      >
                        <span className="badge">{ev.type}</span>
                        <span
                          style={{
                            fontSize: "11px",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          {new Date(ev.submittedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p style={{ fontSize: "13px", marginBottom: "8px" }}>
                        {ev.description}
                      </p>
                      <a
                        href={ev.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: "13px",
                          color: "var(--color-primary)",
                        }}
                      >
                        🔗 View File
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
