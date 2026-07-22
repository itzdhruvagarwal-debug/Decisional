"use client";


import { logger } from "@/lib/logger-client";
import { useState, useMemo } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import BankAccountManager from "@/components/dashboard/wallet/BankAccountManager";
import TransactionHistory from "@/components/dashboard/wallet/TransactionHistory";
import { useTokenRefreshGuard } from "@/hooks/useTokenRefreshGuard";
import { formatCurrency } from "@/lib/utils-client";
import PeriodPickerModal, { type PeriodValue } from "@/components/dashboard/wallet/PeriodPickerModal";
import { ToastContainer, type ToastItem, type ToastType } from "@/components/ui/toast";
import { Button, Input } from "@/components/ui";
import { withdrawSchema } from "@/lib/validations/auth";

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



function getTabLabel(tab: string): string {
  if (tab === "accounts") return "Bank Accounts";
  if (tab === "payment-methods") return "Payment Methods";
  return tab;
}

async function verifyRazorpayPayment(
  paymentResponse: { razorpay_payment_id?: string; razorpay_order_id?: string; razorpay_signature?: string },
  showToast: (type: ToastType, message: string) => void,
  onSuccess: () => void,
) {
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
      onSuccess();
    } else {
      showToast("error", "Payment verification failed. Please contact support.");
    }
  } catch (verifyError: unknown) {
    showToast("error", (verifyError instanceof Error ? verifyError.message : String(verifyError)) || "Verification error");
  }
}

async function extractDownloadError(res: Response): Promise<string> {
  const errText = await res.text();
  try {
    const d = JSON.parse(errText);
    if (d?.message) return d.message;
  } catch {}
  return `Download failed (${res.status})`;
}

function useWallet(session: ReturnType<typeof useSession>["data"], requireFreshSession: () => Promise<boolean>) {
  const [activeTab, setActiveTab] = useState("overview");

  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showAddFundsModal, setShowAddFundsModal] = useState(false);

  const { data, isLoading, mutate: fetchWalletData } = useSWR<{
    wallet?: WalletData;
    data?: WalletData;
    userType?: string;
  }>(
    session ? "/api/wallet" : null,
    fetcher
  );

  const walletData: WalletData | null = useMemo(() => {
    const wallet = data?.wallet || data?.data;
    if (!wallet) return null;
    return {
      balance: Number(wallet.balance || 0),
      pendingBalance: Number(wallet.pendingBalance || 0),
      totalEarned: Number(wallet.totalEarned || 0),
      totalWithdrawn: Number(wallet.totalWithdrawn || 0),
      totalHeld: Number(wallet.totalHeld || 0),
      totalSpent: Number(wallet.totalSpent || 0),
      totalDeposited: Number(wallet.totalDeposited || 0),
    };
  }, [data]);

  const userType = data?.userType || session?.user?.userType || null;

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<SelectedBankAccount | null>(null);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const handleRemoveToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };
  const showToast = (type: ToastType, message: string) => {
    const id = String(Date.now());
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => handleRemoveToast(id), 5000);
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    const fresh = await requireFreshSession();
    if (!fresh) return;

    if (!selectedAccount) {
      showToast("error", "Please select a bank account");
      return;
    }

    const withdrawRupees = Number(withdrawAmount);
    const validation = withdrawSchema.safeParse({ amount: withdrawRupees });
    if (!validation.success) {
      showToast("error", validation.error.issues[0]?.message || "Invalid withdrawal amount.");
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
      showToast("error", (error instanceof Error ? error.message : String(error)) || "Withdrawal failed");
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
          await verifyRazorpayPayment(paymentResponse, showToast, () => {
            setShowAddFundsModal(false);
            fetchWalletData();
          });
        },
        theme: { color: "#6366f1" },
      };

      const RazorpayConstructor = window.Razorpay;
      const paymentObject = new RazorpayConstructor(options);
      paymentObject.open();
    } catch (error: unknown) {
      showToast("error", (error instanceof Error ? error.message : String(error)) || "Payment failed");
    }
  };

  const [isDownloading, setIsDownloading] = useState<Record<string, boolean>>({});

  // ── Period picker modal state ────────────────────────────────────────────
  type ModalConfig = { key: string; title: string; icon: string; type: "transactions" | "report"; urlBase: string; fallback: string; };
  const [activePicker, setActivePicker] = useState<ModalConfig | null>(null);

  const openPicker = (cfg: ModalConfig) => setActivePicker(cfg);
  const closePicker = () => setActivePicker(null);

  const downloadCsv = async (url: string, key: string, fallbackFilename: string) => {
    setIsDownloading(prev => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const msg = await extractDownloadError(res);
        throw new Error(msg);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") || "";
      const match = /filename="?([^";\n]+)"?/.exec(disposition);
      const filename = match?.[1]?.trim() ?? fallbackFilename;

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.style.position = "fixed";
      a.style.left = "-9999px";
      a.style.top = "-9999px";
      document.body.appendChild(a);
      a.click();
      // Delay revoke so browser has time to start the download
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
        a.remove();
      }, 5000);

      showToast("success", `✓ ${filename} downloaded`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Download failed";
      showToast("error", msg);
      logger.error("[download]", err instanceof Error ? err : String(err));
    } finally {
      setIsDownloading(prev => ({ ...prev, [key]: false }));
    }
  };

  const handlePeriodConfirm = (period: PeriodValue) => {
    if (!activePicker) return;
    const { key, urlBase, fallback, type } = activePicker;
    const params = new URLSearchParams({ format: "csv" });
    if (type === "report" && period.fy) {
      params.set("fy", period.fy);
    } else {
      if (period.startDate) params.set("startDate", period.startDate);
      if (period.endDate)   params.set("endDate",   period.endDate);
    }
    closePicker();
    downloadCsv(`${urlBase}?${params.toString()}`, key, fallback);
  };

  const handleDownloadCSV = () => openPicker({
    key: "txn", type: "transactions", icon: "⬇",
    title: "Download Transactions",
    urlBase: "/api/wallet/transactions",
    fallback: "transactions.csv",
  });

  const handleDownloadIncomeReport = () => openPicker({
    key: "income", type: "report", icon: "📄",
    title: "Income Report (ITR)",
    urlBase: "/api/reports/influencer/income",
    fallback: "income-report.csv",
  });

  const handleDownloadSpendReport = () => openPicker({
    key: "spend", type: "report", icon: "📊",
    title: "Spend Report (GST)",
    urlBase: "/api/reports/brand/spend",
    fallback: "spend-report.csv",
  });

  return {
    activeTab,
    setActiveTab,
    showWithdrawModal,
    setShowWithdrawModal,
    showAddFundsModal,
    setShowAddFundsModal,
    walletData,
    userType,
    isLoading,
    withdrawAmount,
    setWithdrawAmount,
    selectedAccount,
    setSelectedAccount,
    isWithdrawing,
    toasts,
    handleRemoveToast,
    showToast,
    fetchWalletData,
    handleWithdraw,
    handleAddFunds,
    isDownloading,
    activePicker,
    openPicker,
    closePicker,
    downloadCsv,
    handlePeriodConfirm,
    handleDownloadCSV,
    handleDownloadIncomeReport,
    handleDownloadSpendReport,
  };
}

