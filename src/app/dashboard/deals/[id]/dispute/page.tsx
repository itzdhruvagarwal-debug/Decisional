"use client";

import { useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function DisputePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [issueType, setIssueType] = useState("TIMELINE");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toasts, setToasts] = useState<Array<{id: number; type: "success" | "error" | "info"; message: string}>>([]);
  const showToast = (type: "success" | "error" | "info", message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  };

  const dealId = id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (description.trim().length < 50) {
      showToast("error", "Please describe the issue in at least 50 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/disputes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          dealId,
          type: issueType,
          description,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showToast("success", data.message);
        router.push(`/dashboard/deals/${dealId}`);
      } else {
        showToast("error", data.error || "Failed to raise dispute");
      }
    } catch (error) {
      console.error(error);
      showToast("error", "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
    {toasts.length > 0 && (
      <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: "8px", maxWidth: "400px" }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding: "12px 20px",
            borderRadius: "10px",
            color: "#fff",
            fontSize: "14px",
            fontWeight: 500,
            background: t.type === "success" ? "linear-gradient(135deg, #059669, #10b981)" : t.type === "error" ? "linear-gradient(135deg, #dc2626, #ef4444)" : "linear-gradient(135deg, #2563eb, #3b82f6)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.1)",
            animation: "slideInRight 0.3s ease-out",
            cursor: "pointer",
          }} onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>
            {t.type === "success" ? "✓ " : t.type === "error" ? "✕ " : "ℹ "}{t.message}
          </div>
        ))}
      </div>
    )}
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        justifyContent: "center",
        alignItems: "center",
        background: "var(--color-bg-secondary)",
      }}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: "600px", padding: "32px" }}
      >
        <div style={{ marginBottom: "24px" }}>
          <Link
            href={`/dashboard/deals/${dealId}`}
            style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}
          >
            ← Back to Deal
          </Link>
          <h1 style={{ fontSize: "24px", fontWeight: 800, marginTop: "8px" }}>
            🚨 Raise a Dispute
          </h1>
          <p style={{ color: "var(--color-text-secondary)" }}>
            We're here to help. Select the issue type and describe the problem.
            Our automated system (Tier 1) will attempt to resolve it
            immediately.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "20px" }}>
            <label className="label">Issue Type</label>
            <select
              className="input"
              value={issueType}
              onChange={(e) => setIssueType(e.target.value)}
            >
              <option value="TIMELINE">
                Timeline Issue (Missed Deadlines)
              </option>
              <option value="QUALITY">Quality / Content Mismatch</option>
              <option value="PAYMENT">Payment Issue</option>
              <option value="TERMS_VIOLATION">Terms Violation</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div style={{ marginBottom: "24px" }}>
            <label className="label">Description</label>
            <textarea
              className="input"
              rows={6}
              placeholder="Please describe the issue in detail..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
            <p style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
              {description.trim().length}/50 minimum characters
            </p>
          </div>

          <div style={{ display: "flex", gap: "16px" }}>
            <Link
              href={`/dashboard/deals/${dealId}`}
              className="btn btn-secondary"
              style={{ flex: 1, textAlign: "center" }}
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="btn btn-primary"
              style={{
                flex: 1,
                background: "var(--color-error)",
                borderColor: "var(--color-error)",
              }}
              disabled={isSubmitting || description.trim().length < 50}
            >
              {isSubmitting ? "Submitting..." : "Raise Dispute"}
            </button>
          </div>
        </form>
      </div>
    </div>
    </>
  );
}
