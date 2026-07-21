import { AdminService } from "@/services/admin.service";
import { Prisma } from "@prisma/client";
import { approveFlaggedApplication, rejectFlaggedApplication } from "../actions";
import { formatCurrency } from "@/lib/utils-client";
import Link from "next/link";
import EmptyState from "@/components/ui/EmptyState";
import { Button, Input } from "@/components/ui";

export const dynamic = "force-dynamic";

type FlaggedApp = Prisma.PromiseReturnType<
  typeof AdminService.getFlaggedApplications
>[number];

export default async function AdminApplicationsPage() {
  // Call service directly on the server — consistent with other admin pages; avoids loopback REST overhead
  const flaggedApps = await AdminService.getFlaggedApplications();

  return (
    <div className="admin-page admin-page-narrow">
      <header style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <h1 className="gradient-text" style={{ fontSize: "28px", fontWeight: 900, marginBottom: "8px" }}>
              🚩 Flagged Applications
            </h1>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
              Review campaign pitches flagged by the automated security risk engine.
            </p>
          </div>
          <Link href="/admin" className="btn btn-secondary" style={{ fontSize: "13px", padding: "8px 16px" }}>
            ← Admin Dashboard
          </Link>
        </div>
      </header>

      {/* Summary stats */}
      <div
        className="card"
        style={{
          padding: "16px 24px",
          marginBottom: "24px",
          display: "flex",
          gap: "32px",
          flexWrap: "wrap",
          background: "linear-gradient(135deg, rgba(239,68,68,0.04), rgba(245,158,11,0.04))",
          border: "1px solid rgba(239,68,68,0.15)",
        }}
      >
        <div>
          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
            Total Flagged
          </div>
          <div style={{ fontSize: "24px", fontWeight: 900, color: "var(--color-error)" }}>
            {flaggedApps.length}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
            Total Value at Risk
          </div>
          <div style={{ fontSize: "24px", fontWeight: 900, color: "var(--color-warning)" }}>
            {formatCurrency(
              flaggedApps.reduce((sum, app) => sum + (app.proposedRate || 0), 0)
            )}
          </div>
        </div>
      </div>

      {flaggedApps.length === 0 ? (
        <EmptyState
          emoji="🛡️"
          title="No Flagged Applications"
          description="All applications have passed the security risk check."
        />
      ) : (
        <div style={{ display: "grid", gap: "16px" }}>
          {flaggedApps.map((app: FlaggedApp) => {
            const approveAction = approveFlaggedApplication.bind(null, app.id);
            const rejectAction = async (formData: FormData) => {
              "use server";
              const reason =
                (formData.get("reason") as string) || "Security check failed";
              await rejectFlaggedApplication(app.id, reason);
            };

            let trustColor = "var(--color-success)";
            if (app.influencer.user.trustScore < 30) {
              trustColor = "var(--color-error)";
            } else if (app.influencer.user.trustScore < 60) {
              trustColor = "var(--color-warning)";
            }

            return (
              <div
                key={app.id}
                className="card"
                style={{
                  padding: "24px",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  background: "rgba(239, 68, 68, 0.02)",
                }}
              >
                {/* Header row */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "16px",
                    marginBottom: "16px",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "var(--radius-sm)",
                          background: "rgba(239,68,68,0.15)",
                          color: "var(--color-error)",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        FLAGGED
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                        {new Date(app.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <h3 style={{ fontWeight: 800, fontSize: "17px", color: "var(--color-text-primary)", marginBottom: "4px" }}>
                      {app.campaign.title}
                    </h3>
                    <p style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                      Brand: <strong>{app.campaign.brand?.companyName || "Unknown"}</strong>
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Proposed Rate</div>
                    <div style={{ fontWeight: 900, fontSize: "20px", color: "var(--color-accent-emerald)" }}>
                      {formatCurrency(app.proposedRate || 0)}
                    </div>
                  </div>
                </div>

                {/* Influencer info */}
                <div
                  style={{
                    padding: "12px 16px",
                    background: "var(--color-bg-tertiary)",
                    borderRadius: "var(--radius-md)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "12px",
                    marginBottom: "16px",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "2px" }}>
                      👤 {app.influencer.displayName}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", display: "flex", gap: "16px", flexWrap: "wrap" }}>
                      <span>{app.influencer.user.email}</span>
                      <span>
                        Trust Score:{" "}
                        <strong
                          style={{
                            color: trustColor,
                          }}
                        >
                          {app.influencer.user.trustScore}
                        </strong>
                      </span>
                    </div>
                  </div>
                  <Link
                    href={`/admin/users?search=${encodeURIComponent(app.influencer.user.email)}`}
                    className="btn btn-secondary"
                    style={{ fontSize: "12px", padding: "6px 14px" }}
                  >
                    View User Profile
                  </Link>
                </div>

                {/* Action buttons */}
                <div
                  style={{
                    borderTop: "1px solid var(--color-border)",
                    paddingTop: "16px",
                    display: "flex",
                    justifyContent: "flex-end",
                    alignItems: "center",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <form action={approveAction}>
                    <Button
                      type="submit"
                      variant="success"
                      style={{ padding: "8px 20px", fontSize: "13px" }}
                    >
                      ✓ Approve Application
                    </Button>
                  </form>

                  <form action={rejectAction} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <Input
                      type="text"
                      name="reason"
                      placeholder="Rejection reason (optional)..."
                      style={{ padding: "6px 12px", fontSize: "13px", width: "220px" }}
                    />
                    <Button
                      type="submit"
                      variant="danger"
                      style={{ padding: "8px 16px", fontSize: "13px" }}
                    >
                      ✕ Reject
                    </Button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
