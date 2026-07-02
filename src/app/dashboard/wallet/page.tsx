"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import BankAccountManager from "@/components/dashboard/wallet/BankAccountManager";
import TransactionHistory from "@/components/dashboard/wallet/TransactionHistory";
import { useTokenRefreshGuard } from "@/hooks/useTokenRefreshGuard";
import { formatCurrency } from "@/lib/utils-client";

interface WalletData {
  balance: number;
  pendingBalance: number;
  totalEarned: number;
  totalWithdrawn: number;
  totalHeld?: number;
  totalSpent?: number;
  totalDeposited?: number;
}

interface SelectedBankAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  upiId?: string;
}

const loadRazorpay = () => {
  return new Promise<boolean>((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const existingScript = document.getElementById(
      "razorpay-checkout-sdk",
    ) as HTMLScriptElement | null;

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(true), {
        once: true,
      });
      existingScript.addEventListener("error", () => resolve(false), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.id = "razorpay-checkout-sdk";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export default function WalletPage() {
  const { data: session, status } = useSession();
  const { requireFreshSession } = useTokenRefreshGuard();
  const [activeTab, setActiveTab] = useState("overview");

  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showAddFundsModal, setShowAddFundsModal] = useState(false);

  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [userType, setUserType] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<SelectedBankAccount | null>(null);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const [toasts, setToasts] = useState<Array<{id: number; type: "success" | "error" | "info"; message: string}>>([]);
  const showToast = (type: "success" | "error" | "info", message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  };

  const fetchWalletData = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || data?.error || "Failed to fetch wallet");
      }

      const wallet = data.wallet || data.data;
      if (wallet) {
        setWalletData({
          balance: Number(wallet.balance || 0),
          pendingBalance: Number(wallet.pendingBalance || 0),
          totalEarned: Number(wallet.totalEarned || 0),
          totalWithdrawn: Number(wallet.totalWithdrawn || 0),
          totalHeld: Number(wallet.totalHeld || 0),
          totalSpent: Number(wallet.totalSpent || 0),
          totalDeposited: Number(wallet.totalDeposited || 0),
        });
        setUserType(data.userType || session?.user?.userType || null);
      }
    } catch (error) {
      console.error("[wallet-page] Failed to fetch wallet data:", error);
      setWalletData(null);
    } finally {
      setIsLoading(false);
    }
  }, [session?.user]);

  useEffect(() => {
    fetchWalletData();
  }, [fetchWalletData]);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    const fresh = await requireFreshSession();
    if (!fresh) return;

    if (!selectedAccount) {
      showToast("error", "Please select a bank account");
      return;
    }

    const withdrawRupees = Number(withdrawAmount);
    if (!Number.isFinite(withdrawRupees) || withdrawRupees < 500) {
      showToast("error", "Minimum withdrawal amount is INR 500.");
      return;
    }

    const withdrawPaise = Math.round(withdrawRupees * 100);
    if (!walletData || withdrawPaise > walletData.balance) {
      showToast("error", "Withdrawal amount exceeds available balance.");
      return;
    }

    setIsWithdrawing(true);
    try {
      const res = await fetch("/api/payments/withdraw", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          amount: withdrawPaise,
          bankAccountId: selectedAccount.id,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || data?.error || "Withdrawal failed");
      }

      showToast("success", data?.message || "Withdrawal initiated successfully.");
      setShowWithdrawModal(false);
      setWithdrawAmount("");
      setSelectedAccount(null);
      fetchWalletData();
    } catch (error: unknown) {
      showToast("error", (error instanceof Error ? (error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error)) : String(error)) || "Withdrawal failed");
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleAddFunds = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const amountInput = form.elements.namedItem("amount") as HTMLInputElement;
    const amount = amountInput.value;

    if (!amount) return;
    if (!Number.isFinite(Number(amount)) || Number(amount) < 100) {
      showToast("error", "Minimum add-funds amount is INR 100.");
      return;
    }

    try {
      const sdkLoaded = await loadRazorpay();
      if (!sdkLoaded) {
        showToast("error", "Razorpay SDK failed to load");
        return;
      }

      const response = await fetch("/api/wallet/add-funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || data?.error || "Failed to create order");
      }

      const options = {
        key: data.key,
        amount: data.amount,
        currency: data.currency,
        name: "Decisional",
        description: "Add funds to wallet",
        order_id: data.orderId,
        handler: async function (paymentResponse: { razorpay_payment_id?: string; razorpay_order_id?: string; razorpay_signature?: string }) {
          try {
            const verifyRes = await fetch("/api/wallet/add-funds/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_payment_id: paymentResponse.razorpay_payment_id,
                razorpay_order_id: paymentResponse.razorpay_order_id,
                razorpay_signature: paymentResponse.razorpay_signature,
              }),
            });
            const verifyData = await verifyRes.json();
            if (verifyData.success) {
              showToast("success", "Funds added successfully.");
              setShowAddFundsModal(false);
              fetchWalletData();
            } else {
              showToast("error", "Payment verification failed. Please contact support.");
            }
          } catch (verifyError: unknown) {
            showToast("error", (verifyError instanceof Error ? (verifyError instanceof Error ? (verifyError instanceof Error ? verifyError.message : String(verifyError)) : String(verifyError)) : String(verifyError)) || "Verification error");
          }
        },
        theme: { color: "#6366f1" },
      };

      const RazorpayConstructor = window.Razorpay;
      const paymentObject = new RazorpayConstructor(options);
      paymentObject.open();
    } catch (error: unknown) {
      showToast("error", (error instanceof Error ? (error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error)) : String(error)) || "Payment failed");
    }
  };

  const handleDownloadCSV = async () => {
    try {
      const res = await fetch("/api/wallet/transactions?format=csv");
      if (!res.ok) throw new Error("Failed to download CSV");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `decisional-transactions-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      showToast("success", "CSV downloaded successfully");
    } catch (_error) {
      showToast("error", "Failed to download CSV");
    }
  };

  const handleDownloadIncomeReport = async () => {
    try {
      const res = await fetch("/api/reports/influencer/income?format=csv");
      if (!res.ok) throw new Error("Failed to download income report");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `decisional-income-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      showToast("success", "Income report downloaded successfully");
    } catch (_error) {
      showToast("error", "Failed to download income report");
    }
  };

  const handleDownloadSpendReport = async () => {
    try {
      const res = await fetch("/api/reports/brand/spend?format=csv");
      if (!res.ok) throw new Error("Failed to download spend report");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `decisional-spend-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      showToast("success", "Spend report downloaded successfully");
    } catch (_error) {
      showToast("error", "Failed to download spend report");
    }
  };

  if (status === "loading" || isLoading) {
    return (
      <DashboardShell user={session?.user || null}>
        <div style={{ display: "flex", minHeight: "60vh", alignItems: "center", justifyContent: "center" }}>
          <span className="loading" />
        </div>
      </DashboardShell>
    );
  }

  if (!session) {
    return <div className="p-8 text-center">Unauthorized</div>;
  }

  if (!walletData) {
    return <div className="p-8 text-center">Failed to load wallet data</div>;
  }

  return (
    <DashboardShell user={session.user}>
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
      <div className="animate-fade-in">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "32px",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "32px",
                fontWeight: 800,
                background: "var(--gradient-primary)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Wallet and Payments
            </h1>
            <p style={{ color: "var(--color-text-secondary)" }}>
              Manage earnings, transactions, and payouts.
            </p>
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            {userType === "BRAND" && (
              <button className="btn btn-secondary" onClick={() => setShowAddFundsModal(true)}>
                Add Funds
              </button>
            )}
            {userType === "INFLUENCER" && (
              <button
                className="btn btn-primary"
                onClick={() => setShowWithdrawModal(true)}
                disabled={walletData.balance < 50000}
              >
                Withdraw
              </button>
            )}
            <button className="btn btn-ghost" onClick={handleDownloadCSV}>
              Download Transactions
            </button>
            {userType === "INFLUENCER" && (
              <button className="btn btn-ghost" onClick={handleDownloadIncomeReport}>
                Income Report (ITR)
              </button>
            )}
            {userType === "BRAND" && (
              <button className="btn btn-ghost" onClick={handleDownloadSpendReport}>
                Spend Report (GST)
              </button>
            )}
          </div>
        </div>

        <div className="grid-4" style={{ marginBottom: "40px" }}>
          <div className="card" style={{ background: "var(--gradient-primary)", border: "none" }}>
            <div style={{ fontSize: "14px", opacity: 0.9, marginBottom: "8px" }}>Available Balance</div>
            <div style={{ fontSize: "32px", fontWeight: 800 }}>{formatCurrency(walletData.balance)}</div>
          </div>

          <div className="card">
            <div style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
              {userType === "BRAND" ? "Active Holds" : "Pending"}
            </div>
            <div style={{ fontSize: "28px", fontWeight: 800, color: "var(--color-accent-amber)" }}>
              {formatCurrency(userType === "BRAND" ? walletData.totalHeld || 0 : walletData.pendingBalance)}
            </div>
          </div>

          <div className="card">
            <div style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
              {userType === "BRAND" ? "Total Spent" : "Total Earned"}
            </div>
            <div style={{ fontSize: "28px", fontWeight: 800, color: "var(--color-accent-emerald)" }}>
              {formatCurrency(userType === "BRAND" ? walletData.totalSpent || 0 : walletData.totalEarned)}
            </div>
          </div>

          <div className="card">
            <div style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
              {userType === "BRAND" ? "Total Added" : "Total Withdrawn"}
            </div>
            <div style={{ fontSize: "28px", fontWeight: 800 }}>
              {formatCurrency(userType === "BRAND" ? walletData.totalDeposited || 0 : walletData.totalWithdrawn)}
            </div>
          </div>
        </div>

        <div
          className="scrollable-tabs"
          style={{
            borderBottom: "1px solid var(--color-border)",
            marginBottom: "24px",
            display: "flex",
            gap: "24px",
          }}
        >
          {[
            "overview",
            "transactions",
            ...(userType === "INFLUENCER" ? ["accounts"] : ["payment-methods"]),
          ].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "12px 0",
                background: "none",
                border: "none",
                borderBottom:
                  activeTab === tab
                    ? "2px solid var(--color-primary)"
                    : "2px solid transparent",
                color:
                  activeTab === tab
                    ? "var(--color-primary)"
                    : "var(--color-text-secondary)",
                fontWeight: activeTab === tab ? 700 : 500,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {tab === "accounts"
                ? "Bank Accounts"
                : tab === "payment-methods"
                  ? "Payment Methods"
                  : tab}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <div className="card">
            <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "16px" }}>
              Recent Transactions
            </h3>
            <TransactionHistory />
          </div>
        )}

        {activeTab === "transactions" && <TransactionHistory />}

        {activeTab === "accounts" && (
          <div style={{ maxWidth: "800px" }}>
            <BankAccountManager />
          </div>
        )}

        {activeTab === "payment-methods" && (
          <div style={{ maxWidth: "800px" }}>
            <div className="card">
              <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>
                Payment Methods
              </h3>
              <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
                You can save methods through Razorpay checkout for faster top-ups.
              </p>
            </div>
          </div>
        )}
      </div>

      {showWithdrawModal && (
        <div className="modal-overlay">
          <div className="card" style={{ width: "100%", maxWidth: "500px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "24px" }}>
              Request Withdrawal
            </h2>

            <div className="mb-6 p-4 bg-[var(--color-bg-tertiary)] rounded-lg">
              <span className="text-sm text-[var(--color-text-secondary)]">Available Balance</span>
              <div className="text-2xl font-bold gradient-text">{formatCurrency(walletData.balance)}</div>
            </div>

            <form onSubmit={handleWithdraw}>
              <div className="mb-4">
                <label className="label">Amount (INR)</label>
                <input
                  type="number"
                  className="input"
                  min="500"
                  max={walletData.balance / 100}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  required
                  placeholder="Minimum 500"
                />
              </div>

              <div className="mb-6">
                <label className="label">Select Bank Account</label>
                {selectedAccount ? (
                  <div className="p-3 border border-[var(--color-primary)] rounded-lg flex justify-between items-center bg-[var(--color-bg-secondary)]">
                    <div>
                      <div className="font-bold">
                        {selectedAccount.bankName === "UPI" ? "UPI Account" : selectedAccount.bankName}
                      </div>
                      <div className="text-xs text-[var(--color-text-secondary)]">
                        {selectedAccount.bankName === "UPI"
                          ? selectedAccount.upiId
                          : `**** ${(selectedAccount.accountNumber || "----").slice(-4)}`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedAccount(null)}
                      className="text-xs text-[var(--color-accent-rose)]"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="border border-[var(--color-border)] rounded-lg p-4">
                    <div className="mb-4 text-sm text-[var(--color-text-secondary)]">
                      Select a saved account to receive funds:
                    </div>
                    <BankAccountManager
                      onSelectAccount={(acc) => setSelectedAccount(acc as SelectedBankAccount)}
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowWithdrawModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!selectedAccount || !withdrawAmount || isWithdrawing}
                >
                  {isWithdrawing ? "Processing..." : "Withdraw Funds"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddFundsModal && (
        <div className="modal-overlay">
          <div className="card" style={{ width: "100%", maxWidth: "400px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "24px" }}>
              Add Funds
            </h2>
            <form onSubmit={handleAddFunds}>
              <div className="mb-6">
                <label className="label">Amount (INR)</label>
                <input
                  name="amount"
                  type="number"
                  className="input"
                  min="100"
                  required
                  placeholder="Enter amount"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowAddFundsModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Proceed to Pay
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(10, 10, 20, 0.75);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 20px;
        }
      `}</style>
    </DashboardShell>
  );
}
