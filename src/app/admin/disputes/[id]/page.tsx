import prisma from "@/lib/db";
import { notFound } from "next/navigation";
import { resolveDispute } from "../../dispute-actions";

export const dynamic = "force-dynamic";

export default async function AdminDisputeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: {
      deal: {
        include: {
          campaign: true,
          influencer: true,
          brand: true,
        },
      },
      raisedBy: true,
      evidence: true,
    },
  });

  if (!dispute) notFound();

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
            <dt
              style={{ fontWeight: 600, color: "var(--color-text-secondary)" }}
            >
              Status
            </dt>
            <dd
              className={`badge badge-${dispute.status === "OPEN" ? "warning" : "success"}`}
            >
              {dispute.status}
            </dd>
            <dt
              style={{ fontWeight: 600, color: "var(--color-text-secondary)" }}
            >
              Reason
            </dt>
            <dd>{dispute.type}</dd>
            <dt
              style={{ fontWeight: 600, color: "var(--color-text-secondary)" }}
            >
              Description
            </dt>
            <dd>{dispute.description}</dd>
            <dt
              style={{ fontWeight: 600, color: "var(--color-text-secondary)" }}
            >
              Amount
            </dt>
            <dd>₹{(dispute.deal.amount / 100).toFixed(2)}</dd>
          </dl>
        </div>

        {/* Evidence */}
        <div className="card">
          <h2>Evidence Log</h2>
          {dispute.evidence.length === 0 ? (
            <p>No evidence submitted yet.</p>
          ) : (
            <ul style={{ padding: 0 }}>
              {dispute.evidence.map((ev: any) => (
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
            <button className="btn btn-danger" style={{ padding: "12px 24px" }}>
              Start Refund (To Brand)
            </button>
          </form>

          <form
            action={resolveDispute.bind(
              null,
              dispute.id,
              "RELEASE_INFLUENCER",
              "Admin Decision: Release to Influencer",
            )}
          >
            <button
              className="btn btn-success"
              style={{ padding: "12px 24px" }}
            >
              Release Funds (To Influencer)
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
