import prisma from "@/lib/db";
import { notFound } from "next/navigation";
import { resolveDispute } from "../../dispute-actions";
import EmptyState from "@/components/ui/EmptyState";
import { Button } from "@/components/ui";

export const dynamic = "force-dynamic";

function StatusBadge({ status }: { readonly status: string }) {
  let color = "badge-info";
  if (status === "COMPLETED" || status === "VERIFIED") {
    color = "badge-success";
  } else if (status === "DISPUTED") {
    color = "badge-danger";
  } else if (status === "CANCELLED") {
    color = "badge-warning";
  }
  return <span className={`badge ${color}`}>{status}</span>;
}

function DealHistoryList({
  deals,
}: {
  readonly deals: Array<{
    id: string;
    status: string;
    amount: number;
    createdAt: Date;
    campaign: { title: string } | null;
  }>;
}) {
  if (deals.length === 0) {
    return (
      <EmptyState
        emoji="💼"
        title="No Previous Deals"
        description="No previous deals found for this user."
        compact
      />
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {deals.map((d) => (
        <div
          key={d.id}
          style={{
            padding: "10px 12px",
            background: "var(--color-bg-tertiary)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600 }}>{d.campaign?.title || "Campaign"}</div>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
              {new Date(d.createdAt).toLocaleDateString()} • ₹{(d.amount / 100).toFixed(0)}
            </div>
          </div>
          <StatusBadge status={d.status} />
        </div>
      ))}
    </div>
  );
}

export default async function AdminDisputeDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: {
      deal: {
        include: {
          campaign: true,
          influencer: {
            include: {
              user: { select: { id: true, email: true } },
            },
          },
          brand: {
            include: {
              user: { select: { id: true, email: true } },
            },
          },
        },
      },
      raisedBy: true,
      evidence: true,
    },
  });

  if (!dispute) notFound();

  // Fetch deal histories for both parties
  const [influencerDeals, brandDeals] = await Promise.all([
    prisma.deal.findMany({
      where: {
        influencerId: dispute.deal.influencerId,
        id: { not: dispute.dealId },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        amount: true,
        createdAt: true,
        campaign: { select: { title: true } },
      },
    }),
    prisma.deal.findMany({
      where: {
        brandId: dispute.deal.brandId,
        id: { not: dispute.dealId },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        amount: true,
        createdAt: true,
        campaign: { select: { title: true } },
      },
    }),
  ]);

  return (
    <div className="admin-page">
      <div className="admin-toolbar">
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 900, marginBottom: "6px" }}>
            Dispute Resolution
          </h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
            Final decision workspace for case {dispute.id.slice(0, 8)}.
          </p>
        </div>
      </div>

      <div className="grid-2" style={{ gap: "32px" }}>
        {/* Details */}
        <div className="card">
          <h2>Case Details</h2>
          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr",
              gap: "8px 16px",
              marginTop: "16px",
            }}
          >
            <dt style={{ fontWeight: 600, color: "var(--color-text-secondary)" }}>Status</dt>
            <dd className={`badge badge-${dispute.status === "OPEN" ? "warning" : "success"}`}>
              {dispute.status}
            </dd>
            <dt style={{ fontWeight: 600, color: "var(--color-text-secondary)" }}>Reason</dt>
            <dd>{dispute.type}</dd>
            <dt style={{ fontWeight: 600, color: "var(--color-text-secondary)" }}>Description</dt>
            <dd>{dispute.description}</dd>
            <dt style={{ fontWeight: 600, color: "var(--color-text-secondary)" }}>Amount</dt>
            <dd>₹{(dispute.deal.amount / 100).toFixed(2)}</dd>
            <dt style={{ fontWeight: 600, color: "var(--color-text-secondary)" }}>Campaign</dt>
            <dd>{dispute.deal.campaign?.title || "N/A"}</dd>
          </dl>
        </div>

        {/* Evidence */}
        <div className="card">
          <h2>Evidence Log</h2>
          {dispute.evidence.length === 0 ? (
            <EmptyState
              emoji="📋"
              title="No Evidence Yet"
              description="No evidence has been submitted for this dispute."
              compact
            />
          ) : (
            <ul style={{ padding: 0 }}>
              {dispute.evidence.map((ev) => (
                <li
                  key={ev.id}
                  style={{
                    padding: "12px",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{ev.description}</div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    Uploaded by User {ev.submittedByUserId.slice(0, 8)}... on{" "}
                    {new Date(ev.submittedAt).toLocaleDateString()}
                  </div>
                  {ev.url && (
                    <a
                      href={ev.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm btn-outline"
                      style={{ marginTop: "4px" }}
                    >
                      View File
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Party Deal Timelines */}
      <div className="grid-2" style={{ gap: "32px", marginTop: "32px" }}>
        {/* Influencer History */}
        <div className="card">
          <h2 style={{ marginBottom: "16px" }}>
            📊 Influencer Deal History{" "}
            <span style={{ fontSize: "13px", fontWeight: 400, color: "var(--color-text-secondary)", marginLeft: "8px" }}>
              (last 10 deals, excl. this dispute)
            </span>
          </h2>
          <DealHistoryList deals={influencerDeals} />
        </div>

        {/* Brand History */}
        <div className="card">
          <h2 style={{ marginBottom: "16px" }}>
            🏢 Brand Deal History{" "}
            <span style={{ fontSize: "13px", fontWeight: 400, color: "var(--color-text-secondary)", marginLeft: "8px" }}>
              (last 10 deals, excl. this dispute)
            </span>
          </h2>
          <DealHistoryList deals={brandDeals} />
        </div>
      </div>

      {/* Actions */}
      <div
        style={{
          marginTop: "32px",
          padding: "24px",
          background: "var(--color-bg-tertiary)",
          borderRadius: "12px",
        }}
      >
        <h3 style={{ marginBottom: "16px" }}>Administrator Verdict</h3>
        <p
          style={{ marginBottom: "16px", color: "var(--color-text-secondary)" }}
        >
          Make a final binding decision. This will transfer funds immediately.
        </p>

        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <form
            action={resolveDispute.bind(
              null,
              dispute.id,
              "REFUND_BRAND",
              "Admin Decision: Refund to Brand",
            )}
          >
            <Button type="submit" variant="danger" style={{ padding: "12px 24px" }}>
              Start Refund (To Brand)
            </Button>
          </form>

          <form
            action={resolveDispute.bind(
              null,
              dispute.id,
              "RELEASE_INFLUENCER",
              "Admin Decision: Release to Influencer",
            )}
          >
            <Button
              type="submit"
              variant="success"
              style={{ padding: "12px 24px" }}
            >
              Release Funds (To Influencer)
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
