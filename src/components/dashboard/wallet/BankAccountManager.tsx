import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import EmptyState from "@/components/ui/EmptyState";
import { logger } from "@/lib/logger-client";
import { Button, Input } from "@/components/ui";
import { z } from "zod";

export const bankAccountSchema = z.object({
  payoutType: z.enum(["bank", "upi"]),
  accountName: z.string().min(2, "Beneficiary name must be at least 2 characters").max(100, "Beneficiary name cannot exceed 100 characters"),
  accountNumber: z.string().optional().or(z.literal("")),
  ifscCode: z.string().optional().or(z.literal("")),
  bankName: z.string().optional().or(z.literal("")),
  upiId: z.string().optional().or(z.literal("")),
}).superRefine((data, ctx) => {
  if (data.payoutType === "bank") {
    if (!data.accountNumber || data.accountNumber.length < 9 || data.accountNumber.length > 18 || !/^\d+$/.test(data.accountNumber)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please enter a valid 9 to 18 digit account number",
        path: ["accountNumber"],
      });
    }
    if (!data.ifscCode || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(data.ifscCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please enter a valid 11-digit IFSC code (e.g. SBIN0001234)",
        path: ["ifscCode"],
      });
    }
    if (!data.bankName || data.bankName.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please enter a valid bank name",
        path: ["bankName"],
      });
    }
  } else if (data.payoutType === "upi") {
    if (!data.upiId || !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(data.upiId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please enter a valid UPI ID (e.g. user@okaxis)",
        path: ["upiId"],
      });
    }
  }
});

export type BankAccountValues = z.infer<typeof bankAccountSchema>;

interface BankAccount {
  id: string;
  accountName: string;
  accountNumber: string;
  ifscCode: string;
  bankName: string;
  isDefault: boolean;
  upiId?: string;
}

function getBankAccountDetailsText(acc: BankAccount): string {
  if (acc.bankName === "UPI") {
    return "Beneficiary: " + acc.accountName;
  }
  let baseText = acc.accountNumber + " • " + acc.ifscCode;
  if (acc.upiId) {
    baseText += " • UPI: " + acc.upiId;
  }
  return baseText;
}

interface BankAccountsResponse {
  accounts?: BankAccount[];
}

