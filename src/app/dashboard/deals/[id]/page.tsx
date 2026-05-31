"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/dashboard/DashboardShell";

const formatCurrency = (amount: number) =>
  "INR " + (amount / 100).toLocaleString("en-IN");
const formatPercent = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? `${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`
    : "As shown";
const formatContractDate = (value: unknown) => {
  if (!value || typeof value !== "string") return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};
const normalizeTextArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
const statusConfig: Record<string, { label: string; color: string }> = {
  PENDING_SIGNATURE: {
    label: "Pending Signature",
    color: "var(--color-accent-amber)",
  },
  ACTIVE: {
    label: "Active - Create Content",
    color: "var(--color-accent-blue)",
  },
  PAYMENT_PENDING: {
    label: "Payment Pending",
    color: "var(--color-accent-amber)",
  },
  PAYMENT_HELD: {
    label: "Payment Held - Create Content",
    color: "var(--color-accent-blue)",
  },
  CONTENT_SUBMITTED: {
    label: "Awaiting Brand Review",
    color: "var(--color-accent-purple)",
  },
  REVISION_REQUESTED: {
    label: "Revision Requested",
    color: "var(--color-warning)",
  },
  CONTENT_APPROVED: {
    label: "Approved - Ready to Post",
    color: "var(--color-primary)",
  },
  VERIFIED: { label: "Post Verified", color: "var(--color-success)" },
  COMPLETED: { label: "Completed", color: "var(--color-success)" },
  CANCELLED: { label: "Cancelled", color: "var(--color-error)" },
};

function PaymentRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "16px",
        marginBottom: "8px",
        fontSize: "14px",
      }}
    >
      <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

