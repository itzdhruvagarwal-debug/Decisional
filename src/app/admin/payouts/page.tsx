"use client";

import { FormEvent, useMemo, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { formatCurrency } from "@/lib/utils-client";
import EmptyState from "@/components/ui/EmptyState";
import { Button, Textarea } from "@/components/ui";
import { z } from "zod";

export const payoutDecisionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  note: z.string().max(250),
}).refine(data => data.action !== "REJECT" || data.note.trim().length >= 5, {
  message: "Rejection reason must be at least 5 characters.",
  path: ["note"]
});

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

interface PayoutResponse {
  withdrawals?: Withdrawal[];
  data?: { withdrawals?: Withdrawal[]; total?: number };
  total?: number;
}

export default function PayoutsAdminPage() {
  const [filter, setFilter] = useState("PENDING");
  const [processing, setProcessing] = useState<string | null>(null);
  const [draft, setDraft] = useState<ActionDraft | null>(null);

  const { data, isLoading: loading, error: fetchErr, mutate: fetchWithdrawals } = useSWR<PayoutResponse>(
    `/api/admin/payouts?status=${encodeURIComponent(filter)}&page=1&limit=50`,
    fetcher
  );

  const withdrawals = useMemo<Withdrawal[]>(
    () => data?.withdrawals ?? data?.data?.withdrawals ?? [],
    [data]
  );
  const total = data?.total ?? data?.data?.total ?? withdrawals.length;
  const error = fetchErr ? "Failed to load payouts" : "";

  const totalAmount = useMemo(
    () => withdrawals.reduce((sum, item) => sum + item.amount, 0),
    [withdrawals],
  );



  const [actionError, setActionError] = useState<string>("");

  const openAction = (withdrawal: Withdrawal, action: PayoutAction) => {
    setActionError("");
    setDraft({ withdrawal, action, note: "" });
  };

  const handleAction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) return;

    const validation = payoutDecisionSchema.safeParse({
      action: draft.action,
      note: draft.note,
    });

    if (!validation.success) {
      setActionError(validation.error.issues[0]?.message || "Invalid inputs");
      return;
    }

    const note = draft.note.trim();

    setProcessing(draft.withdrawal.id);
    setActionError("");

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
      setActionError(err instanceof Error ? err.message : "Failed to process payout");
    } finally {
      setProcessing(null);
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="card text-center p-10">
          Loading payouts...
        </div>
      );
    }

    if (withdrawals.length === 0) {
      return (
        <EmptyState
          emoji="📥"
          title="No Payouts in This Queue"
          description={filter === "PENDING"
            ? "There are no pending withdrawals waiting for review."
            : `No ${filter.toLowerCase()} payouts found.`}
        />
      );
    }

    return (
      <div className="card overflow-hidden p-0">
        <div className="admin-table-wrap">
          <table className="w-full border-collapse" style={{ minWidth: "980px" }}>
            <thead className="bg-tertiary">
              <tr>
                {["User", "Amount", "Destination", "Risk", "Requested", "Actions"].map(
                  (heading) => (
                    <th
                      key={heading}
                      className="border-b-card text-secondary text-xs font-extrabold uppercase" style={{ padding: "14px 16px", textAlign: heading === "Actions" ? "right" : "left" }}
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
                    className="border-b-card"
                  >
                    <td className="p-4">
                      <div className="font-extrabold text-sm">
                        {getUserName(user)}
                      </div>
                      <div className="text-muted text-xs">
                        {user.email}
                      </div>
                      <div className="text-primary-light text-xs">
                        {user.userType}
                      </div>
                      <div
                        className="mt-1 font-bold text-xs" style={{ color: user.taxCompliance?.panLast4
                            ? "var(--color-accent-emerald)"
                            : "var(--color-accent-rose)" }}
                      >
                        {user.taxCompliance?.panLast4
                          ? `PAN ****${user.taxCompliance.panLast4}`
                          : "PAN missing"}
                      </div>
                    </td>
                    <td className="p-4 font-extrabold">
                      {formatCurrency(withdrawal.amount)}
                    </td>
                    <td className="p-4 text-sm">
                      <div className="font-bold">{withdrawal.bankAccountName}</div>
                      <div className="text-muted">
                        A/c {maskAccount(withdrawal.bankAccountNumber)}
                      </div>
                      <div className="text-muted">
                        IFSC {withdrawal.ifscCode}
                      </div>
                      {withdrawal.upiId && (
                        <div className="text-muted">
                          UPI {withdrawal.upiId}
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <span
                        className="inline-flex text-xs font-extrabold rounded-full" style={{ border: "1px solid", padding: "4px 9px", ...statusStyle }}
                      >
                        {withdrawal.status}
                      </span>
                      <div className="text-muted text-xs mt-1">
                        Risk {withdrawal.riskScore}
                        {withdrawal.isManualReview ? " / manual" : ""}
                      </div>
                    </td>
                    <td className="p-4 text-muted text-sm">
                      {new Date(withdrawal.createdAt).toLocaleString("en-IN")}
                    </td>
                    <td className="p-4 text-right">
                      {withdrawal.status === "PENDING" || withdrawal.status === "PENDING_REVIEW" || withdrawal.status === "PROCESSING" ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={processing === withdrawal.id}
                            onClick={() => openAction(withdrawal, "REJECT")}
                          >
                            Reject
                          </Button>
                          <Button
                            type="button"
                            variant="success"
                            size="sm"
                            disabled={processing === withdrawal.id}
                            onClick={() => openAction(withdrawal, "APPROVE")}
                          >
                            {processing === withdrawal.id ? "Working..." : "Approve"}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted text-sm">
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
          <h1 className="text-3xl font-extrabold mb-1">
            Payout Operations
          </h1>
          <p className="text-secondary text-sm">
            Review withdrawal risk, bank details, and manual payout decisions.
          </p>
        </div>

        <div
          className="card px-4-py-3 min-w-220" style={{ borderColor: "rgba(99, 102, 241, 0.22)" }}
        >
          <div className="text-muted text-xs">
            Current view
          </div>
          <div className="text-lg font-extrabold">
            {total} payouts / {formatCurrency(totalAmount)}
          </div>
        </div>
      </div>

      <div className="admin-filter-row mb-4">
        {filters.map((status) => (
          <Button
            key={status}
            type="button"
            variant={filter === status ? "primary" : "secondary"}
            onClick={() => setFilter(status)}
            className="min-h-40" style={{ padding: "8px 14px" }}
          >
            {status}
          </Button>
        ))}

        <Button
          type="button"
          variant="ghost"
          onClick={() => { fetchWithdrawals(); }}
          className="min-h-40" style={{ padding: "8px 14px" }}
        >
          Refresh
        </Button>
      </div>

      {error && (
        <div
          className="card mb-4 text-rose" style={{ padding: "14px 16px", borderColor: "rgba(244, 63, 94, 0.35)" }}
        >
          {error}
        </div>
      )}

      {renderContent()}

      {draft && (
        <div className="admin-modal-backdrop">
          <form className="admin-modal card" onSubmit={handleAction}>
            <h2 className="text-xl mb-2 font-extrabold">
              {draft.action === "APPROVE" ? "Approve payout" : "Reject payout"}
            </h2>
            <p className="text-secondary text-sm mb-4">
              {formatCurrency(draft.withdrawal.amount)} for{" "}
              {getUserName(draft.withdrawal.wallet.user)}
            </p>

            {actionError && (
              <div className="text-sm mb-3 text-rose">
                {actionError}
              </div>
            )}

            {draft.action === "REJECT" ? (
              <>
                <label className="label" htmlFor="payout-note">
                  Rejection reason
                </label>
                <Textarea
                  id="payout-note"
                  rows={4}
                  required
                  value={draft.note}
                  onChange={(event) =>
                    setDraft({ ...draft, note: event.target.value })
                  }
                  placeholder="Explain why this payout is rejected"
                  className="resize-y mb-4" style={{ minHeight: "104px" }}
                />
              </>
            ) : (
              <div className="text-sm text-secondary mb-4">
                This will automatically trigger the Razorpay API to execute the transfer to the user&apos;s bank account.
              </div>
            )}

            <div className="flex justify-end flex-wrap gap-2-5">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDraft(null)}
                disabled={processing === draft.withdrawal.id}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant={draft.action === "APPROVE" ? "success" : "danger"}
                disabled={processing === draft.withdrawal.id}
              >
                {processing === draft.withdrawal.id ? "Processing..." : draft.action}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