interface WalletHeaderProps {
  readonly userType: string | null | undefined;
  readonly balance: number;
  readonly isDownloading: Record<string, boolean | undefined>;
  readonly setShowWithdrawModal: (show: boolean) => void;
  readonly setShowAddFundsModal: (show: boolean) => void;
  readonly handleDownloadCSV: () => void;
  readonly handleDownloadIncomeReport: () => void;
  readonly handleDownloadSpendReport: () => void;
}

function WalletHeader({
  userType,
  balance,
  isDownloading,
  setShowWithdrawModal,
  setShowAddFundsModal,
  handleDownloadCSV,
  handleDownloadIncomeReport,
  handleDownloadSpendReport,
}: WalletHeaderProps) {
  return (
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
          <Button variant="secondary" aria-label="Add funds to wallet" onClick={() => setShowAddFundsModal(true)}>
            Add Funds
          </Button>
        )}
        {userType === "INFLUENCER" && (
          <Button
            variant="primary"
            aria-label={balance < 50000 ? "Withdraw (minimum balance not met)" : "Withdraw funds"}
            onClick={() => setShowWithdrawModal(true)}
            disabled={balance < 50000}
          >
            Withdraw
          </Button>
        )}
        <Button
          variant="ghost"
          aria-label={isDownloading["txn"] ? "Downloading transactions" : "Download transactions as CSV"}
          onClick={handleDownloadCSV}
          disabled={!!isDownloading["txn"]}
          style={{ opacity: isDownloading["txn"] ? 0.7 : 1 }}
        >
          {isDownloading["txn"] ? "⏳ Downloading…" : "⬇ Download Transactions"}
        </Button>
        {userType === "INFLUENCER" && (
          <Button
            variant="ghost"
            aria-label={isDownloading["income"] ? "Downloading income report" : "Download income report for ITR"}
            onClick={handleDownloadIncomeReport}
            disabled={!!isDownloading["income"]}
            style={{ opacity: isDownloading["income"] ? 0.7 : 1 }}
          >
            {isDownloading["income"] ? "⏳ Downloading…" : "📄 Income Report (ITR)"}
          </Button>
        )}
        {userType === "BRAND" && (
          <Button
            variant="ghost"
            aria-label={isDownloading["spend"] ? "Downloading spend report" : "Download spend report for GST"}
            onClick={handleDownloadSpendReport}
            disabled={!!isDownloading["spend"]}
            style={{ opacity: isDownloading["spend"] ? 0.7 : 1 }}
          >
            {isDownloading["spend"] ? "⏳ Downloading…" : "📊 Spend Report (GST)"}
          </Button>
        )}
      </div>
    </div>
  );
}

