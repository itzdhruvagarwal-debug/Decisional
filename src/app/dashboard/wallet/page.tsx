"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import BankAccountManager from "@/components/dashboard/wallet/BankAccountManager";
import TransactionHistory from "@/components/dashboard/wallet/TransactionHistory";

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
}

function formatCurrency(paise: number): string {
  if (!Number.isFinite(paise)) return "INR 0";
  const rupees = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees);
}

const loadRazorpay = () => {
  return new Promise<boolean>((resolve) => {
    if ((window as any).Razorpay) {
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
  const [activeTab, setActiveTab] = useState("overview");

  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showAddFundsModal, setShowAddFundsModal] = useState(false);

  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [userType, setUserType] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<SelectedBankAccount | null>(null);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

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
        setUserType(data.userType || (session?.user as any)?.userType || null);
      }
    } catch (error) {
      console.error("Failed to fetch wallet data", error);
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
    if (!selectedAccount) {
      alert("Please select a bank account");
      return;
    }

    const withdrawRupees = Number(withdrawAmount);
    if (!Number.isFinite(withdrawRupees) || withdrawRupees < 500) {
      alert("Minimum withdrawal amount is INR 500.");
      return;
    }

    const withdrawPaise = Math.round(withdrawRupees * 100);
    if (!walletData || withdrawPaise > walletData.balance) {
      alert("Withdrawal amount exceeds available balance.");
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

      alert(data?.message || "Withdrawal initiated successfully.");
      setShowWithdrawModal(false);
      setWithdrawAmount("");
      setSelectedAccount(null);
      fetchWalletData();
    } catch (error: any) {
      alert(error?.message || "Withdrawal failed");
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
      alert("Minimum add-funds amount is INR 100.");
      return;
    }

    try {
      const sdkLoaded = await loadRazorpay();
      if (!sdkLoaded) {
        alert("Razorpay SDK failed to load");
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
        handler: async function (paymentResponse: any) {
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
              alert("Funds added successfully.");
              setShowAddFundsModal(false);
              fetchWalletData();
            } else {
              alert("Payment verification failed. Please contact support.");
            }
          } catch (verifyError: any) {
            alert(verifyError?.message || "Verification error");
          }
        },
        theme: { color: "#6366f1" },
      };

      const RazorpayConstructor = (window as any).Razorpay;
      const paymentObject = new RazorpayConstructor(options);
      paymentObject.open();
    } catch (error: any) {
      alert(error?.message || "Payment failed");
    }
  };

  if (status === "loading" || isLoading) {
    return <div className="loading" />;
  }

  if (!session) {
    return <div className="p-8 text-center">Unauthorized</div>;
  }

  if (!walletData) {
    return <div className="p-8 text-center">Failed to load wallet data</div>;
  }

  return (
    <DashboardShell user={session.user}>
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
                      <div className="font-bold">{selectedAccount.bankName}</div>
                      <div className="text-xs text-[var(--color-text-secondary)]">
                        **** {(selectedAccount.accountNumber || "----").slice(-4)}
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
          background: rgba(0, 0, 0, 0.8);
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
