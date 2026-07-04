"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/utils-client";

interface Withdrawal {
  id: string;
  amount: number;
  bankAccountName: string;
  bankAccountNumber: string;
  ifscCode: string;
  upiId: string | null;
  status: string;
  riskScore: number;
  isManualReview: boolean;
  createdAt: string;
  wallet: {
    user: {
      id: string;
      email: string;
      userType: string;
      influencerProfile: { displayName: string } | null;
      brandProfile: { companyName: string } | null;
      taxCompliance: {
        panLast4: string | null;
        status: string | null;
        itrAcknowledgementLast4: string | null;
      } | null;
    };
  };
}

type PayoutAction = "APPROVE" | "REJECT";

type ActionDraft = {
  withdrawal: Withdrawal;
  action: PayoutAction;
  note: string;
};

const filters = ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "ALL"];

function maskAccount(value: string) {
  const clean = value.replace(/\s+/g, "");
  if (clean.length <= 4) return "****";
  return `****${clean.slice(-4)}`;
}

function getUserName(user: Withdrawal["wallet"]["user"]) {
  if (user.influencerProfile) return user.influencerProfile.displayName;
  if (user.brandProfile) return user.brandProfile.companyName;
  return user.email;
}

function getStatusStyle(status: string) {
  if (status === "COMPLETED") {
    return {
      background: "rgba(16, 185, 129, 0.12)",
      color: "var(--color-accent-emerald)",
      borderColor: "rgba(16, 185, 129, 0.25)",
    };
  }

  if (status === "FAILED") {
    return {
      background: "rgba(244, 63, 94, 0.12)",
      color: "var(--color-accent-rose)",
      borderColor: "rgba(244, 63, 94, 0.25)",
    };
  }

  return {
    background: "rgba(245, 158, 11, 0.12)",
    color: "var(--color-accent-amber)",
    borderColor: "rgba(245, 158, 11, 0.25)",
  };
}