export default function BankAccountManager({
  onSelectAccount,
}: Readonly<{
  onSelectAccount?: (account: BankAccount) => void;
}>) {
  const [showForm, setShowForm] = useState(false);
  const [payoutType, setPayoutType] = useState<"bank" | "upi">("bank");
  const [newAccount, setNewAccount] = useState({
    accountName: "",
    accountNumber: "",
    ifscCode: "",
    bankName: "",
    upiId: "",
    isDefault: false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data, isLoading: loading, mutate: fetchAccounts } = useSWR<BankAccountsResponse>(
    "/api/wallet/bank-accounts",
    fetcher
  );

  const accounts: BankAccount[] = data?.accounts || [];

  const showNotice = (message: string, type: "success" | "error" = "success") => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 4000);
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    const validation = bankAccountSchema.safeParse({
      payoutType,
      accountName: newAccount.accountName,
      accountNumber: newAccount.accountNumber,
      ifscCode: newAccount.ifscCode,
      bankName: newAccount.bankName,
      upiId: newAccount.upiId,
    });

    if (!validation.success) {
      setIsSaving(false);
      showNotice(validation.error.issues[0]?.message || "Invalid bank account details", "error");
      return;
    }

    try {
      const payload = payoutType === "upi"
        ? {
            accountName: newAccount.accountName,
            upiId: newAccount.upiId,
            isDefault: newAccount.isDefault,
          }
        : {
            accountName: newAccount.accountName,
            accountNumber: newAccount.accountNumber,
            ifscCode: newAccount.ifscCode,
            bankName: newAccount.bankName,
            upiId: newAccount.upiId || undefined,
            isDefault: newAccount.isDefault,
          };

      const res = await fetch("/api/wallet/bank-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        fetchAccounts();
        setShowForm(false);
        setPayoutType("bank");
        setNewAccount({
          accountName: "",
          accountNumber: "",
          ifscCode: "",
          bankName: "",
          upiId: "",
          isDefault: false,
        });
        showNotice("Bank account added successfully!");
      } else {
        showNotice(data.error || "Failed to add account", "error");
      }
    } catch (error) {
      logger.error("[bank-account] Failed to add account:", error);
      showNotice("An error occurred", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const res = await fetch(`/api/wallet/bank-accounts?id=${id}`, {
        method: "PUT",
      });
      if (res.ok) {
        fetchAccounts();
        showNotice("Default bank account updated.");
      } else {
        const data = await res.json();
        showNotice(data.error || "Failed to set default", "error");
      }
    } catch {
      showNotice("An error occurred", "error");
    }
  };

  const handleDeleteRequest = (id: string) => {
    setDeleteConfirmId(id);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    try {
      const res = await fetch(`/api/wallet/bank-accounts?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchAccounts();
        showNotice("Account removed.");
      } else {
        showNotice("Failed to delete account", "error");
      }
    } catch (error) {
      logger.error("[bank-account] Failed to delete account:", error);
    }
  };

  if (loading) return <div className="loading"></div>;

  return (
    <div className="card">
      <div
        className="flex justify-between items-center mb-4"
      >
        <h3 className="text-lg font-bold">
          Saved Bank Accounts
        </h3>
        <Button
          variant="primary"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "Cancel" : "+ Add Account"}
        </Button>
      </div>

      {/* Inline notice */}
      {notice && (
        <div
          className="mb-3 text-sm font-semibold rounded-md" style={{ padding: "10px 14px", background: notice.type === "success" ? "rgba(16, 185, 129, 0.1)" : "rgba(244, 63, 94, 0.1)", color: notice.type === "success" ? "var(--color-accent-emerald)" : "var(--color-accent-rose)", border: `1px solid ${notice.type === "success" ? "rgba(16, 185, 129, 0.25)" : "rgba(244, 63, 94, 0.25)"}` }}
        >
          {notice.message}
        </div>
      )}

      {/* Inline delete confirmation */}
      {deleteConfirmId && (
        <div
          className="mb-3 rounded-md" style={{ padding: "12px 14px", background: "rgba(244, 63, 94, 0.08)", border: "1px solid rgba(244, 63, 94, 0.3)" }}
        >
          <p className="text-sm font-semibold text-rose" style={{ marginBottom: "10px" }}>
            ⚠️ Are you sure you want to delete this bank account? This cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button variant="danger" onClick={handleDeleteConfirm}>
              Yes, Delete
            </Button>
            <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleAddAccount}
          className="p-4 mb-5 bg-tertiary rounded-md"
        >
          <div className="mb-4 flex gap-4">
            <label className="flex items-center cursor-pointer text-sm font-semibold" style={{ gap: "6px" }}>
              <input
                type="radio"
                name="payoutType"
                checked={payoutType === "bank"}
                onChange={() => setPayoutType("bank")}
              />{" "}Bank Account
            </label>
            <label className="flex items-center cursor-pointer text-sm font-semibold" style={{ gap: "6px" }}>
              <input
                type="radio"
                name="payoutType"
                checked={payoutType === "upi"}
                onChange={() => setPayoutType("upi")}
              />{" "}UPI ID
            </label>
          </div>

          <div className="grid-2">
            <Input
              id="bank-holder-name-input"
              label="Account Holder Name"
              required
              value={newAccount.accountName}
              onChange={(e) =>
                setNewAccount({ ...newAccount, accountName: e.target.value })
              }
              fullWidth
            />
            {payoutType === "bank" ? (
              <>
                <Input
                  id="bank-name-input"
                  label="Bank Name"
                  required
                  value={newAccount.bankName}
                  onChange={(e) =>
                    setNewAccount({ ...newAccount, bankName: e.target.value })
                  }
                  fullWidth
                />
                <Input
                  id="bank-account-number-input"
                  label="Account Number"
                  required
                  value={newAccount.accountNumber}
                  onChange={(e) =>
                    setNewAccount({
                      ...newAccount,
                      accountNumber: e.target.value,
                    })
                  }
                  fullWidth
                />
                <Input
                  id="bank-ifsc-code-input"
                  label="IFSC Code"
                  required
                  value={newAccount.ifscCode}
                  onChange={(e) =>
                    setNewAccount({
                      ...newAccount,
                      ifscCode: e.target.value.toUpperCase(),
                    })
                  }
                  fullWidth
                />
                <Input
                  id="bank-upi-id-optional-input"
                  label="UPI ID (Optional)"
                  value={newAccount.upiId}
                  onChange={(e) =>
                    setNewAccount({ ...newAccount, upiId: e.target.value })
                  }
                  fullWidth
                />
              </>
            ) : (
              <Input
                id="bank-upi-id-input"
                label="UPI ID"
                required
                placeholder="username@bank"
                value={newAccount.upiId}
                onChange={(e) =>
                  setNewAccount({ ...newAccount, upiId: e.target.value })
                }
                fullWidth
              />
            )}
            <div className="flex items-center gap-2" style={{ paddingTop: "22px" }}>
              <input
                type="checkbox"
                id="bank-is-default"
                checked={newAccount.isDefault}
                onChange={(e) =>
                  setNewAccount({ ...newAccount, isDefault: e.target.checked })
                }
              />
              <label htmlFor="bank-is-default" className="text-sm font-semibold cursor-pointer">
                Set as default payout method
              </label>
            </div>
          </div>
          <div
            className="mt-4 flex justify-end"
          >
            <Button
              type="submit"
              variant="primary"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save Account"}
            </Button>
          </div>
        </form>
      )}

      <div className="flex flex-col gap-3">
        {accounts.length === 0 && !showForm && (
          <EmptyState emoji="🏦" title="No Bank Accounts" description="Add a bank account to enable withdrawals." compact />
        )}
        {accounts.map((acc) => (
          <div
            key={acc.id}
            className="p-4 flex justify-between items-center rounded-md" style={{ border: acc.isDefault
                ? "1px solid rgba(99, 102, 241, 0.5)"
                : "1px solid var(--color-border)", background: acc.isDefault
                ? "rgba(99, 102, 241, 0.05)"
                : "transparent" }}
          >
            <div>
              <div className="font-semibold flex items-center gap-2">
                {acc.bankName === "UPI" ? `UPI: ${acc.upiId}` : `${acc.bankName} — ${acc.accountName}`}
                {acc.isDefault && (
                  <span className="font-extrabold text-xs" style={{ padding: "2px 8px", borderRadius: "999px", background: "rgba(99, 102, 241, 0.15)", color: "var(--color-accent-indigo)" }}>
                    Default
                  </span>
                )}
              </div>
              <div
                className="text-sm text-secondary"
              >
                {getBankAccountDetailsText(acc)}
              </div>
            </div>
            <div className="flex gap-2">
              {onSelectAccount && (
                <Button
                  variant="secondary"
                  aria-label={`Select ${acc.bankName === "UPI" ? `UPI: ${acc.upiId}` : `${acc.bankName} — ${acc.accountName}`}`}
                  onClick={() => onSelectAccount(acc)}
                >
                  Select
                </Button>
              )}
              {!acc.isDefault && (
                <Button
                  variant="ghost"
                  aria-label={`Set ${acc.bankName === "UPI" ? `UPI: ${acc.upiId}` : acc.bankName} as default`}
                  onClick={() => handleSetDefault(acc.id)}
                  className="text-xs"
                >
                  Set Default
                </Button>
              )}
              <Button
                variant="ghost"
                aria-label={`Delete ${acc.bankName === "UPI" ? `UPI: ${acc.upiId}` : `${acc.bankName} — ${acc.accountName}`}`}
                onClick={() => handleDeleteRequest(acc.id)}
                className="text-rose"
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
