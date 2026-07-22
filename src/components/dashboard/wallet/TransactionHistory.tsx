import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { useSession } from "next-auth/react";
import { formatCurrency, formatDateTime } from "@/lib/utils-client";
import EmptyState from "@/components/ui/EmptyState";
import PeriodPickerModal, { type PeriodValue } from "@/components/dashboard/wallet/PeriodPickerModal";
import { logger } from "@/lib/logger-client";
import { Button, Input, Select } from "@/components/ui";

const transactionTypeIcons: Record<string, { icon: string; color: string }> = {
  CREDIT: { icon: "IN", color: "var(--color-accent-emerald)" },
  DEBIT: { icon: "OUT", color: "var(--color-accent-rose)" },
  WITHDRAWAL: { icon: "WD", color: "var(--color-accent-amber)" },
  REFUND: { icon: "RF", color: "var(--color-accent-cyan)" },
  PLATFORM_FEE: { icon: "FEE", color: "var(--color-text-secondary)" },
  CHARGEBACK: { icon: "CB", color: "var(--color-accent-rose)" },
};

const statusColors: Record<string, { bg: string; text: string }> = {
  COMPLETED: {
    bg: "rgba(16, 185, 129, 0.2)",
    text: "var(--color-accent-emerald)",
  },
  PENDING: { bg: "rgba(245, 158, 11, 0.2)", text: "var(--color-accent-amber)" },
  PROCESSING: {
    bg: "rgba(99, 102, 241, 0.2)",
    text: "var(--color-primary-light)",
  },
  FAILED: { bg: "rgba(244, 63, 94, 0.2)", text: "var(--color-accent-rose)" },
  REVERSED: { bg: "rgba(244, 63, 94, 0.2)", text: "var(--color-accent-rose)" },
};

interface Transaction {
  id: string;
  createdAt: string;
  type: string;
  amount: number;
  status: string;
  description: string;
}

interface TransactionsResponse {
  transactions?: Transaction[];
  pagination?: { totalPages: number };
}

