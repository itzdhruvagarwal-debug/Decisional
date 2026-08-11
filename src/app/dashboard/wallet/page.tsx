"use client";


import { logger } from "@/lib/logger-client";
import { useState, useMemo, useCallback } from "react";
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
import { z } from "zod";

export type WithdrawFormValues = z.infer<typeof withdrawSchema>;

import { WalletHeader, WalletSummaryCards, type WalletData } from "@/components/dashboard/wallet/WalletHeader";

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
const handleRemoveToast = useCallback((id: string) => {
setToasts(prev => prev.filter(t => t.id !== id));
}, []);
const showToast = useCallback((type: ToastType, message: string) => {
const id = String(Date.now());
setToasts(prev => [...prev, { id, type, message }]);
setTimeout(() => handleRemoveToast(id), 5000);
}, [handleRemoveToast]);

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

// Period picker modal state
type ModalConfig = { key: string; title: string; icon: React.ReactNode; type: "transactions" | "report"; urlBase: string; fallback: string; };
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

    showToast("success", ` ${filename} downloaded`);
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
    if (period.endDate) params.set("endDate", period.endDate);
  }
  closePicker();
  downloadCsv(`${urlBase}?${params.toString()}`, key, fallback);
};

const handleDownloadCSV = () => openPicker({
  key: "txn",
  type: "transactions",
  icon: (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  title: "Download Transactions",
  urlBase: "/api/wallet/transactions",
  fallback: "transactions.csv",
});

const handleDownloadIncomeReport = () => openPicker({
  key: "income",
  type: "report",
  icon: (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  title: "Income Report (ITR)",
  urlBase: "/api/reports/influencer/income",
  fallback: "income-report.csv",
});

const handleDownloadSpendReport = () => openPicker({
  key: "spend",
  type: "report",
  icon: (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
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
<div className="flex items-center justify-center min-h-60vh">
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
{/* Period picker modal */}
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

role="tablist"
aria-label="Wallet sections"
className="scrollable-tabs border-b-card mb-6 flex gap-6"
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
className="capitalize wallet-tab-button"
data-active={activeTab === tab ? "true" : "false"}
>
{getTabLabel(tab)}
</Button>
))}
</div>

{activeTab === "overview" && (
<div className="card">
<h3 className="text-lg font-bold mb-4">
Recent Transactions
</h3>
<TransactionHistory />
</div>
)}

{activeTab === "transactions" && <TransactionHistory />}

{activeTab === "accounts" && (
<div className="max-w-800">
<BankAccountManager />
</div>
)}

{activeTab === "payment-methods" && (
<div className="max-w-800">
<div className="card">
<h3 className="text-lg font-bold mb-2">
Payment Methods
</h3>
<p className="text-secondary text-sm">
You can save methods through Razorpay checkout for faster top-ups.
</p>
</div>
</div>
)}
</div>

{showWithdrawModal && (
<div className="modal-overlay">
<div className="card w-full wallet-withdraw-modal">
<h2 className="text-xl font-extrabold mb-6">
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
className="text-xs text-rose"
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
<div className="card w-full wallet-add-funds-modal">
<h2 className="text-xl font-extrabold mb-6">
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


