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
  const [newAccount, setNewAccount] = useState({
    accountName: "",
    accountNumber: "",
    ifscCode: "",
    bankName: "",
    upiId: "",
    isDefault: false,
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wallet/bank-accounts");
      const data = await res.json();
      if (data.accounts) {
        setAccounts(data.accounts);
      }
    } catch (error) {
      console.error("Failed to fetch accounts", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch("/api/wallet/bank-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAccount),
      });
      const data = await res.json();
      if (res.ok) {
        setAccounts((prev) => [data.account, ...prev]);
        setShowForm(false);
        setNewAccount({
          accountName: "",
          accountNumber: "",
          ifscCode: "",
          bankName: "",
          upiId: "",
          isDefault: false,
        });
        alert("Bank account added successfully!");
      } else {
        alert(data.error || "Failed to add account");
      }
    } catch (error) {
      console.error(error);
      alert("An error occurred");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this account?")) return;
    try {
      const res = await fetch(`/api/wallet/bank-accounts?id=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setAccounts((prev) => prev.filter((a) => a.id !== id));
      } else {
        alert("Failed to delete account");
      }
    } catch (error) {
      console.error(error);
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
              border: "1px solid var(--color-border)",
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
              <div style={{ fontWeight: 600 }}>
                {acc.bankName} - {acc.accountName}
              </div>
              <div
                style={{
                  fontSize: "13px",
                  color: "var(--color-text-secondary)",
                }}
              >
                {acc.accountNumber} • {acc.ifscCode}
                {acc.upiId && <span> • UPI: {acc.upiId}</span>}
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
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleDelete(acc.id)}
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
