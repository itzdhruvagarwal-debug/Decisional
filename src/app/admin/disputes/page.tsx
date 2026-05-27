import prisma from "@/lib/db";
import Link from "next/link";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export default async function AdminDisputeListPage() {
  let activeDisputes: any[] = [];
  let loadError = false;

  try {
    activeDisputes = await prisma.dispute.findMany({
      where: {
        status: { in: ["OPEN", "TIER2_MEDIATION"] },
      },
      include: {
        deal: {
          include: {
            campaign: { select: { title: true } },
            influencer: { select: { displayName: true } },
            brand: { select: { companyName: true } },
          },
        },
        raisedBy: { select: { email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  } catch (error) {
    loadError = true;
    logger.error("Admin dispute queue failed to load", error);
  }

  return (
    <div className="admin-page">
      <div className="admin-toolbar">
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 900, marginBottom: "6px" }}>
            Dispute Resolution Queue
          </h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
            Review open and Tier 2 mediation cases before funds move.
          </p>
        </div>
      </div>

      {loadError ? (
        <div
          className="card"
          style={{
            padding: "24px",
            color: "var(--color-accent-rose)",
            borderColor: "rgba(244, 63, 94, 0.3)",
          }}
        >
          Could not load disputes right now. Please retry after checking database connectivity.
        </div>
      ) : activeDisputes.length === 0 ? (
        <div
          style={{
            padding: "40px",
            textAlign: "center",
            color: "var(--color-text-secondary)",
          }}
        >
          No active disputes.
        </div>
      ) : (
        <div style={{ display: "grid", gap: "16px" }}>
          {activeDisputes.map((dispute) => (
            <div
              key={dispute.id}
              className="card"
              style={{
                padding: "16px 24px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "16px",
                flexWrap: "wrap",
                background: "var(--color-bg-secondary)",
                border: "1px solid var(--color-border)",
                borderRadius: "12px",
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "16px",
                    marginBottom: "4px",
                  }}
                >
                  {dispute.deal?.campaign?.title || "Untitled Campaign"}
                </div>
                <div
                  style={{ fontSize: "12px", color: "var(--color-text-muted)" }}
                >
                  Raised by: {dispute.raisedBy?.email || "Unknown user"} |{" "}
                  {new Date(dispute.createdAt).toLocaleDateString()}
                </div>
                <div
                  style={{
                    marginTop: "8px",
                    display: "flex",
                    gap: "8px",
                    fontSize: "12px",
                  }}
                >
                  <span
                    style={{
                      padding: "2px 6px",
                      borderRadius: "4px",
                      background: "rgba(239, 68, 68, 0.1)",
                      color: "#ef4444",
                    }}
                  >
                    {dispute.type}
                  </span>
                  <span>
                    Amount: {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
                      Number(dispute.deal?.amount || 0) / 100,
                    )}
                  </span>
                </div>
              </div>
              <Link
                href={`/admin/disputes/${dispute.id}`}
                className="btn btn-primary"
                style={{ padding: "8px 16px", fontSize: "14px" }}
              >
                Resolve
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
