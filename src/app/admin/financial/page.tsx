import { auth } from "@/lib/auth";
import { requireActiveAdmin } from "@/lib/admin-auth";
import { redirect } from "next/navigation";
import { formatCurrency } from "@/lib/utils-client";
import { AdminAnalyticsService } from "@/services/admin-analytics.service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Financial Overview | Admin",
  description: "Treasury and platform fees overview",
};

export default async function AdminFinancialPage() {
  const session = await auth();

  try {
    await requireActiveAdmin(session?.user);
  } catch {
    redirect("/dashboard");
  }

  // Call service directly on the server to prevent port-binding failures and loopback request overhead
  const data = await AdminAnalyticsService.getFinancialOverview();

  return (
    <div className="admin-page" style={{ color: "var(--color-text-primary)" }}>
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <h1 className="gradient-text" style={{ fontSize: "28px", fontWeight: 900, marginBottom: "6px" }}>
          Financial Overview
        </h1>
        <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
          Real-time treasury metrics, platform fee earnings, and wallet liabilities.
        </p>
      </div>

      {/* Overview Metrics Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "24px",
          marginBottom: "32px",
        }}
      >
        <div className="card" style={{ padding: "24px", borderLeft: "4px solid var(--color-primary-light)" }}>
          <div style={{ fontSize: "12px", textTransform: "uppercase", fontWeight: 700, color: "var(--color-text-muted)", marginBottom: "8px" }}>
            Gross Merchandise Value (GMV)
          </div>
          <div style={{ fontSize: "24px", fontWeight: 800 }}>{formatCurrency(data.overview.gmv)}</div>
          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
            Last 30 Days: {formatCurrency(data.overview.gmvLast30Days)}
          </div>
        </div>

        <div className="card" style={{ padding: "24px", borderLeft: "4px solid var(--color-success)" }}>
          <div style={{ fontSize: "12px", textTransform: "uppercase", fontWeight: 700, color: "var(--color-text-muted)", marginBottom: "8px" }}>
            Net Profit (Revenue - Gateway Fees)
          </div>
          <div style={{ fontSize: "24px", fontWeight: 800, color: "var(--color-success)" }}>{formatCurrency(data.overview.netProfit)}</div>
          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
            Gross Revenue: {formatCurrency(data.overview.platformRevenue)}
          </div>
        </div>

        <div className="card" style={{ padding: "24px", borderLeft: "4px solid var(--color-accent-blue)" }}>
          <div style={{ fontSize: "12px", textTransform: "uppercase", fontWeight: 700, color: "var(--color-text-muted)", marginBottom: "8px" }}>
            Influencer Payouts
          </div>
          <div style={{ fontSize: "24px", fontWeight: 800 }}>{formatCurrency(data.overview.influencerPayouts)}</div>
          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
            Total platform disbursements
          </div>
        </div>

        <div className="card" style={{ padding: "24px", borderLeft: "4px solid var(--color-accent-amber)" }}>
          <div style={{ fontSize: "12px", textTransform: "uppercase", fontWeight: 700, color: "var(--color-text-muted)", marginBottom: "8px" }}>
            Gateway Fees
          </div>
          <div style={{ fontSize: "24px", fontWeight: 800 }}>{formatCurrency(data.overview.gatewayFees)}</div>
          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
            Processor transaction costs
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: "24px",
          marginBottom: "32px",
        }}
      >
        {/* Treasury & Wallet Liabilities */}
        <div className="card" style={{ padding: "24px" }}>
          <h3 style={{ fontSize: "18px", fontWeight: 800, marginBottom: "20px" }}>🏦 Treasury & Wallet Liabilities</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "12px", borderBottom: "1px solid var(--color-border)" }}>
              <span style={{ color: "var(--color-text-secondary)" }}>Total Outstanding Liability (Wallet Balances)</span>
              <span style={{ fontWeight: 700, color: "var(--color-accent-rose)" }}>{formatCurrency(data.wallets.totalBalance)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "12px", borderBottom: "1px solid var(--color-border)" }}>
              <span style={{ color: "var(--color-text-secondary)" }}>Total Earned by Users</span>
              <span style={{ fontWeight: 700 }}>{formatCurrency(data.wallets.totalEarned)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-secondary)" }}>Total Withdrawn by Users</span>
              <span style={{ fontWeight: 700 }}>{formatCurrency(data.wallets.totalWithdrawn)}</span>
            </div>
          </div>
        </div>

        {/* Escrows & Payouts */}
        <div className="card" style={{ padding: "24px" }}>
          <h3 style={{ fontSize: "18px", fontWeight: 800, marginBottom: "20px" }}>⏳ Pending Escrows & Withdrawals</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "12px", borderBottom: "1px solid var(--color-border)" }}>
              <span style={{ color: "var(--color-text-secondary)" }}>Pending Escrow Payouts (Active Deals)</span>
              <span style={{ fontWeight: 700 }}>
                {formatCurrency(data.payments.pendingPayouts)}{" "}
                <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-muted)" }}>
                  ({data.payments.pendingPayoutCount} deals)
                </span>
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "12px", borderBottom: "1px solid var(--color-border)" }}>
              <span style={{ color: "var(--color-text-secondary)" }}>Pending Bank Withdrawals</span>
              <span style={{ fontWeight: 700, color: "var(--color-accent-amber)" }}>
                {formatCurrency(data.withdrawals.pendingAmount)}{" "}
                <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-muted)" }}>
                  ({data.withdrawals.pendingCount} requests)
                </span>
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-secondary)" }}>Successful Payouts (Completed Withdrawals)</span>
              <span style={{ fontWeight: 700 }}>
                {formatCurrency(data.withdrawals.completedAmount)}{" "}
                <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-muted)" }}>
                  ({data.withdrawals.completedCount} requests)
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: "24px",
        }}
      >
        {/* Deal Operations Stats */}
        <div className="card" style={{ padding: "24px" }}>
          <h3 style={{ fontSize: "18px", fontWeight: 800, marginBottom: "20px" }}>💼 Deal Operations Stats</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Total Deals Created</div>
              <div style={{ fontSize: "20px", fontWeight: 700, marginTop: "4px" }}>{data.deals.total}</div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Completed Deals</div>
              <div style={{ fontSize: "20px", fontWeight: 700, marginTop: "4px", color: "var(--color-success)" }}>{data.deals.completed}</div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Active/Pending Deals</div>
              <div style={{ fontSize: "20px", fontWeight: 700, marginTop: "4px", color: "var(--color-primary-light)" }}>{data.deals.active}</div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Disputed Deals</div>
              <div style={{ fontSize: "20px", fontWeight: 700, marginTop: "4px", color: "var(--color-accent-rose)" }}>{data.deals.disputed}</div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Cancelled Deals</div>
              <div style={{ fontSize: "20px", fontWeight: 700, marginTop: "4px" }}>{data.deals.cancelled}</div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Deal Completion Rate</div>
              <div style={{ fontSize: "20px", fontWeight: 700, marginTop: "4px" }}>{data.deals.completionRate}%</div>
            </div>
          </div>
        </div>

        {/* Transaction History & Refunds */}
        <div className="card" style={{ padding: "24px" }}>
          <h3 style={{ fontSize: "18px", fontWeight: 800, marginBottom: "20px" }}>🔄 Refunds & Gateway Performance</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "12px", borderBottom: "1px solid var(--color-border)" }}>
              <span style={{ color: "var(--color-text-secondary)" }}>Total Refunded Amount</span>
              <span style={{ fontWeight: 700 }}>
                {formatCurrency(data.refunds.totalAmount)}{" "}
                <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-muted)" }}>
                  ({data.refunds.totalCount} refunds)
                </span>
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "12px", borderBottom: "1px solid var(--color-border)" }}>
              <span style={{ color: "var(--color-text-secondary)" }}>Refunds Issued (Last 30 Days)</span>
              <span style={{ fontWeight: 700 }}>
                {formatCurrency(data.refunds.last30DaysAmount)}{" "}
                <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-muted)" }}>
                  ({data.refunds.last30DaysCount} refunds)
                </span>
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-secondary)" }}>Payment/Transaction Success Rate</span>
              <span style={{ fontWeight: 700, color: "var(--color-success)" }}>{data.payments.successRate}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Export Reports Section */}
      <div className="card" style={{ padding: "24px", marginTop: "24px" }}>
        <h3 style={{ fontSize: "18px", fontWeight: 800, marginBottom: "12px" }}>📥 Export Financial Reports</h3>
        <p style={{ color: "var(--color-text-secondary)", fontSize: "14px", marginBottom: "20px" }}>
          Generate and download detailed financial statements in CSV format for compliance, auditing, and tax filing.
        </p>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <a
            href="/api/admin/reports/revenue?format=csv"
            download
            className="btn btn-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none" }}
          >
            📊 Download Revenue Report (CSV)
          </a>
          <a
            href="/api/admin/reports/tds?format=csv"
            download
            className="btn btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none" }}
          >
            📜 Download TDS Report (CSV)
          </a>
        </div>
      </div>
    </div>
  );
}