export default function DealDetailPage() {
  const params = useParams();
  const { data: session } = useSession();
  const id = params?.id as string;

  const [deal, setDeal] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [contentForm, setContentForm] = useState({ contentUrl: "", notes: "" });
  const [postUrl, setPostUrl] = useState("");
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [reviewApproved, setReviewApproved] = useState(true);
  const [shippingAddress, setShippingAddress] = useState({
    fullName: "",
    phone: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    pinCode: "",
    country: "India",
  });
  const [dispatchForm, setDispatchForm] = useState({
    trackingNumber: "",
    carrier: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchDeal = useCallback(async () => {
    try {
      const res = await fetch(`/api/deals/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch deal");
      setDeal(data.deal);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id && session) fetchDeal();
  }, [id, session, fetchDeal]);

  const handleAction = async (action: string, payload: any) => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/deals", {
        // Note: POST to collection for actions
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, dealId: id, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");

      alert(data.message || "Success!");
      setShowSubmitModal(false);
      setShowVerifyModal(false);
      fetchDeal(); // Refresh data
      return true;
    } catch (err: any) {
      alert(err.message);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProductAction = async (payload: any) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/deals/${id}/product`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Product update failed");

      alert("Product status updated.");
      setShowAddressModal(false);
      setShowDispatchModal(false);
      fetchDeal();
      return true;
    } catch (err: any) {
      alert(err.message);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignContract = async () => {
    const terms = deal?.contractTerms as any;
    const payout =
      typeof terms?.influencerPayout === "number"
        ? terms.influencerPayout
        : deal?.amount || 0;
    const fee = typeof terms?.platformFee === "number" ? terms.platformFee : deal?.platformFee || 0;
    const gateway = typeof terms?.gatewayFee === "number" ? terms.gatewayFee : deal?.gatewayFee || 0;
    const payable =
      typeof terms?.totalAmount === "number" && terms.totalAmount > 0
        ? terms.totalAmount
        : (deal?.totalAmount || 0) || (deal?.amount || 0) + fee + gateway;
    const signSummary = [
      "You are signing this Decisional deal contract.",
      `Creator payout: ${formatCurrency(payout)}`,
      `Brand payable: ${formatCurrency(payable)}`,
      `Submission deadline: ${formatContractDate(terms?.submissionDeadline)}`,
      `Posting deadline: ${formatContractDate(terms?.postingDeadline || deal?.postingDeadline)}`,
      "Only sign if deliverables, usage rights, revisions, and payment terms are correct.",
    ].join("\n");
    if (!confirm(signSummary)) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/deals/${id}/sign`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || data?.error || "Failed to sign contract");
      }

      alert(data.message || "Contract signed successfully.");
      fetchDeal();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReviewContent = async () => {
    if (!reviewApproved && reviewFeedback.trim().length < 5) {
      alert("Please add clear feedback for the revision request.");
      return;
    }

    const success = await handleAction("review_content", {
      approved: reviewApproved,
      feedback: reviewApproved ? undefined : reviewFeedback.trim(),
    });
    if (success) {
      setShowReviewModal(false);
      setReviewFeedback("");
      setReviewApproved(true);
    }
  };

  const handleRejectInvite = async () => {
    if (confirm("Are you sure you want to reject this invite? Direct-invite campaign funds will be refunded to the brand.")) {
      setIsSubmitting(true);
      try {
        const res = await fetch(`/api/deals/${id}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: "Influencer rejected the invite before signing.",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || "Failed to reject invite");

        alert("Invite successfully rejected.");
        fetchDeal();
      } catch (err: any) {
        alert(err.message);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  if (isLoading) return <div className="p-8 text-center">Loading deal...</div>;
  if (!session) return <div className="p-8 text-center">Loading session...</div>;
  if (error)
    return <div className="p-8 text-center text-red-500">Error: {error}</div>;
  if (!deal) return <div className="p-8 text-center">Deal not found</div>;

  const status = statusConfig[deal.status] || {
    label: deal.status,
    color: "var(--color-text-secondary)",
  };
  const isClient = session?.user?.userType === "BRAND";
  const isInfluencer = session?.user?.userType === "INFLUENCER";
  const contractTerms = deal.contractTerms as any;
  const mandatoryElements = Array.isArray(contractTerms?.mandatoryElements)
    ? contractTerms.mandatoryElements
    : Array.isArray(contractTerms?.mandatoryTags)
      ? contractTerms.mandatoryTags
      : [];
  const contractDeliverables = Array.isArray(contractTerms?.deliverables)
    ? contractTerms.deliverables
    : [];
  const creatorPayout =
    typeof contractTerms?.influencerPayout === "number"
      ? contractTerms.influencerPayout
      : deal.amount;
  const platformFee =
    typeof contractTerms?.platformFee === "number"
      ? contractTerms.platformFee
      : deal.platformFee || 0;
  const gatewayFee =
    typeof contractTerms?.gatewayFee === "number"
      ? contractTerms.gatewayFee
      : deal.gatewayFee || 0;
  const brandPayable =
    typeof contractTerms?.totalAmount === "number" && contractTerms.totalAmount > 0
      ? contractTerms.totalAmount
      : deal.totalAmount || deal.amount + platformFee + gatewayFee;
  const productValue =
    typeof contractTerms?.productValue === "number"
      ? contractTerms.productValue
      : deal.productValue || 0;
  const productHandlingFee =
    typeof contractTerms?.productHandlingFee === "number"
      ? contractTerms.productHandlingFee
      : deal.productHandlingFee || 0;
  const requiresProduct = Boolean(deal.requiresProduct || contractTerms?.requiresProduct);
  const canSubmitContent =
    !requiresProduct ||
    deal.productFulfillmentStatus === "RECEIVED" ||
    deal.status === "REVISION_REQUESTED";
  const contractSignature = deal.contractSignature as any;
  const brandSigned = Boolean(contractSignature?.brandSignature);
  const influencerSigned = Boolean(contractSignature?.influencerSignature);
  const influencerObligations = normalizeTextArray(
    contractTerms?.influencerObligations,
  );
  const brandObligations = normalizeTextArray(contractTerms?.brandObligations);
  return (
    <DashboardShell user={session.user}>
      <div className="deal-detail-page" style={{ maxWidth: "1280px", margin: "0 auto", display: "grid", gap: "24px" }}>
        <header
          className="glass deal-detail-header"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 40,
            padding: "16px 24px",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <Link
            href="/dashboard/deals"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              color: "var(--color-text-secondary)",
              fontSize: "14px",
              marginBottom: "8px",
            }}
          >
            Back to Deals
          </Link>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <h1 style={{ fontSize: "24px", fontWeight: 800 }}>
                {deal.campaign.title}
              </h1>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginTop: "8px",
                  padding: "6px 12px",
                  background: `${status.color}20`,
                  borderRadius: "var(--radius-full)",
                  width: "fit-content",
                  color: status.color,
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                {status.label}
              </div>
            </div>
            <div className="deal-detail-actions" style={{ display: "flex", gap: "12px" }}>
              {/* Actions based on status */}
              {deal.status === "PENDING_SIGNATURE" && (
                <>
                  <button
                    className="btn btn-primary"
                    onClick={handleSignContract}
                    disabled={isSubmitting}
                  >
                    Sign Contract
                  </button>
                  {isInfluencer && (
                    <button
                      className="btn btn-secondary"
                      onClick={handleRejectInvite}
                      disabled={isSubmitting}
                      style={{ background: "rgba(239, 68, 68, 0.1)", color: "var(--color-error)", border: "1px solid rgba(239, 68, 68, 0.3)" }}
                    >
                      Reject Invite
                    </button>
                  )}
                </>
              )}

              {isInfluencer &&
                ["ACTIVE", "PAYMENT_HELD", "REVISION_REQUESTED"].includes(deal.status) && (
                  <button
                    className="btn btn-primary"
                    onClick={() => setShowSubmitModal(true)}
                    disabled={!canSubmitContent}
                  >
                    Submit Content
                  </button>
                )}

              {isInfluencer && deal.status === "CONTENT_APPROVED" && (
                <button
                  className="btn btn-primary"
                  onClick={() => setShowVerifyModal(true)}
                >
                  Submit Post URL
                </button>
              )}

              {isClient && deal.status === "CONTENT_SUBMITTED" && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setShowReviewModal(true)}
                >
                  Review Content
                </button>
              )}

              <Link
                href={`/dashboard/messages?deal=${deal.id}`}
                className="btn btn-secondary"
              >
                Message
              </Link>
              <Link
                href={`/dashboard/deals/${deal.id}/dispute`}
                className="btn"
                style={{ background: "var(--color-error)", color: "white" }}
              >
                Resolve Issue
              </Link>
            </div>
          </div>
        </header>

        <div className="deal-detail-content" style={{ padding: "24px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
              gap: "24px",
            }}
          >
            <div>
              {/* Progress */}
              <div className="card deal-progress-card" style={{ marginBottom: "24px" }}>
                <h2
                  style={{
                    fontSize: "18px",
                    fontWeight: 700,
                    marginBottom: "20px",
                  }}
                >
                  Deal Progress
                </h2>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "20px",
                  }}
                >
                  {[
                    { s: "PENDING_SIGNATURE", label: "Contract Signing" },
                    { s: "ACTIVE", label: "Content Creation" },
                    { s: "CONTENT_SUBMITTED", label: "Brand Review" },
                    { s: "CONTENT_APPROVED", label: "Approved & Posting" },
                    { s: "VERIFIED", label: "Verified & Payment" },
                    { s: "COMPLETED", label: "Completed" },
                  ].map((step, idx, arr) => {
                    const stepsMap = arr.map((a) => a.s);
                    const currentIndex = stepsMap.indexOf(
                      deal.status === "REVISION_REQUESTED"
                        ? "CONTENT_SUBMITTED"
                        : deal.status,
                    );
                    const isCompleted = currentIndex > idx;
                    const isCurrent = currentIndex === idx;
                    const isCancelled = deal.status === "CANCELLED";

                    return (
                      <div
                        key={step.s}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "16px",
                          opacity: isCancelled ? 0.5 : 1,
                        }}
                      >
                        <div
                          style={{
                            width: "32px",
                            height: "32px",
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: isCompleted
                              ? "var(--color-success)"
                              : isCurrent && !isCancelled
                                ? "var(--color-primary)"
                                : "var(--color-bg-tertiary)",
                            color:
                              isCompleted || isCurrent
                                ? "white"
                                : "var(--color-text-muted)",
                            fontWeight: "bold",
                            fontSize: "14px",
                            boxShadow:
                              isCurrent && !isCancelled
                                ? "0 0 0 4px rgba(99, 102, 241, 0.2)"
                                : "none",
                          }}
                        >
                          {isCompleted ? "Done" : idx + 1}
                        </div>
                        <div>
                          <div
                            style={{
                              fontWeight: isCurrent ? 700 : 500,
                              color:
                                isCurrent || isCompleted
                                  ? "var(--color-text-primary)"
                                  : "var(--color-text-muted)",
                            }}
                          >
                            {step.label}
                          </div>
                          {isCurrent && !isCancelled && (
                            <div
                              style={{
                                fontSize: "12px",
                                color: "var(--color-primary)",
                              }}
                            >
                              In Progress
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {deal.status === "CANCELLED" && (
                    <div
                      style={{
                        padding: "12px",
                        background: "rgba(239, 68, 68, 0.1)",
                        color: "var(--color-error)",
                        borderRadius: "var(--radius-md)",
                        fontWeight: 600,
                        textAlign: "center",
                      }}
                    >
                      Deal Cancelled
                    </div>
                  )}
                </div>
              </div>
              <div className="card" style={{ marginBottom: "24px" }}>
                <h2
                  style={{
                    fontSize: "18px",
                    fontWeight: 700,
                    marginBottom: "20px",
                  }}
                >
                  Content Submissions
                </h2>
                {deal.contentSubmissions?.length === 0 ? (
                  <p className="text-muted">No submissions yet.</p>
                ) : (
                  deal.contentSubmissions?.map((sub: any) => (
                    <div
                      key={sub.id}
                      style={{
                        padding: "16px",
                        background: "var(--color-bg-tertiary)",
                        borderRadius: "var(--radius-md)",
                        marginBottom: "12px",
                        border:
                          sub.status === "APPROVED"
                            ? "1px solid var(--color-success)"
                            : "1px solid transparent",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "8px",
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          Version {sub.version}
                        </span>
                        <span
                          style={{
                            fontSize: "12px",
                            padding: "4px 8px",
                            borderRadius: "var(--radius-sm)",
                            background:
                              sub.status === "APPROVED"
                                ? "var(--color-success)"
                                : sub.status === "REVISION_REQUESTED"
                                  ? "var(--color-warning)"
                                  : "var(--color-accent-blue)",
                            color: "white",
                          }}
                        >
                          {sub.status}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                        }}
                      >
                        <a
                          href={sub.contentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: "13px",
                            color: "var(--color-primary)",
                          }}
                        >
                          View Content
                        </a>
                        {sub.notes && (
                          <div
                            style={{
                              fontSize: "12px",
                              color: "var(--color-text-secondary)",
                            }}
                          >
                            Note: {sub.notes}
                          </div>
                        )}
                      </div>
                      {sub.feedback && (
                        <div
                          style={{
                            marginTop: "8px",
                            padding: "8px",
                            background: "var(--color-bg-secondary)",
                            borderRadius: "var(--radius-sm)",
                            fontSize: "13px",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          Feedback: {sub.feedback}
                        </div>
                      )}
                      <div
                        style={{
                          marginTop: "8px",
                          fontSize: "11px",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        Submitted:{" "}
                        {new Date(sub.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="card">
                <h2
                  style={{
                    fontSize: "18px",
                    fontWeight: 700,
                    marginBottom: "20px",
                  }}
                >
                  Contract Terms
                </h2>
                {contractTerms ? (
                  <>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                        gap: "12px",
                        marginBottom: "18px",
                      }}
                    >
                      {[
                        ["Creator payout", formatCurrency(creatorPayout)],
                        ["Brand payable", formatCurrency(brandPayable)],
                        ["Platform fee", `${formatCurrency(platformFee)} (${formatPercent(contractTerms.platformFeePercent)})`],
                        ["Gateway fee", formatCurrency(gatewayFee)],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          style={{
                            padding: "12px",
                            background: "var(--color-bg-tertiary)",
                            borderRadius: "var(--radius-sm)",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "11px",
                              color: "var(--color-text-muted)",
                              marginBottom: "4px",
                            }}
                          >
                            {label}
                          </div>
                          <div style={{ fontSize: "13px", fontWeight: 700 }}>
                            {value}
                          </div>
                        </div>
                      ))}
                    </div>

                    {contractDeliverables.length > 0 && (
                      <div style={{ marginBottom: "18px" }}>
                        <div
                          style={{
                            fontSize: "13px",
                            color: "var(--color-text-muted)",
                            marginBottom: "8px",
                          }}
                        >
                          Deliverables
                        </div>
                        <div style={{ display: "grid", gap: "8px" }}>
                          {contractDeliverables.map((item: any, index: number) => (
                            <div
                              key={`${item.type}-${index}`}
                              style={{
                                padding: "10px 12px",
                                background: "var(--color-bg-tertiary)",
                                borderRadius: "var(--radius-sm)",
                                fontSize: "13px",
                                lineHeight: 1.5,
                              }}
                            >
                              <strong>
                                {item.count || 1}x {item.type || "Deliverable"}
                              </strong>
                              <span style={{ color: "var(--color-text-secondary)" }}>
                                {" "}
                                on {item.platform || "selected platform"}
                                {item.details ? ` - ${item.details}` : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ marginBottom: "16px" }}>
                      <div
                        style={{
                          fontSize: "13px",
                          color: "var(--color-text-muted)",
                          marginBottom: "8px",
                        }}
                      >
                        Mandatory Elements
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "8px",
                        }}
                      >
                        {mandatoryElements.map(
                          (el: string) => (
                            <span key={el} className="badge badge-primary">
                              {el}
                            </span>
                          ),
                        )}
                        {mandatoryElements.length === 0 && (
                          <span className="text-muted">No mandatory tags set.</span>
                        )}
                      </div>
                    </div>

                    <div style={{ marginBottom: "16px" }}>
                      <div
                        style={{
                          fontSize: "13px",
                          color: "var(--color-text-muted)",
                          marginBottom: "8px",
                        }}
                      >
                        Timeline
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gap: "6px",
                          fontSize: "13px",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        <div>
                          Submit by:{" "}
                          <strong>{formatContractDate(contractTerms.submissionDeadline)}</strong>
                        </div>
                        <div>
                          Post by:{" "}
                          <strong>{formatContractDate(contractTerms.postingDeadline)}</strong>
                        </div>
                        <div>
                          Brand review window:{" "}
                          <strong>{contractTerms.reviewPeriodHours || 48} hours</strong>
                        </div>
                        <div>
                          Included revisions:{" "}
                          <strong>{contractTerms.includedRevisions ?? deal.maxRevisions ?? 2}</strong>
                        </div>
                      </div>
                    </div>

                    {(influencerObligations.length > 0 || brandObligations.length > 0) && (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                          gap: "14px",
                          marginBottom: "16px",
                        }}
                      >
                        {influencerObligations.length > 0 && (
                          <div>
                            <div style={{ fontSize: "13px", color: "var(--color-text-muted)", marginBottom: "8px" }}>
                              Influencer obligations
                            </div>
                            <ul style={{ paddingLeft: "18px", display: "grid", gap: "6px", color: "var(--color-text-secondary)", fontSize: "13px" }}>
                              {influencerObligations.slice(0, 4).map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {brandObligations.length > 0 && (
                          <div>
                            <div style={{ fontSize: "13px", color: "var(--color-text-muted)", marginBottom: "8px" }}>
                              Brand obligations
                            </div>
                            <ul style={{ paddingLeft: "18px", display: "grid", gap: "6px", color: "var(--color-text-secondary)", fontSize: "13px" }}>
                              {brandObligations.slice(0, 4).map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    <div
                      style={{
                        padding: "12px",
                        background: "rgba(99, 102, 241, 0.08)",
                        border: "1px solid rgba(99, 102, 241, 0.18)",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "13px",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      Signatures: Brand {brandSigned ? "signed" : "pending"} /
                      Influencer {influencerSigned ? "signed" : "pending"}
                    </div>
                  </>
                ) : (
                  <p className="text-muted">Terms available after signing.</p>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div>
              <div className="card deal-payment-card" style={{ marginBottom: "24px" }}>
                <h3
                  style={{
                    fontSize: "16px",
                    fontWeight: 700,
                    marginBottom: "16px",
                  }}
                >
                  Payment Details
                </h3>
                {isClient ? (
                  <>
                    <PaymentRow label="Creator payout" value={formatCurrency(creatorPayout)} />
                    {productValue > 0 && (
                      <PaymentRow label="Product value" value={formatCurrency(productValue)} />
                    )}
                    {productHandlingFee > 0 && (
                      <PaymentRow label="Product handling" value={formatCurrency(productHandlingFee)} />
                    )}
                    <PaymentRow
                      label={`Platform fee (${formatPercent(contractTerms?.platformFeePercent)})`}
                      value={formatCurrency(platformFee)}
                    />
                    <PaymentRow label="Gateway fee" value={formatCurrency(gatewayFee)} />
                    <div
                      style={{
                        borderTop: "1px solid var(--color-border)",
                        paddingTop: "8px",
                        marginTop: "8px",
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "16px",
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>Brand payable</span>
                      <span style={{ fontWeight: 800 }} className="gradient-text">
                        {formatCurrency(brandPayable)}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <PaymentRow label="Deal amount" value={formatCurrency(deal.amount)} />
                    <PaymentRow label="Platform fee" value="Paid by brand" />
                    <div
                      style={{
                        borderTop: "1px solid var(--color-border)",
                        paddingTop: "8px",
                        marginTop: "8px",
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "16px",
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>You receive</span>
                      <span style={{ fontWeight: 800 }} className="gradient-text">
                        {formatCurrency(creatorPayout)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {requiresProduct && (
                <div className="card" style={{ marginBottom: "24px" }}>
                  <h3
                    style={{
                      fontSize: "16px",
                      fontWeight: 700,
                      marginBottom: "16px",
                    }}
                  >
                    Product
                  </h3>
                  <PaymentRow
                    label="Product"
                    value={deal.productName || contractTerms?.productName || "Required"}
                  />
                  {productValue > 0 && (
                    <PaymentRow label="Product value" value={formatCurrency(productValue)} />
                  )}
                  <PaymentRow
                    label="Status"
                    value={(deal.productFulfillmentStatus || "ADDRESS_PENDING").replaceAll("_", " ")}
                  />
                  {deal.dispatchTrackingNumber && (
                    <PaymentRow
                      label="Tracking"
                      value={`${deal.dispatchCarrier ? `${deal.dispatchCarrier} ` : ""}${deal.dispatchTrackingNumber}`}
                    />
                  )}
                  {isClient && deal.shippingAddress && (
                    <div
                      style={{
                        marginTop: "12px",
                        padding: "12px",
                        background: "var(--color-bg-tertiary)",
                        borderRadius: "var(--radius-md)",
                        fontSize: "13px",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      <div style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>
                        {deal.shippingAddress.fullName}
                      </div>
                      <div>{deal.shippingAddress.phone}</div>
                      <div>{deal.shippingAddress.line1}</div>
                      {deal.shippingAddress.line2 && <div>{deal.shippingAddress.line2}</div>}
                      <div>
                        {deal.shippingAddress.city}, {deal.shippingAddress.state} {deal.shippingAddress.pinCode}
                      </div>
                    </div>
                  )}
                  <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
                    {isInfluencer &&
                      ["ADDRESS_PENDING", "READY_TO_DISPATCH"].includes(
                        deal.productFulfillmentStatus,
                      ) && (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => setShowAddressModal(true)}
                          disabled={isSubmitting}
                        >
                          Add Shipping Address
                        </button>
                      )}
                    {isClient && deal.productFulfillmentStatus === "READY_TO_DISPATCH" && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => setShowDispatchModal(true)}
                        disabled={isSubmitting}
                      >
                        Confirm Dispatch
                      </button>
                    )}
                    {isInfluencer && deal.productFulfillmentStatus === "DISPATCHED" && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => handleProductAction({ action: "confirm_received" })}
                        disabled={isSubmitting}
                      >
                        Product Received
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="card" style={{ marginBottom: "24px" }}>
                <h3
                  style={{
                    fontSize: "16px",
                    fontWeight: 700,
                    marginBottom: "16px",
                  }}
                >
                  Timeline
                </h3>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "8px",
                    fontSize: "13px",
                  }}
                >
                  <span style={{ color: "var(--color-text-secondary)" }}>
                    Created
                  </span>
                  <span>{new Date(deal.createdAt).toLocaleDateString()}</span>
                </div>
                {deal.postingDeadline && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "13px",
                    }}
                  >
                    <span style={{ color: "var(--color-text-secondary)" }}>
                      Post Deadline
                    </span>
                    <span
                      style={{ fontWeight: 600, color: "var(--color-warning)" }}
                    >
                      {new Date(deal.postingDeadline).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="card">
                <h3
                  style={{
                    fontSize: "16px",
                    fontWeight: 700,
                    marginBottom: "16px",
                  }}
                >
                  Brand
                </h3>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "12px" }}
                >
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      background: "var(--gradient-card)",
                      borderRadius: "var(--radius-md)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      overflow: "hidden",
                    }}
                  >
                    {deal.brand?.logo ? (
                      <img
                        src={deal.brand.logo}
                        alt={deal.brand.companyName || "Brand"}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      deal.brand?.companyName?.[0] || "?"
                    )}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {deal.brand?.companyName || "Brand"}
                    </div>
                    {deal.brand?.isGstVerified && (
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        Verified Business
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showAddressModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "20px",
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: "560px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "20px" }}>
              Shipping Address
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              {([
                ["fullName", "Full name"],
                ["phone", "Phone"],
                ["line1", "Address line 1"],
                ["line2", "Address line 2"],
                ["city", "City"],
                ["state", "State"],
                ["pinCode", "PIN code"],
              ] as Array<[keyof typeof shippingAddress, string]>).map(([key, label]) => (
                <input
                  key={key}
                  className="input"
                  placeholder={label}
                  value={(shippingAddress as any)[key]}
                  onChange={(e) =>
                    setShippingAddress({ ...shippingAddress, [key]: e.target.value })
                  }
                  style={{ gridColumn: key === "line1" || key === "line2" ? "1 / -1" : undefined }}
                />
              ))}
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <button className="btn btn-secondary" onClick={() => setShowAddressModal(false)} style={{ flex: 1 }}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={isSubmitting}
                onClick={() =>
                  handleProductAction({
                    action: "submit_address",
                    address: shippingAddress,
                  })
                }
                style={{ flex: 1 }}
              >
                {isSubmitting ? <span className="loading" /> : "Save Address"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDispatchModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "20px",
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: "480px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "20px" }}>
              Dispatch Details
            </h2>
            <div style={{ display: "grid", gap: "12px", marginBottom: "16px" }}>
              <input
                className="input"
                placeholder="Tracking number"
                value={dispatchForm.trackingNumber}
                onChange={(e) =>
                  setDispatchForm({ ...dispatchForm, trackingNumber: e.target.value })
                }
              />
              <input
                className="input"
                placeholder="Carrier"
                value={dispatchForm.carrier}
                onChange={(e) =>
                  setDispatchForm({ ...dispatchForm, carrier: e.target.value })
                }
              />
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <button className="btn btn-secondary" onClick={() => setShowDispatchModal(false)} style={{ flex: 1 }}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={isSubmitting || !dispatchForm.trackingNumber.trim()}
                onClick={() =>
                  handleProductAction({
                    action: "confirm_dispatch",
                    trackingNumber: dispatchForm.trackingNumber,
                    carrier: dispatchForm.carrier || undefined,
                  })
                }
                style={{ flex: 1 }}
              >
                {isSubmitting ? <span className="loading" /> : "Save Tracking"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showReviewModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "20px",
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: "520px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
              }}
            >
              <h2 style={{ fontSize: "20px", fontWeight: 700 }}>
                Review Content
              </h2>
              <button
                onClick={() => setShowReviewModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer",
                  color: "var(--color-text-secondary)",
                }}
              >
                x
              </button>
            </div>

            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              <button
                type="button"
                className="btn"
                onClick={() => setReviewApproved(true)}
                style={{
                  flex: 1,
                  background: reviewApproved
                    ? "var(--color-success)"
                    : "var(--color-bg-tertiary)",
                  color: reviewApproved ? "white" : "inherit",
                }}
              >
                Approve
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setReviewApproved(false)}
                style={{
                  flex: 1,
                  background: !reviewApproved
                    ? "var(--color-warning)"
                    : "var(--color-bg-tertiary)",
                  color: !reviewApproved ? "white" : "inherit",
                }}
              >
                Request Revision
              </button>
            </div>

            {!reviewApproved && (
              <div style={{ marginBottom: "16px" }}>
                <label className="label">Revision feedback</label>
                <textarea
                  className="input"
                  rows={4}
                  value={reviewFeedback}
                  onChange={(e) => setReviewFeedback(e.target.value)}
                  placeholder="Tell the influencer exactly what needs to change"
                />
              </div>
            )}

            <div style={{ display: "flex", gap: "12px" }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowReviewModal(false)}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleReviewContent}
                disabled={isSubmitting || (!reviewApproved && reviewFeedback.trim().length < 5)}
                style={{ flex: 1 }}
              >
                {isSubmitting ? <span className="loading" /> : reviewApproved ? "Approve" : "Send Revision"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Content Modal */}
      {showSubmitModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "20px",
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: "500px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "24px",
              }}
            >
              <h2 style={{ fontSize: "20px", fontWeight: 700 }}>
                Submit Content
              </h2>
              <button
                onClick={() => setShowSubmitModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer",
                  color: "var(--color-text-secondary)",
                }}
              >
                x
              </button>
            </div>
            <div style={{ marginBottom: "20px" }}>
              <label className="label">Content URL *</label>
              <input
                type="url"
                className="input"
                placeholder="https://drive.google.com/..."
                value={contentForm.contentUrl}
                onChange={(e) =>
                  setContentForm({ ...contentForm, contentUrl: e.target.value })
                }
              />
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--color-text-muted)",
                  marginTop: "4px",
                }}
              >
                Google Drive, Dropbox, or direct link
              </p>
            </div>
            <div style={{ marginBottom: "20px" }}>
              <label className="label">Notes (Optional)</label>
              <textarea
                className="input"
                rows={3}
                placeholder="Any message for the brand..."
                value={contentForm.notes}
                onChange={(e) =>
                  setContentForm({ ...contentForm, notes: e.target.value })
                }
              />
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowSubmitModal(false)}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => handleAction("submit_content", contentForm)}
                disabled={isSubmitting || !contentForm.contentUrl}
                style={{ flex: 1 }}
              >
                {isSubmitting ? <span className="loading" /> : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verify Post Modal */}
      {showVerifyModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "20px",
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: "500px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "24px",
              }}
            >
              <h2 style={{ fontSize: "20px", fontWeight: 700 }}>
                Verify Post
              </h2>
              <button
                onClick={() => setShowVerifyModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer",
                  color: "var(--color-text-secondary)",
                }}
              >
                x
              </button>
            </div>
            <div style={{ marginBottom: "20px" }}>
              <label className="label">Live Post URL *</label>
              <input
                type="url"
                className="input"
                placeholder="https://instagram.com/p/..."
                value={postUrl}
                onChange={(e) => setPostUrl(e.target.value)}
              />
            </div>
            <div
              style={{
                padding: "12px",
                background: "var(--color-bg-tertiary)",
                borderRadius: "var(--radius-md)",
                marginBottom: "20px",
                fontSize: "13px",
                color: "var(--color-text-secondary)",
              }}
            >
              Ensure required hashtags are present.
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowVerifyModal(false)}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => handleAction("verify_post", { postUrl })}
                disabled={isSubmitting || !postUrl}
                style={{ flex: 1 }}
              >
                {isSubmitting ? <span className="loading" /> : "Verify"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
