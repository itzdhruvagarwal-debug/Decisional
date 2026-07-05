"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { useTokenRefreshGuard } from "@/hooks/useTokenRefreshGuard";

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

/** Shape of a single deliverable item stored in contractTerms.deliverables */
interface DeliverableItem {
  type?: string;
  count?: number;
  platform?: string;
  details?: string;
  [key: string]: unknown;
}

/** Typed shape of the contractTerms JSON stored in Prisma */
interface ContractTermsJson {
  influencerPayout?: number;
  platformFee?: number;
  platformFeePercent?: number;
  gatewayFee?: number;
  reviewPeriodHours?: number;
  submissionDeadline?: string;
  postingDeadline?: string;
  mandatoryElements?: string[];
  mandatoryTags?: string[];
  deliverables?: DeliverableItem[];
  [key: string]: unknown;
}

/** Safely parse Prisma's opaque JsonValue into our typed ContractTerms shape */
function parseContractTerms(raw: unknown): ContractTermsJson {
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as ContractTermsJson;
  }
  return {};
}
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

function getToastBackground(type: "success" | "error" | "info"): string {
  if (type === "success") return "linear-gradient(135deg, #059669, #10b981)";
  if (type === "error") return "linear-gradient(135deg, #dc2626, #ef4444)";
  return "linear-gradient(135deg, #2563eb, #3b82f6)";
}

function getToastPrefix(type: "success" | "error" | "info"): string {
  if (type === "success") return "✓ ";
  if (type === "error") return "✕ ";
  return "ℹ ";
}

const ratingLabelMap: Record<number, string> = {
  1: "Poor",
  2: "Fair",
  3: "Good",
  4: "Great",
  5: "Excellent"
};

function getFlatDeliverablesList(dealObj: DealDetail | null | undefined) {
  if (!dealObj?.campaign?.deliverables) return [];
  const deliverables = Array.isArray(dealObj.campaign.deliverables)
    ? dealObj.campaign.deliverables
    : [];
  
  const list: Array<{ type: string; index: number; label: string }> = [];
  deliverables.forEach((d: { type: string; count: number }) => {
    const typeLabel = d.type.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
    for (let i = 0; i < d.count; i++) {
      list.push({
        type: `${d.type}_${i + 1}`,
        index: i + 1,
        label: `${typeLabel} #${i + 1}`,
      });
    }
  });
  return list;
}