interface WalletSummaryCardsProps {
  readonly userType: string | null | undefined;
  readonly walletData: WalletData;
}

function WalletSummaryCards({ userType, walletData }: WalletSummaryCardsProps) {
  return (
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
  );
}

export default function WalletPage() {
  const { data: session, status } = useSession();
  const { requireFreshSession } = useTokenRefreshGuard();

  const {
    activeTab,
    setActiveTab,
    showWithdrawModal,
    setShowWithdrawModal,
    showAddFundsModal,
    setShowAddFundsModal,
    walletData,
    userType,
    isLoading,
    withdrawAmount,
    setWithdrawAmount,
    selectedAccount,
    setSelectedAccount,
    isWithdrawing,
    toasts,
    handleRemoveToast,
    handleWithdraw,
    handleAddFunds,
    isDownloading,
    activePicker,
    closePicker,
    handlePeriodConfirm,
    handleDownloadCSV,
    handleDownloadIncomeReport,
    handleDownloadSpendReport,
  } = useWallet(session, requireFreshSession);

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
      {/* ── Period picker modal ── */}
      {activePicker && (
        <PeriodPickerModal
          type={activePicker.type}
          title={activePicker.title}
          icon={activePicker.icon}
          isLoading={!!isDownloading[activePicker.key]}
          onConfirm={handlePeriodConfirm}
          onClose={closePicker}
        />
      )}

      <ToastContainer toasts={toasts} onClose={handleRemoveToast} />
      <div className="animate-fade-in">
        <WalletHeader
          userType={userType}
          balance={walletData.balance}
          isDownloading={isDownloading}
          setShowWithdrawModal={setShowWithdrawModal}
          setShowAddFundsModal={setShowAddFundsModal}
          handleDownloadCSV={handleDownloadCSV}
          handleDownloadIncomeReport={handleDownloadIncomeReport}
          handleDownloadSpendReport={handleDownloadSpendReport}
        />

        <WalletSummaryCards userType={userType} walletData={walletData} />

        <div
          className="scrollable-tabs"
          role="tablist"
          aria-label="Wallet sections"
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
            <Button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              variant="ghost"
              style={{
                padding: "12px 0",
                borderBottom:
                  activeTab === tab
                    ? "2px solid var(--color-primary)"
                    : "2px solid transparent",
                color:
                  activeTab === tab
                    ? "var(--color-primary)"
                    : "var(--color-text-secondary)",
                fontWeight: activeTab === tab ? 700 : 500,
                textTransform: "capitalize",
              }}
            >
              {getTabLabel(tab)}
            </Button>
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
                <Input
                  id="withdraw-amount-input"
                  type="number"
                  label="Amount (INR)"
                  min="500"
                  max={walletData.balance / 100}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  required
                  placeholder="Minimum 500"
                  fullWidth
                />
              </div>

              <div className="mb-6">
                <div className="label">Select Bank Account</div>
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
                    <Button
                      type="button"
                      aria-label="Change selected bank account"
                      onClick={() => setSelectedAccount(null)}
                      variant="ghost"
                      style={{ fontSize: "12px", color: "var(--color-accent-rose)" }}
                    >
                      Change
                    </Button>
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
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowWithdrawModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!selectedAccount || !withdrawAmount || isWithdrawing}
                >
                  {isWithdrawing ? "Processing..." : "Withdraw Funds"}
                </Button>
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
                <Input
                  id="add-funds-amount-input"
                  name="amount"
                  type="number"
                  label="Amount (INR)"
                  min="100"
                  required
                  placeholder="Enter amount"
                  fullWidth
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowAddFundsModal(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary">
                  Proceed to Pay
                </Button>
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


