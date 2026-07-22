import { AdminService } from "@/services/admin.service";
import { Prisma } from "@prisma/client";
import { approveFlaggedApplication, rejectFlaggedApplication } from "../actions";
import { formatCurrency } from "@/lib/utils-client";
import { z } from "zod";
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
      <header className="mb-8">
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <h1 className="gradient-text mb-2 text-3xl font-extrabold">
              🚩 Flagged Applications
            </h1>
            <p className="text-secondary text-sm">
              Review campaign pitches flagged by the automated security risk engine.
            </p>
          </div>
          <Link href="/admin" className="btn btn-secondary text-sm" style={{ padding: "8px 16px" }}>
            ← Admin Dashboard
          </Link>
        </div>
      </header>

      {/* Summary stats */}
      <div
        className="card mb-6 flex gap-8 flex-wrap" style={{ padding: "16px 24px", background: "linear-gradient(135deg, rgba(239,68,68,0.04), rgba(245,158,11,0.04))", border: "1px solid rgba(239,68,68,0.15)" }}
      >
        <div>
          <div className="text-muted font-bold text-xs uppercase">
            Total Flagged
          </div>
          <div className="text-2xl font-extrabold" style={{ color: "var(--color-error)" }}>
            {flaggedApps.length}
          </div>
        </div>
        <div>
          <div className="text-muted font-bold text-xs uppercase">
            Total Value at Risk
          </div>
          <div className="text-2xl font-extrabold" style={{ color: "var(--color-warning)" }}>
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
        <div className="grid gap-4">
          {flaggedApps.map((app: FlaggedApp) => {
            const approveAction = approveFlaggedApplication.bind(null, app.id);
            const rejectAction = async (formData: FormData) => {
              "use server";
              const rawReason = (formData.get("reason") as string) || "";
              const reason = z.string().max(200, "Reason must be less than 200 characters").default("Security check failed").parse(rawReason);
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
                className="card p-6" style={{ border: "1px solid rgba(239, 68, 68, 0.2)", background: "rgba(239, 68, 68, 0.02)" }}
              >
                {/* Header row */}
                <div
                  className="flex justify-between flex-wrap gap-4 mb-4"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="font-bold rounded-sm uppercase" style={{ fontSize: "10px", padding: "2px 8px", background: "rgba(239,68,68,0.15)", color: "var(--color-error)", letterSpacing: "0.05em" }}
                      >
                        FLAGGED
                      </span>
                      <span className="text-muted text-xs">
                        {new Date(app.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <h3 className="font-extrabold mb-1" style={{ fontSize: "17px", color: "var(--color-text-primary)" }}>
                      {app.campaign.title}
                    </h3>
                    <p className="text-sm text-secondary">
                      Brand: <strong>{app.campaign.brand?.companyName || "Unknown"}</strong>
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-muted text-xs">Proposed Rate</div>
                    <div className="text-xl font-extrabold text-emerald">
                      {formatCurrency(app.proposedRate || 0)}
                    </div>
                  </div>
                </div>

                {/* Influencer info */}
                <div
                  className="flex justify-between items-center flex-wrap gap-3 mb-4 bg-tertiary rounded-md border-card" style={{ padding: "12px 16px" }}
                >
                  <div>
                    <div className="font-bold text-sm" style={{ marginBottom: "2px" }}>
                      👤 {app.influencer.displayName}
                    </div>
                    <div className="text-xs text-secondary flex gap-4 flex-wrap">
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
                    className="btn btn-secondary text-xs" style={{ padding: "6px 14px" }}
                  >
                    View User Profile
                  </Link>
                </div>

                {/* Action buttons */}
                <div
                  className="flex justify-end items-center gap-3 flex-wrap border-top" style={{ paddingTop: "16px" }}
                >
                  <form action={approveAction}>
                    <Button
                      type="submit"
                      variant="success"
                      className="text-sm" style={{ padding: "8px 20px" }}
                    >
                      ✓ Approve Application
                    </Button>
                  </form>

                  <form action={rejectAction} className="flex gap-2 items-center">
                    <Input
                      type="text"
                      name="reason"
                      placeholder="Rejection reason (optional)..."
                      className="text-sm" style={{ padding: "6px 12px", width: "220px" }}
                    />
                    <Button
                      type="submit"
                      variant="danger"
                      className="text-sm" style={{ padding: "8px 16px" }}
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