export default function PayoutsAdminPage() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("PENDING");
  const [total, setTotal] = useState(0);
  const [processing, setProcessing] = useState<string | null>(null);
  const [draft, setDraft] = useState<ActionDraft | null>(null);

  const totalAmount = useMemo(
    () => withdrawals.reduce((sum, item) => sum + item.amount, 0),
    [withdrawals],
  );

  const fetchWithdrawals = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(
        `/api/admin/payouts?status=${encodeURIComponent(filter)}&page=1&limit=50`,
        { cache: "no-store" },
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to load payouts");
      }

      const nextWithdrawals = data.withdrawals || data.data?.withdrawals || [];
      setWithdrawals(nextWithdrawals);
      setTotal(data.total || data.data?.total || nextWithdrawals.length);
    } catch (err) {
      setWithdrawals([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : "Failed to load payouts");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchWithdrawals();
  }, [fetchWithdrawals]);

  const openAction = (withdrawal: Withdrawal, action: PayoutAction) => {
    setDraft({ withdrawal, action, note: "" });
  };

  const handleAction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) return;

    const note = draft.note.trim();
    if (draft.action === "REJECT" && note.length < 5) {
      setError("Rejection reason must be at least 5 characters.");
      return;
    }

    setProcessing(draft.withdrawal.id);
    setError("");

    try {
      const body =
        draft.action === "APPROVE"
          ? { action: draft.action }
          : { action: draft.action, failureReason: note };

      const res = await fetch(`/api/admin/payouts/${draft.withdrawal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to process payout");
      }

      setDraft(null);
      await fetchWithdrawals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process payout");
    } finally {
      setProcessing(null);
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="card" style={{ padding: "48px", textAlign: "center" }}>
          Loading payouts...
        </div>
      );
    }

    if (withdrawals.length === 0) {
      return (
        <div className="card" style={{ padding: "56px 24px", textAlign: "center" }}>
          <h3 style={{ fontSize: "18px", fontWeight: 800, marginBottom: "8px" }}>
            No payouts in this queue
          </h3>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
            {filter === "PENDING"
              ? "There are no pending withdrawals waiting for review."
              : `No ${filter.toLowerCase()} payouts found.`}
          </p>
        </div>
      );
    }

    return (
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="admin-table-wrap">
          <table style={{ width: "100%", minWidth: "980px", borderCollapse: "collapse" }}>
            <thead style={{ background: "var(--color-bg-tertiary)" }}>
              <tr>
                {["User", "Amount", "Destination", "Risk", "Requested", "Actions"].map(
                  (heading) => (
                    <th
                      key={heading}
                      style={{
                        padding: "14px 16px",
                        textAlign: heading === "Actions" ? "right" : "left",
                        borderBottom: "1px solid var(--color-border)",
                        color: "var(--color-text-secondary)",
                        fontSize: "12px",
                        fontWeight: 800,
                        textTransform: "uppercase",
                      }}
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((withdrawal) => {
                const statusStyle = getStatusStyle(withdrawal.status);
                const user = withdrawal.wallet.user;

                return (
                  <tr
                    key={withdrawal.id}
                    style={{ borderBottom: "1px solid var(--color-border)" }}
                  >
                    <td style={{ padding: "16px" }}>
                      <div style={{ fontWeight: 800, fontSize: "14px" }}>
                        {getUserName(user)}
                      </div>
                      <div style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>
                        {user.email}
                      </div>
                      <div style={{ color: "var(--color-primary-light)", fontSize: "11px" }}>
                        {user.userType}
                      </div>
                      <div
                        style={{
                          color: user.taxCompliance?.panLast4
                            ? "var(--color-accent-emerald)"
                            : "var(--color-accent-rose)",
                          fontSize: "11px",
                          marginTop: "4px",
                          fontWeight: 700,
                        }}
                      >
                        {user.taxCompliance?.panLast4
                          ? `PAN ****${user.taxCompliance.panLast4}`
                          : "PAN missing"}
                      </div>
                    </td>
                    <td style={{ padding: "16px", fontWeight: 900 }}>
                      {formatCurrency(withdrawal.amount)}
                    </td>
                    <td style={{ padding: "16px", fontSize: "13px" }}>
                      <div style={{ fontWeight: 700 }}>{withdrawal.bankAccountName}</div>
                      <div style={{ color: "var(--color-text-muted)" }}>
                        A/c {maskAccount(withdrawal.bankAccountNumber)}
                      </div>
                      <div style={{ color: "var(--color-text-muted)" }}>
                        IFSC {withdrawal.ifscCode}
                      </div>
                      {withdrawal.upiId && (
                        <div style={{ color: "var(--color-text-muted)" }}>
                          UPI {withdrawal.upiId}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "16px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          border: "1px solid",
                          borderRadius: "999px",
                          padding: "4px 9px",
                          fontSize: "12px",
                          fontWeight: 800,
                          ...statusStyle,
                        }}
                      >
                        {withdrawal.status}
                      </span>
                      <div style={{ color: "var(--color-text-muted)", fontSize: "12px", marginTop: "6px" }}>
                        Risk {withdrawal.riskScore}
                        {withdrawal.isManualReview ? " / manual" : ""}
                      </div>
                    </td>
                    <td style={{ padding: "16px", color: "var(--color-text-muted)", fontSize: "13px" }}>
                      {new Date(withdrawal.createdAt).toLocaleString("en-IN")}
                    </td>
                    <td style={{ padding: "16px", textAlign: "right" }}>
                      {withdrawal.status === "PENDING" || withdrawal.status === "PENDING_REVIEW" || withdrawal.status === "PROCESSING" ? (
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={processing === withdrawal.id}
                            onClick={() => openAction(withdrawal, "REJECT")}
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            className="btn btn-success btn-sm"
                            disabled={processing === withdrawal.id}
                            onClick={() => openAction(withdrawal, "APPROVE")}
                          >
                            {processing === withdrawal.id ? "Working..." : "Approve"}
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: "var(--color-text-muted)", fontSize: "13px" }}>
                          Closed
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="admin-page">
      <div className="admin-toolbar">
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 900, marginBottom: "6px" }}>
            Payout Operations
          </h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
            Review withdrawal risk, bank details, and manual payout decisions.
          </p>
        </div>

        <div
          className="card"
          style={{
            padding: "12px 16px",
            minWidth: "220px",
            borderColor: "rgba(99, 102, 241, 0.22)",
          }}
        >
          <div style={{ color: "var(--color-text-muted)", fontSize: "12px" }}>
            Current view
          </div>
          <div style={{ fontSize: "18px", fontWeight: 900 }}>
            {total} payouts / {formatCurrency(totalAmount)}
          </div>
        </div>
      </div>

      <div className="admin-filter-row" style={{ marginBottom: "18px" }}>
        {filters.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            className={`btn ${filter === status ? "btn-primary" : "btn-secondary"}`}
            style={{ minHeight: "40px", padding: "8px 14px" }}
          >
            {status}
          </button>
        ))}

        <button
          type="button"
          onClick={fetchWithdrawals}
          className="btn btn-ghost"
          style={{ minHeight: "40px", padding: "8px 14px" }}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div
          className="card"
          style={{
            marginBottom: "16px",
            padding: "14px 16px",
            borderColor: "rgba(244, 63, 94, 0.35)",
            color: "var(--color-accent-rose)",
          }}
        >
          {error}
        </div>
      )}

      {renderContent()}

      {draft && (
        <div className="admin-modal-backdrop">
          <form className="admin-modal card" onSubmit={handleAction}>
            <h2 style={{ fontSize: "20px", fontWeight: 900, marginBottom: "8px" }}>
              {draft.action === "APPROVE" ? "Approve payout" : "Reject payout"}
            </h2>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "14px", marginBottom: "18px" }}>
              {formatCurrency(draft.withdrawal.amount)} for{" "}
              {getUserName(draft.withdrawal.wallet.user)}
            </p>

            {draft.action === "REJECT" ? (
              <>
                <label className="label" htmlFor="payout-note">
                  Rejection reason
                </label>
                <textarea
                  id="payout-note"
                  className="input"
                  rows={4}
                  required
                  value={draft.note}
                  onChange={(event) =>
                    setDraft({ ...draft, note: event.target.value })
                  }
                  placeholder="Explain why this payout is rejected"
                  style={{ resize: "vertical", minHeight: "104px", marginBottom: "18px" }}
                />
              </>
            ) : (
              <div style={{ marginBottom: "18px", fontSize: "14px", color: "var(--color-text-secondary)" }}>
                This will automatically trigger the Razorpay API to execute the transfer to the user's bank account.
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDraft(null)}
                disabled={processing === draft.withdrawal.id}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={draft.action === "APPROVE" ? "btn btn-success" : "btn btn-danger"}
                disabled={processing === draft.withdrawal.id}
              >
                {processing === draft.withdrawal.id ? "Processing..." : draft.action}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
