import { useState, useEffect } from "react";

interface BankAccount {
  id: string;
  accountName: string;
  accountNumber: string;
  ifscCode: string;
  bankName: string;
  isDefault: boolean;
  upiId?: string;
}

export default function BankAccountManager({
  onSelectAccount,
}: {
  onSelectAccount?: (account: BankAccount) => void;
}) {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    fetchAccounts();
  }, []);

  const showNotice = (message: string, type: "success" | "error" = "success") => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 4000);
  };

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wallet/bank-accounts");
      const data = await res.json();
      if (data.accounts) {
        setAccounts(data.accounts);
      }
    } catch (error) {
      console.error("[bank-account] Failed to fetch accounts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
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
        setAccounts((prev) => [data.account, ...prev]);
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
      console.error("[bank-account] Failed to add account:", error);
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
        setAccounts((prev) =>
          prev.map((a) => ({ ...a, isDefault: a.id === id }))
        );
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
        setAccounts((prev) => prev.filter((a) => a.id !== id));
        showNotice("Account removed.");
      } else {
        showNotice("Failed to delete account", "error");
      }
    } catch (error) {
      console.error("[bank-account] Failed to delete account:", error);
    }
  };

  if (loading) return <div className="loading"></div>;

  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <h3 style={{ fontSize: "18px", fontWeight: 700 }}>
          Saved Bank Accounts
        </h3>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? "Cancel" : "+ Add Account"}
        </button>
      </div>

      {/* Inline notice */}
      {notice && (
        <div
          style={{
            marginBottom: "12px",
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            fontSize: "13px",
            fontWeight: 600,
            background: notice.type === "success" ? "rgba(16, 185, 129, 0.1)" : "rgba(244, 63, 94, 0.1)",
            color: notice.type === "success" ? "var(--color-accent-emerald)" : "var(--color-accent-rose)",
            border: `1px solid ${notice.type === "success" ? "rgba(16, 185, 129, 0.25)" : "rgba(244, 63, 94, 0.25)"}`,
          }}
        >
          {notice.message}
        </div>
      )}

      {/* Inline delete confirmation */}
      {deleteConfirmId && (
        <div
          style={{
            marginBottom: "12px",
            padding: "12px 14px",
            borderRadius: "var(--radius-md)",
            background: "rgba(244, 63, 94, 0.08)",
            border: "1px solid rgba(244, 63, 94, 0.3)",
          }}
        >
          <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-accent-rose)", marginBottom: "10px" }}>
            ⚠️ Are you sure you want to delete this bank account? This cannot be undone.
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="btn btn-danger btn-sm" onClick={handleDeleteConfirm}>
              Yes, Delete
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleAddAccount}
          style={{
            background: "var(--color-bg-tertiary)",
            padding: "16px",
            borderRadius: "8px",
            marginBottom: "20px",
          }}
        >
          <div style={{ marginBottom: "16px", display: "flex", gap: "16px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "14px", fontWeight: 600 }}>
              <input
                type="radio"
                name="payoutType"
                checked={payoutType === "bank"}
                onChange={() => setPayoutType("bank")}
              />
              Bank Account
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "14px", fontWeight: 600 }}>
              <input
                type="radio"
                name="payoutType"
                checked={payoutType === "upi"}
                onChange={() => setPayoutType("upi")}
              />
              UPI ID
            </label>
          </div>

          <div className="grid-2">
            <div>
              <label className="label">Account Holder Name</label>
              <input
                className="input"
                required
                value={newAccount.accountName}
                onChange={(e) =>
                  setNewAccount({ ...newAccount, accountName: e.target.value })
                }
              />
            </div>
            {payoutType === "bank" ? (
              <>
                <div>
                  <label className="label">Bank Name</label>
                  <input
                    className="input"
                    required
                    value={newAccount.bankName}
                    onChange={(e) =>
                      setNewAccount({ ...newAccount, bankName: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="label">Account Number</label>
                  <input
                    className="input"
                    required
                    value={newAccount.accountNumber}
                    onChange={(e) =>
                      setNewAccount({
                        ...newAccount,
                        accountNumber: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="label">IFSC Code</label>
                  <input
                    className="input"
                    required
                    value={newAccount.ifscCode}
                    onChange={(e) =>
                      setNewAccount({
                        ...newAccount,
                        ifscCode: e.target.value.toUpperCase(),
                      })
                    }
                  />
                </div>
                <div>
                  <label className="label">UPI ID (Optional)</label>
                  <input
                    className="input"
                    value={newAccount.upiId}
                    onChange={(e) =>
                      setNewAccount({ ...newAccount, upiId: e.target.value })
                    }
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="label">UPI ID</label>
                <input
                  className="input"
                  required
                  placeholder="username@bank"
                  value={newAccount.upiId}
                  onChange={(e) =>
                    setNewAccount({ ...newAccount, upiId: e.target.value })
                  }
                />
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingTop: "22px" }}>
              <input
                type="checkbox"
                id="bank-is-default"
                checked={newAccount.isDefault}
                onChange={(e) =>
                  setNewAccount({ ...newAccount, isDefault: e.target.checked })
                }
              />
              <label htmlFor="bank-is-default" style={{ fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                Set as default payout method
              </label>
            </div>
          </div>
          <div
            style={{
              marginTop: "16px",
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save Account"}
            </button>
          </div>
        </form>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {accounts.length === 0 && !showForm && (
          <div
            style={{
              padding: "20px",
              textAlign: "center",
              color: "var(--color-text-secondary)",
            }}
          >
            No saved bank accounts.
          </div>
        )}
        {accounts.map((acc) => (
          <div
            key={acc.id}
            style={{
              padding: "16px",
              border: acc.isDefault
                ? "1px solid rgba(99, 102, 241, 0.5)"
                : "1px solid var(--color-border)",
              borderRadius: "8px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: acc.isDefault
                ? "rgba(99, 102, 241, 0.05)"
                : "transparent",
            }}
          >
            <div>
              <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                {acc.bankName === "UPI" ? `UPI: ${acc.upiId}` : `${acc.bankName} — ${acc.accountName}`}
                {acc.isDefault && (
                  <span style={{ fontSize: "11px", fontWeight: 800, padding: "2px 8px", borderRadius: "999px", background: "rgba(99, 102, 241, 0.15)", color: "var(--color-accent-indigo)" }}>
                    Default
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--color-text-secondary)",
                }}
              >
                {acc.bankName === "UPI" ? `Beneficiary: ${acc.accountName}` : `${acc.accountNumber} • ${acc.ifscCode}${acc.upiId ? ` • UPI: ${acc.upiId}` : ""}`}
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              {onSelectAccount && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => onSelectAccount(acc)}
                >
                  Select
                </button>
              )}
              {!acc.isDefault && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleSetDefault(acc.id)}
                  style={{ fontSize: "12px" }}
                >
                  Set Default
                </button>
              )}
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleDeleteRequest(acc.id)}
                style={{ color: "var(--color-accent-rose)" }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