function PaymentRow({ label, value }: { readonly label: string; readonly value: string }) {
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

interface ContentUrlItem {
  type: string;
  url: string;
  status?: string;
  feedback?: string;
}

interface DealDetail {
  id: string;
  status: string;
  amount: number;
  platformFee?: number;
  gatewayFee?: number;
  totalAmount?: number;
  productValue?: number;
  productHandlingFee?: number;
  requiresProduct?: boolean;
  productFulfillmentStatus?: string;
  contractSignature?: unknown;
  influencerId: string;
  brandId: string;
  campaignId: string;
  payoutRate: number;
  contractTerms?: unknown;
  createdAt: string;
  postingDeadline?: string | null;
  maxRevisions?: number;
  productName?: string | null;
  dispatchTrackingNumber?: string | null;
  dispatchCarrier?: string | null;
  shippingAddress?: {
    fullName: string;
    phone: string;
    line1: string;
    line2?: string | null;
    city: string;
    state: string;
    pinCode: string;
  } | null;
  signatures?: Array<{ userId: string; signedAt: string; ipAddress: string }>;
  campaign: {
    id: string;
    title: string;
    description: string;
    deliverables?: Array<{ type: string; count: number }>;
  };
  brand?: {
    logo?: string | null;
    companyName?: string;
    isGstVerified?: boolean;
  };
  influencer?: {
    displayName?: string;
    avatar?: string | null;
  };
  contentSubmissions?: Array<{
    id: string;
    status: string;
    contentUrl?: string;
    notes?: string;
    createdAt: string;
    feedback?: string | null;
    version?: number;
    contentUrls?: Array<ContentUrlItem>;
  }>;
}

export default function DealDetailPage() {
  const params = useParams();
  const { data: session } = useSession();
  const { requireFreshSession } = useTokenRefreshGuard();
  const id = params?.id as string;

  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [contentForm, setContentForm] = useState({ contentUrl: "", notes: "" });
  const [itemizedUrls, setItemizedUrls] = useState<Record<string, string>>({});
  const [itemizedReviews, setItemizedReviews] = useState<Record<string, { status: "APPROVED" | "REVISION_REQUESTED"; feedback: string }>>({});
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [postUrl, setPostUrl] = useState("");

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
  const [isUploadingContent, setIsUploadingContent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [hoverRating, setHoverRating] = useState(0);
  const [toasts, setToasts] = useState<Array<{id: number; type: "success" | "error" | "info"; message: string}>>([]);
  
  const removeToast = (toastId: number) => {
    setToasts(prev => prev.filter(t => t.id !== toastId));
  };

  const showToast = (type: "success" | "error" | "info", message: string) => {
    const toastId = Date.now();
    setToasts(prev => [...prev, { id: toastId, type, message }]);
    setTimeout(() => removeToast(toastId), 5000);
  };

  const fetchDeal = useCallback(async () => {
    try {
      const res = await fetch(`/api/deals/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch deal");
      setDeal(data.deal);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id && session) fetchDeal();
  }, [id, session, fetchDeal]);

  const handleContentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingContent(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", "content");

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        if (uploadingField) {
          setItemizedUrls(prev => ({ ...prev, [uploadingField]: data.url }));
        } else {
          setContentForm(prev => ({ ...prev, contentUrl: data.url }));
        }
        showToast("success", "File uploaded successfully");
      } else {
        showToast("error", "Upload failed: " + (data.error || "Unknown error"));
      }
    } catch {
      showToast("error", "Network error during upload");
    } finally {
      setIsUploadingContent(false);
      setUploadingField(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAction = async (action: string, payload: Record<string, unknown>) => {
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

      showToast("success", data.message || "Success!");
      setShowSubmitModal(false);
      setShowVerifyModal(false);
      fetchDeal(); // Refresh data
      return true;
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProductAction = async (payload: Record<string, unknown>) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/deals/${id}/product`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Product update failed");

      showToast("success", "Product status updated.");
      setShowAddressModal(false);
      setShowDispatchModal(false);
      fetchDeal();
      return true;
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignContract = async () => {
    const fresh = await requireFreshSession();
    if (!fresh) return;

    const terms = parseContractTerms(deal?.contractTerms);
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

      showToast("success", data.message || "Contract signed successfully.");
      fetchDeal();
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReviewContent = async () => {
    const deliverablesList = getFlatDeliverablesList(deal);
    
    // Construct reviews payload from itemizedReviews state
    const reviewsPayload = deliverablesList.map((item) => {
      const review = itemizedReviews[item.type] || { status: "REVISION_REQUESTED", feedback: "" };
      return {
        type: item.type,
        status: review.status,
        feedback: review.status === "REVISION_REQUESTED" ? review.feedback.trim() : "",
      };
    });

    // Validate that any deliverable marked as REVISION_REQUESTED has a feedback of at least 5 chars
    let hasValidationError = false;
    reviewsPayload.forEach((r) => {
      if (r.status === "REVISION_REQUESTED" && (!r.feedback || r.feedback.length < 5)) {
        showToast("error", `Please provide at least 5 characters of feedback for ${r.type.replace(/_\d+$/, '').replaceAll('_', ' ')}`);
        hasValidationError = true;
      }
    });

    if (hasValidationError) return;

    const overallApproved = reviewsPayload.every((r) => r.status === "APPROVED");

    const success = await handleAction("review_content", {
      approved: overallApproved,
      reviews: reviewsPayload,
      feedback: overallApproved ? undefined : "Revision requested on item(s)",
    });

    if (success) {
      setShowReviewModal(false);
      setItemizedReviews({});
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

        showToast("success", "Invite successfully rejected.");
        fetchDeal();
      } catch (err: unknown) {
        showToast("error", err instanceof Error ? err.message : String(err));
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
  const contractTerms = parseContractTerms(deal.contractTerms);
  let mandatoryElements: any[] = [];
  if (Array.isArray(contractTerms?.mandatoryElements)) {
    mandatoryElements = contractTerms.mandatoryElements;
  } else if (Array.isArray(contractTerms?.mandatoryTags)) {
    mandatoryElements = contractTerms.mandatoryTags;
  }
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
      : deal.totalAmount || (deal.amount + platformFee + gatewayFee);
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
  const contractSignature = deal.contractSignature as Record<string, unknown>;
  const brandSigned = Boolean(contractSignature?.brandSignature);
  const influencerSigned = Boolean(contractSignature?.influencerSignature);
  const influencerObligations = normalizeTextArray(
    contractTerms?.influencerObligations,
  );
  const brandObligations = normalizeTextArray(contractTerms?.brandObligations);
  return (
    <DashboardShell user={session.user}>
      <div className="deal-detail-page" style={{ maxWidth: "1280px", margin: "0 auto", display: "grid", gap: "24px" }}>
        {toasts.length > 0 && (
          <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: "8px", maxWidth: "400px" }}>
            {toasts.map(t => (
              <div
                key={t.id}
                role="button"
                tabIndex={0}
                style={{
                  padding: "12px 20px",
                  borderRadius: "10px",
                  color: "#fff",
                  fontSize: "14px",
                  fontWeight: 500,
                  background: getToastBackground(t.type),
                  boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  animation: "slideInRight 0.3s ease-out",
                  cursor: "pointer",
                }}
                onClick={() => removeToast(t.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    removeToast(t.id);
                  }
                }}
              >
                {getToastPrefix(t.type)}{t.message}
              </div>
            ))}
          </div>
        )}
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
                    onClick={() => {
                      const latestSub = deal?.contentSubmissions?.[0];
                      const prevUrls: Record<string, string> = {};
                      if (latestSub?.contentUrls && Array.isArray(latestSub.contentUrls)) {
                        latestSub.contentUrls.forEach((item) => {
                          prevUrls[item.type] = item.url || "";
                        });
                      }
                      setItemizedUrls(prevUrls);
                      setContentForm({ contentUrl: latestSub?.contentUrl || "", notes: latestSub?.notes || "" });
                      setShowSubmitModal(true);
                    }}
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
                  onClick={() => {
                    const latestSub = deal?.contentSubmissions?.[0];
                    const prevReviews: Record<string, { status: "APPROVED" | "REVISION_REQUESTED"; feedback: string }> = {};
                    
                    const deliverablesList = getFlatDeliverablesList(deal);
                    deliverablesList.forEach((item) => {
                      const existing = latestSub?.contentUrls && Array.isArray(latestSub.contentUrls)
                        ? latestSub.contentUrls.find((urlObj) => urlObj.type === item.type)
                        : null;
                      
                      prevReviews[item.type] = {
                        status: existing?.status === "APPROVED" ? "APPROVED" : "REVISION_REQUESTED",
                        feedback: existing?.feedback || "",
                      };
                    });
                    
                    setItemizedReviews(prevReviews);
                    setShowReviewModal(true);
                  }}
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

                    let stepBg = "var(--color-bg-tertiary)";
                    if (isCompleted) {
                      stepBg = "var(--color-success)";
                    } else if (isCurrent && !isCancelled) {
                      stepBg = "var(--color-primary)";
                    }

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
                            background: stepBg,
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
                  deal.contentSubmissions?.map((sub) => {
                    let subBg = "var(--color-accent-blue)";
                    if (sub.status === "APPROVED") {
                      subBg = "var(--color-success)";
                    } else if (sub.status === "REVISION_REQUESTED") {
                      subBg = "var(--color-warning)";
                    }

                    return (
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
                              background: subBg,
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
                        {sub.contentUrls && Array.isArray(sub.contentUrls) && sub.contentUrls.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px", marginBottom: "8px" }}>
                            {sub.contentUrls.map((item) => {
                              let itemBg = "var(--color-accent-blue)";
                              if (item.status === "APPROVED") {
                                itemBg = "var(--color-success)";
                              } else if (item.status === "REVISION_REQUESTED") {
                                itemBg = "var(--color-warning)";
                              }
                              return (
                                <div key={item.type} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px", background: "var(--color-bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                    <span style={{ fontSize: "13px", fontWeight: 600 }}>
                                      {item.type.replace(/_\d+$/, '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())}
                                    </span>
                                    <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "var(--color-primary)", wordBreak: "break-all" }}>
                                      View Link
                                    </a>
                                    {item.feedback && (
                                      <span style={{ fontSize: "12px", color: "var(--color-warning)", marginTop: "2px" }}>
                                        Feedback: {item.feedback}
                                      </span>
                                    )}
                                  </div>
                                  <span style={{
                                    fontSize: "11px",
                                    padding: "2px 6px",
                                    borderRadius: "var(--radius-sm)",
                                    background: itemBg,
                                    color: "white"
                                  }}>
                                    {item.status}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
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
                        )}
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
                );
              })
                )}
              </div>

              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                  <h2
                    style={{
                      fontSize: "18px",
                      fontWeight: 700,
                      marginBottom: "0",
                    }}
                  >
                    Contract Terms
                  </h2>
                  {contractTerms && (
                    <button
                      className="btn btn-secondary"
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/deals/${id}/contract`);
                          if (!res.ok) throw new Error("Failed to download contract");
                          const blob = await res.blob();
                          const url = globalThis.URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `decisional-contract-${id.slice(0, 8)}.csv`;
                          document.body.appendChild(a);
                          a.click();
                          globalThis.URL.revokeObjectURL(url);
                          a.remove();
                          showToast("success", "Contract downloaded successfully");
                        } catch (err) {
                          console.error("Contract download failed", err);
                          showToast("error", "Failed to download contract");
                        }
                      }}
                      style={{ fontSize: "13px", padding: "8px 16px" }}
                    >
                      Download Contract (CSV)
                    </button>
                  )}
                </div>
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
                        ["Platform fee", `${formatCurrency(platformFee)} (${formatPercent(typeof contractTerms.platformFeePercent === "number" ? contractTerms.platformFeePercent : undefined)})`],
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
                          {(contractDeliverables as DeliverableItem[]).map((item, index) => (
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
                          <strong>{typeof contractTerms.reviewPeriodHours === "number" ? contractTerms.reviewPeriodHours : 48} hours</strong>
                        </div>
                        <div>
                          Included revisions:{" "}
                          <strong>{String(contractTerms.includedRevisions ?? deal.maxRevisions ?? 2)}</strong>
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
                      label={`Platform fee (${formatPercent(typeof contractTerms?.platformFeePercent === "number" ? contractTerms.platformFeePercent : undefined)})`}
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
                    value={String(deal.productName || contractTerms?.productName || "Required")}
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
                      value={(deal.dispatchCarrier ? (deal.dispatchCarrier + " ") : "") + deal.dispatchTrackingNumber}
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
                        deal.productFulfillmentStatus || "",
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
                  value={(shippingAddress as Record<string, unknown>)[key] as string}
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

            <div style={{ maxHeight: "400px", overflowY: "auto", marginBottom: "20px", display: "flex", flexDirection: "column", gap: "16px", paddingRight: "4px" }}>
              {getFlatDeliverablesList(deal).map((item) => {
                const latestSub = deal?.contentSubmissions?.[0];
                const submittedUrlObj = latestSub?.contentUrls && Array.isArray(latestSub.contentUrls)
                  ? latestSub.contentUrls.find((urlObj) => urlObj.type === item.type)
                  : null;
                const url = submittedUrlObj?.url || (item.type.startsWith("GENERIC") ? latestSub?.contentUrl : "") || "";

                const itemReview = itemizedReviews[item.type] || { status: "APPROVED", feedback: "" };

                return (
                  <div key={item.type} style={{ padding: "12px", background: "var(--color-bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px", gap: "8px" }}>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontWeight: 600, fontSize: "14px" }}>{item.label}</span>
                        {url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "var(--color-primary)", wordBreak: "break-all", marginTop: "2px" }}>
                            View Submission Link
                          </a>
                        ) : (
                          <span style={{ fontSize: "12px", color: "var(--color-text-muted)", fontStyle: "italic" }}>No link submitted</span>
                        )}
                      </div>
                      
                      <div style={{ display: "flex", gap: "4px" }}>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => setItemizedReviews({
                            ...itemizedReviews,
                            [item.type]: { ...itemReview, status: "APPROVED" }
                          })}
                          style={{
                            padding: "4px 8px",
                            fontSize: "12px",
                            background: itemReview.status === "APPROVED" ? "var(--color-success)" : "var(--color-bg-tertiary)",
                            color: itemReview.status === "APPROVED" ? "white" : "inherit"
                          }}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => setItemizedReviews({
                            ...itemizedReviews,
                            [item.type]: { ...itemReview, status: "REVISION_REQUESTED" }
                          })}
                          style={{
                            padding: "4px 8px",
                            fontSize: "12px",
                            background: itemReview.status === "REVISION_REQUESTED" ? "var(--color-warning)" : "var(--color-bg-tertiary)",
                            color: itemReview.status === "REVISION_REQUESTED" ? "white" : "inherit"
                          }}
                        >
                          Revision
                        </button>
                      </div>
                    </div>

                    {itemReview.status === "REVISION_REQUESTED" && (
                      <div style={{ marginTop: "8px" }}>
                        <textarea
                          className="input"
                          rows={2}
                          placeholder="What needs to change for this specific deliverable?"
                          value={itemReview.feedback}
                          onChange={(e) => setItemizedReviews({
                            ...itemizedReviews,
                            [item.type]: { ...itemReview, feedback: e.target.value }
                          })}
                          style={{ fontSize: "12px", padding: "8px" }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

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
                disabled={isSubmitting}
                style={{ flex: 1 }}
              >
                {isSubmitting ? <span className="loading" /> : "Submit Review"}
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
          <div className="card" style={{ width: "100%", maxWidth: "550px" }}>
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
            
            <div style={{ maxHeight: "350px", overflowY: "auto", marginBottom: "20px", display: "flex", flexDirection: "column", gap: "16px", paddingRight: "4px" }}>
              {getFlatDeliverablesList(deal).map((item) => {
                const latestSub = deal?.contentSubmissions?.[0];
                const existing = latestSub?.contentUrls && Array.isArray(latestSub.contentUrls)
                  ? latestSub.contentUrls.find((u) => u.type === item.type)
                  : null;
                const isApproved = existing?.status === "APPROVED";

                return (
                  <div key={item.type} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <label className="label" style={{ marginBottom: 0, fontWeight: 600 }}>{item.label} *</label>
                      {isApproved && (
                        <span style={{ fontSize: "12px", color: "var(--color-success)", fontWeight: 600 }}>
                          ✅ Approved (Locked)
                        </span>
                      )}
                    </div>
                    
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="url"
                        className="input"
                        placeholder="https://drive.google.com/..."
                        value={isApproved ? (existing?.url || "") : (itemizedUrls[item.type] || "")}
                        onChange={(e) =>
                          setItemizedUrls({ ...itemizedUrls, [item.type]: e.target.value })
                        }
                        disabled={isApproved}
                        style={{ flex: 1 }}
                      />
                      {!isApproved && (
                        <button
                          className="btn btn-secondary"
                          onClick={() => {
                            setUploadingField(item.type);
                            setTimeout(() => fileInputRef.current?.click(), 50);
                          }}
                          disabled={isUploadingContent}
                          style={{ whiteSpace: "nowrap" }}
                        >
                          {isUploadingContent && uploadingField === item.type ? "Uploading..." : "Upload"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={handleContentUpload}
                accept="image/*,video/*,.pdf"
              />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label className="label" htmlFor="submit-notes-textarea">Notes (Optional)</label>
              <textarea
                id="submit-notes-textarea"
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
                onClick={async () => {
                  const deliverablesList = getFlatDeliverablesList(deal);
                  const submissionUrls = deliverablesList.map(item => {
                    const latestSub = deal?.contentSubmissions?.[0];
                    const existing = latestSub?.contentUrls && Array.isArray(latestSub.contentUrls)
                      ? latestSub.contentUrls.find((u) => u.type === item.type)
                      : null;
                    
                    if (existing?.status === "APPROVED") {
                      return {
                        type: item.type,
                        url: existing.url,
                        status: "APPROVED",
                      };
                    }

                    return {
                      type: item.type,
                      url: itemizedUrls[item.type] || "",
                    };
                  });

                  // Validate all urls are filled
                  const missingUrls = submissionUrls.filter(item => !item.url);
                  if (missingUrls.length > 0) {
                    showToast("error", "Please provide submission links for all deliverables.");
                    return;
                  }

                  await handleAction("submit_content", {
                    contentUrls: submissionUrls,
                    notes: contentForm.notes,
                    // Backward-compatible fallback for single url
                    contentUrl: submissionUrls[0]?.url || "",
                  });
                }}
                disabled={isSubmitting}
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
              <label className="label" htmlFor="live-post-url-input">Live Post URL *</label>
              <input
                id="live-post-url-input"
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
      {/* ── Star Rating & Review Section ── */}
      {deal.status === "COMPLETED" && !reviewSubmitted && (
        <div
          className="card"
          style={{
            padding: "28px",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-border)",
            background: "linear-gradient(135deg, rgba(16,185,129,0.05), rgba(59,130,246,0.05))",
          }}
        >
          <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px" }}>⭐ Rate This Deal</h3>
          <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "16px" }}>How was your experience? Your review helps build trust on the platform.</p>
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setReviewRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "32px",
                  transition: "transform 0.15s ease",
                  transform: (hoverRating || reviewRating) >= star ? "scale(1.15)" : "scale(1)",
                  filter: (hoverRating || reviewRating) >= star ? "none" : "grayscale(1) opacity(0.3)",
                }}
              >
                ⭐
              </button>
            ))}
            {reviewRating > 0 && (
              <span style={{ alignSelf: "center", marginLeft: "8px", fontSize: "14px", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                {ratingLabelMap[reviewRating] || "Excellent"}
              </span>
            )}
          </div>
          <textarea
            placeholder="Share your experience (optional)..."
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
            rows={3}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-primary)",
              fontSize: "14px",
              resize: "vertical",
              marginBottom: "16px",
            }}
          />
          <button
            className="btn btn-primary"
            disabled={reviewRating === 0 || isSubmitting}
            onClick={async () => {
              setIsSubmitting(true);
              try {
                const res = await fetch("/api/reviews", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    dealId: id,
                    rating: reviewRating,
                    ...(reviewComment.trim() ? { comment: reviewComment.trim() } : {}),
                  }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Failed to submit review");
                showToast("success", "Review submitted! Thank you.");
                setReviewSubmitted(true);
              } catch (err: unknown) {
                showToast("error", err instanceof Error ? err.message : String(err));
              } finally {
                setIsSubmitting(false);
              }
            }}
            style={{ minWidth: "160px" }}
          >
            {isSubmitting ? <span className="loading" /> : "Submit Review"}
          </button>
        </div>
      )}
      {deal.status === "COMPLETED" && reviewSubmitted && (
        <div
          className="card"
          style={{
            padding: "20px 28px",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--color-success)",
            background: "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.02))",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <span style={{ fontSize: "24px" }}>✅</span>
          <div>
            <strong>Review Submitted</strong>
            <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: 0 }}>
              {"⭐".repeat(reviewRating)} — Thank you for your feedback!
            </p>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
