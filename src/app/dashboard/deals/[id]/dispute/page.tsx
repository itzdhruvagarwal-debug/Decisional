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

  const dealId = id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (description.trim().length < 50) {
      alert("Please describe the issue in at least 50 characters.");
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
        alert(data.message);
        router.push(`/dashboard/deals/${dealId}`);
      } else {
        alert(data.error || "Failed to raise dispute");
      }
    } catch (error) {
      console.error(error);
      alert("Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
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
  );
}
