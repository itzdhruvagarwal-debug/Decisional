import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { formatCurrency, formatDateTime } from "@/lib/utils-client";

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

export default function TransactionHistory() {
  const { data: session } = useSession();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({
    type: "",
    status: "",
    startDate: "",
    endDate: "",
  });

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);

    const query = new URLSearchParams({
      page: page.toString(),
      limit: "10",
    });

    if (filters.type) query.set("type", filters.type);
    if (filters.status) query.set("status", filters.status);
    if (filters.startDate) query.set("startDate", filters.startDate);
    if (filters.endDate) query.set("endDate", filters.endDate);

    try {
      const res = await fetch(`/api/wallet/transactions?${query.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || data?.error || "Failed to fetch transactions");
      }

      setTransactions(data.transactions || []);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (fetchError) {
      console.error("[transaction-history] Failed to fetch transactions:", fetchError);
      setTransactions([]);
      setTotalPages(1);
      setError("Unable to load transactions right now.");
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleFilterChange = (
    e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>,
  ) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
    setPage(1);
  };

  const exportCsv = async () => {
    const query = new URLSearchParams({ page: "1", limit: "1000" });
    if (filters.type) query.set("type", filters.type);
    if (filters.status) query.set("status", filters.status);
    if (filters.startDate) query.set("startDate", filters.startDate);
    if (filters.endDate) query.set("endDate", filters.endDate);

    try {
      const res = await fetch(`/api/wallet/transactions?${query.toString()}`);
      const data = await res.json();
      const rows: Transaction[] = data.transactions || [];
      if (rows.length === 0) return;

      const header = ["Date", "Type", "Amount (INR)", "Status", "Description", "Transaction ID"];
      const csvRows = rows.map((tx) => [
        new Date(tx.createdAt).toISOString(),
        tx.type,
        (tx.amount / 100).toFixed(2),
        tx.status,
        '"' + (tx.description || "").replace(/"/g, "'") + '"',
        tx.id,
      ]);

      const csvContent = [header, ...csvRows].map((r) => r.join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ledger_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[transaction-history] CSV export failed:", err);
    }
  };

  const printLedger = () => {
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) return;

    const rowsHtml = transactions
      .map((tx) => {
        const isOutflow = ["DEBIT", "WITHDRAWAL", "PLATFORM_FEE", "CHARGEBACK"].includes(tx.type);
        const amtFormatted = (tx.amount / 100).toFixed(2);
        const color = isOutflow ? "#e11d48" : "#10b981";
        const sign = isOutflow ? "-" : "+";
        return `<tr>
          <td>${new Date(tx.createdAt).toLocaleDateString("en-IN")}</td>
          <td>${tx.type}</td>
          <td style="text-align:right;color:${color}">${sign}&#8377;${amtFormatted}</td>
          <td>${tx.status}</td>
          <td>${tx.description || "-"}</td>
        </tr>`;
      })
      .join("");

    printWindow.document.write(
      `<!DOCTYPE html><html><head><title>Transaction Ledger</title>` +
      `<style>body{font-family:Arial,sans-serif;padding:20px}h1{font-size:20px;margin-bottom:16px}` +
      `table{width:100%;border-collapse:collapse;font-size:13px}` +
      `th,td{border:1px solid #ddd;padding:8px 12px;text-align:left}` +
      `th{background:#f4f4f4;font-weight:700}tr:nth-child(even){background:#fafafa}` +
      `@media print{button{display:none}}</style></head><body>` +
      `<h1>Transaction Ledger &mdash; ${new Date().toLocaleDateString("en-IN")}</h1>` +
      `<table><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Status</th><th>Description</th></tr></thead>` +
      `<tbody>${rowsHtml}</tbody></table>` +
      `<br/><button onclick="window.print()">Print</button>` +
      `</body></html>`,
    );
    printWindow.document.close();
  };

  return (
    <div className="card" style={{ padding: "0", overflow: "hidden" }}>
      <div
        style={{
          padding: "24px",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <h3 style={{ fontSize: "18px", fontWeight: 700 }}>
            Transaction History
          </h3>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={exportCsv}
              title="Download CSV"
              style={{ fontSize: "12px" }}
            >
              ⬇ CSV
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={printLedger}
              title="Print ledger"
              style={{ fontSize: "12px" }}
            >
              🖨 Print
            </button>

            <select
              name="type"
              className="input"
              style={{ padding: "8px", fontSize: "13px", width: "auto" }}
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
            </select>
            <select
              name="status"
              className="input"
              style={{ padding: "8px", fontSize: "13px", width: "auto" }}
              value={filters.status}
              onChange={handleFilterChange}
            >
              <option value="">All Statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="PENDING">Pending</option>
              <option value="PROCESSING">Processing</option>
              <option value="FAILED">Failed</option>
              <option value="REVERSED">Reversed</option>
            </select>
            <input
              type="date"
              name="startDate"
              className="input"
              style={{ padding: "8px", fontSize: "13px", width: "auto" }}
              value={filters.startDate}
              onChange={handleFilterChange}
            />
            <input
              type="date"
              name="endDate"
              className="input"
              style={{ padding: "8px", fontSize: "13px", width: "auto" }}
              value={filters.endDate}
              onChange={handleFilterChange}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center">
          <span className="loading" />
        </div>
      ) : error ? (
        <div style={{ padding: "48px 24px", textAlign: "center" }}>
          <div
            style={{
              color: "var(--color-accent-rose)",
              marginBottom: "16px",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            ⚠️ {error}
          </div>
          <button
            type="button"
            onClick={() => fetchTransactions()}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: "13px", padding: "8px 16px" }}
          >
            Try Again
          </button>
        </div>
      ) : transactions.length === 0 ? (
        <div className="p-8 text-center text-[var(--color-text-secondary)]">
          No transactions found matching your filters.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--color-border)",
                  textAlign: "left",
                  fontSize: "13px",
                  color: "var(--color-text-secondary)",
                }}
              >
                <th style={{ padding: "16px 24px", fontWeight: 600 }}>Type</th>
                <th style={{ padding: "16px 24px", fontWeight: 600 }}>
                  Amount
                </th>
                <th style={{ padding: "16px 24px", fontWeight: 600 }}>
                  Status
                </th>
                <th style={{ padding: "16px 24px", fontWeight: 600 }}>Date</th>
                <th style={{ padding: "16px 24px", fontWeight: 600 }}>
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
                    style={{
                      borderBottom: "1px solid var(--color-border)",
                      fontSize: "14px",
                    }}
                  >
                    <td style={{ padding: "16px 24px" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <div
                          style={{
                            minWidth: "40px",
                            height: "32px",
                            borderRadius: "8px",
                            background: "rgba(255,255,255,0.05)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: typeInfo.color,
                            fontSize: "10px",
                            fontWeight: 700,
                          }}
                        >
                          {typeInfo.icon}
                        </div>
                        <span style={{ fontWeight: 500 }}>{tx.type}</span>
                      </div>
                    </td>
                    <td
                      style={{
                        padding: "16px 24px",
                        fontWeight: 600,
                        color: typeInfo.color,
                      }}
                    >
                      {isOutflow ? "-" : "+"}
                      {formatCurrency(tx.amount)}
                    </td>
                    <td style={{ padding: "16px 24px" }}>
                      <span
                        style={{
                          padding: "4px 10px",
                          borderRadius: "12px",
                          fontSize: "12px",
                          fontWeight: 600,
                          background: statusColor.bg,
                          color: statusColor.text,
                        }}
                      >
                        {tx.status}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "16px 24px",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      {formatDateTime(tx.createdAt)}
                    </td>
                    <td
                      style={{
                        padding: "16px 24px",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      {tx.description || "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            justifyContent: "center",
            gap: "8px",
          }}
        >
          <button
            className="btn btn-secondary btn-sm"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span
            style={{ display: "flex", alignItems: "center", fontSize: "14px" }}
          >
            Page {page} of {totalPages}
          </span>
          <button
            className="btn btn-secondary btn-sm"
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