export default function TransactionHistory() {
  const { data: session } = useSession();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    type: "",
    status: "",
    startDate: "",
    endDate: "",
  });

  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: "10",
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.startDate ? { startDate: filters.startDate } : {}),
    ...(filters.endDate ? { endDate: filters.endDate } : {}),
  });

  const { data, error, isLoading, mutate: fetchTransactions } = useSWR<TransactionsResponse>(
    `/api/wallet/transactions?${queryParams.toString()}`,
    fetcher,
  );

  const transactions = data?.transactions || [];
  const totalPages = data?.pagination?.totalPages || 1;

  // ── Period picker state ───────────────────────────────────────────────
  type PickerTarget = "csv" | "print";
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [csvLoading,  setCsvLoading]   = useState(false);

  const handleFilterChange = (
    e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>,
  ) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
    setPage(1);
  };

  const exportCsv = async (period?: PeriodValue) => {
    setCsvLoading(true);
    const query = new URLSearchParams({ format: "csv" });
    if (filters.type)   query.set("type",   filters.type);
    if (filters.status) query.set("status", filters.status);
    // period dates override filter dates
    const start = period?.startDate || filters.startDate;
    const end   = period?.endDate   || filters.endDate;
    if (start) query.set("startDate", start);
    if (end)   query.set("endDate",   end);

    try {
      const res = await fetch(`/api/wallet/transactions?${query.toString()}`);
      if (!res.ok) {
        const errText = await res.text();
        let msg = `Export failed (${res.status})`;
        try { const d = JSON.parse(errText); if (d?.message) msg = d.message; } catch {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") || "";
      const match = /filename="?([^";\n]+)"?/.exec(disposition);
      const filename = match?.[1]?.trim() ?? `ledger_${new Date().toISOString().slice(0, 10)}.csv`;
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.style.position = "fixed";
      a.style.left = "-9999px";
      a.style.top = "-9999px";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(blobUrl); a.remove(); }, 5000);
    } catch (err) {
      logger.error("[transaction-history] CSV export failed:", err);
      alert(err instanceof Error ? err.message : "CSV download failed");
    } finally {
      setCsvLoading(false);
    }
  };

  const handlePeriodConfirm = (period: PeriodValue) => {
    setPickerTarget(null);
    if (pickerTarget === "csv")   exportCsv(period);
    if (pickerTarget === "print") printLedger(period);
  };


  const printLedger = async (period?: PeriodValue) => {
    // Fetch user profile for the print header
    let userName  = session?.user?.name  || "—";
    let userEmail = session?.user?.email || "—";
    let userType  = session?.user?.userType || "—";

    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        const p = data.profile;
        const u = data.user;
        userName  = p?.displayName || p?.companyName || userName;
        userEmail = u?.email  || userEmail;
        userType  = u?.userType || userType;
      }
    } catch {
      // fallback to session values
    }

    // Fetch transactions for the selected period (max 1000)
    let printTxns = transactions;
    const query = new URLSearchParams({ page: "1", limit: "1000" });
    if (filters.type)   query.set("type",   filters.type);
    if (filters.status) query.set("status", filters.status);
    const start = period?.startDate || filters.startDate;
    const end   = period?.endDate   || filters.endDate;
    if (start) query.set("startDate", start);
    if (end)   query.set("endDate",   end);

    try {
      const res = await fetch(`/api/wallet/transactions?${query.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.transactions) {
          printTxns = data.transactions;
        }
      }
    } catch (err) {
      logger.error("Failed to fetch transactions for printing:", err);
    }

    const printWindow = window.open("", "_blank", "width=1000,height=750");
    if (!printWindow) return;

    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
    const time  = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

    // Escape all string values before interpolating into the print-window HTML.
    // tx.description and tx.type are currently system-generated, but defensive
    // escaping future-proofs against stored-XSS if any field becomes user-editable.
    const escapeHtml = (str: string): string =>
      str
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

    const rowsHtml = printTxns.map((tx) => {
      const isOutflow = ["DEBIT", "WITHDRAWAL", "PLATFORM_FEE", "CHARGEBACK"].includes(tx.type);
      const amtFormatted = (tx.amount / 100).toFixed(2);
      const color = isOutflow ? "#dc2626" : "#059669";
      const sign = isOutflow ? "−" : "+";
      const dateStr = escapeHtml(new Date(tx.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }));
      const timeStr = escapeHtml(new Date(tx.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }));
      const txType  = escapeHtml(tx.type.replace("_", " "));
      const txStatus = escapeHtml(tx.status);
      const txDesc  = escapeHtml(tx.description || "—");
      return `<tr>
        <td>${dateStr}<br/><span style="font-size:11px;color:#6b7280">${timeStr}</span></td>
        <td><span style="font-size:11px;padding:2px 8px;border-radius:4px;background:${isOutflow ? "#fee2e2" : "#d1fae5"};color:${color};font-weight:600">${txType}</span></td>
        <td style="text-align:right;color:${color};font-weight:700;font-size:15px">${sign}&#8377;${amtFormatted}</td>
        <td><span style="font-size:11px;padding:2px 6px;border-radius:4px;background:#f3f4f6;color:#374151">${txStatus}</span></td>
        <td style="color:#6b7280;font-size:12px">${txDesc}</td>
      </tr>`;
    }).join("");

    printWindow.document.documentElement.innerHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Transaction Ledger — Decisional</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #111; padding: 32px; font-size: 13px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 2px solid #4f46e5; }
    .brand { display: flex; flex-direction: column; gap: 2px; }
    .brand-name { font-size: 22px; font-weight: 800; color: #4f46e5; letter-spacing: -0.5px; }
    .brand-legal { font-size: 11px; color: #6b7280; }
    .brand-meta { font-size: 11px; color: #6b7280; margin-top: 4px; }
    .report-title { text-align: right; }
    .report-title h2 { font-size: 18px; font-weight: 700; color: #111; }
    .report-title .date { font-size: 11px; color: #6b7280; margin-top: 4px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .meta-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; }
    .meta-box h4 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 8px; }
    .meta-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
    .meta-label { color: #6b7280; font-size: 12px; }
    .meta-value { font-weight: 600; font-size: 12px; color: #111; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead { background: #4f46e5; color: white; }
    thead th { padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    tbody tr:nth-child(even) { background: #f9fafb; }
    tbody tr:hover { background: #f0f0ff; }
    td { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
    .footer { border-top: 1px solid #e5e7eb; padding-top: 16px; display: flex; justify-content: space-between; font-size: 11px; color: #9ca3af; }
    .no-print { margin-top: 24px; text-align: center; }
    .print-btn { background: #4f46e5; color: white; border: none; padding: 10px 28px; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; }
    @media print {
      .no-print { display: none; }
      body { padding: 16px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <div class="brand-name">Decisional</div>
      <div class="brand-legal">Decisional Technologies Private Limited</div>
      <div class="brand-meta">support@decisional.in &nbsp;|&nbsp; https://decisional.in</div>
    </div>
    <div class="report-title">
      <h2>Wallet Transaction Ledger</h2>
      <div class="date">Generated: ${today} at ${time}</div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-box">
      <h4>Account Holder</h4>
      <div class="meta-row"><span class="meta-label">Name</span><span class="meta-value">${userName}</span></div>
      <div class="meta-row"><span class="meta-label">Email</span><span class="meta-value">${userEmail}</span></div>
      <div class="meta-row"><span class="meta-label">Account Type</span><span class="meta-value">${userType}</span></div>
    </div>
    <div class="meta-box">
      <h4>Report Details</h4>
      <div class="meta-row"><span class="meta-label">Report Type</span><span class="meta-value">Transaction Ledger</span></div>
      <div class="meta-row"><span class="meta-label">Total Records</span><span class="meta-value">${printTxns.length}</span></div>
      <div class="meta-row"><span class="meta-label">Period</span><span class="meta-value">${period?.label ?? "All records"}</span></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date &amp; Time</th>
        <th>Type</th>
        <th style="text-align:right">Amount</th>
        <th>Status</th>
        <th>Description</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="footer">
    <span>Generated by Decisional &nbsp;|&nbsp; support@decisional.in</span>
    <span>This is a system-generated document and does not require a signature.</span>
  </div>

  <div class="no-print">
    <button class="print-btn" onclick="window.print()">🖨 Print / Save as PDF</button>
  </div>
</body>
</html>`;
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="p-8 text-center">
          <span className="loading" />
        </div>
      );
    }
    if (error) {
      return (
        <div className="text-center" style={{ padding: "48px 24px" }}>
          <div
            className="mb-4 text-sm font-semibold text-rose"
          >
            ⚠️ {error instanceof Error ? error.message : "Unable to load transactions right now."}
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => fetchTransactions()}
            className="text-sm px-4-py-2"
          >
            Try Again
          </Button>
        </div>
      );
    }
    if (transactions.length === 0) {
      return (
        <EmptyState
          emoji="💸"
          title="No Transactions Found"
          description="No transactions found matching your filters."
          compact
        />
      );
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr
              className="border-b-card text-left text-sm text-secondary"
            >
              <th className="font-semibold px-6-py-4">Type</th>
              <th className="font-semibold px-6-py-4">
                Amount
              </th>
              <th className="font-semibold px-6-py-4">
                Status
              </th>
              <th className="font-semibold px-6-py-4">Date</th>
              <th className="font-semibold px-6-py-4">
                Details
              </th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => {
              const typeInfo = transactionTypeIcons[tx.type] || {
                icon: "TX",
                color: "var(--color-text-secondary)",
              };
              const isOutflow = ["DEBIT", "WITHDRAWAL", "PLATFORM_FEE", "CHARGEBACK"].includes(
                tx.type,
              );
              const statusColor = statusColors[tx.status] || {
                bg: "rgba(255,255,255,0.1)",
                text: "white",
              };

              return (
                <tr
                  key={tx.id}
                  className="border-b-card text-sm"
                >
                  <td className="px-6-py-4">
                    <div
                      className="flex items-center gap-2"
                    >
                      <div
                        className="flex items-center justify-center font-bold rounded-md text-2xs" style={{ minWidth: "40px", height: "32px", background: "rgba(255,255,255,0.05)", color: typeInfo.color }}
                      >
                        {typeInfo.icon}
                      </div>
                      <span className="font-medium">{tx.type}</span>
                    </div>
                  </td>
                  <td
                    className="font-semibold px-6-py-4" style={{ color: typeInfo.color }}
                  >
                    {isOutflow ? "-" : "+"}
                    {formatCurrency(tx.amount)}
                  </td>
                  <td className="px-6-py-4">
                    <span
                      className="text-xs font-semibold rounded-lg px-2-py-1" style={{ background: statusColor.bg, color: statusColor.text }}
                    >
                      {tx.status}
                    </span>
                  </td>
                  <td
                    className="text-secondary px-6-py-4"
                  >
                    {formatDateTime(tx.createdAt)}
                  </td>
                  <td
                    className="text-secondary px-6-py-4"
                  >
                    {tx.description || "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="card p-0 overflow-hidden">
      {/* Period picker modal */}
      {pickerTarget && (
        <PeriodPickerModal
          type="transactions"
          title={pickerTarget === "csv" ? "Export CSV" : "Print Ledger"}
          icon={pickerTarget === "csv" ? "⬇" : "🖨"}
          isLoading={pickerTarget === "csv" ? csvLoading : false}
          onConfirm={handlePeriodConfirm}
          onClose={() => setPickerTarget(null)}
        />
      )}
      <div
        className="p-6 border-b-card"
      >
        <div
          className="flex justify-between items-center mb-4"
        >
          <h3 className="text-lg font-bold">
            Transaction History
          </h3>
          <div className="flex gap-2 flex-wrap items-center">
            <Button
              variant="secondary"
              onClick={() => setPickerTarget("csv")}
              disabled={csvLoading}
              title="Download CSV for a specific period"
              className="text-xs"
            >
              {csvLoading ? "⏳…" : "⬇ CSV"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setPickerTarget("print")}
              title="Print ledger for a specific period"
              className="text-xs"
            >
              🖨 Print
            </Button>

            <Select
              name="type"
              aria-label="Filter by transaction type"
              className="p-2 text-sm w-auto"
              value={filters.type}
              onChange={handleFilterChange}
            >
              <option value="">All Types</option>
              <option value="CREDIT">Credits</option>
              <option value="DEBIT">Debits</option>
              {session?.user?.userType !== "BRAND" && (
                <option value="WITHDRAWAL">Withdrawals</option>
              )}
              <option value="REFUND">Refunds</option>
              <option value="PLATFORM_FEE">Platform Fee</option>
              <option value="CHARGEBACK">Chargeback</option>
            </Select>
            <Select
              name="status"
              aria-label="Filter by transaction status"
              className="p-2 text-sm w-auto"
              value={filters.status}
              onChange={handleFilterChange}
            >
              <option value="">All Statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="PENDING">Pending</option>
              <option value="PROCESSING">Processing</option>
              <option value="FAILED">Failed</option>
              <option value="REVERSED">Reversed</option>
            </Select>
            <Input
              type="date"
              name="startDate"
              aria-label="Filter from date"
              className="p-2 text-sm w-auto"
              value={filters.startDate}
              onChange={handleFilterChange}
            />
            <Input
              type="date"
              name="endDate"
              aria-label="Filter to date"
              className="p-2 text-sm w-auto"
              value={filters.endDate}
              onChange={handleFilterChange}
            />
          </div>
        </div>
      </div>

      {renderContent()}

      {totalPages > 1 && (
        <nav
          aria-label="Transaction history pagination"
          className="flex justify-center gap-2 border-top px-6-py-4"
        >
          <Button
            variant="secondary"
            disabled={page === 1}
            aria-label="Go to previous page"
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span
            aria-current="page"
            aria-live="polite"
            className="flex items-center text-sm"
          >
            Page {page} of {totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={page === totalPages}
            aria-label="Go to next page"
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}
