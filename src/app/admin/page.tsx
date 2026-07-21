import { approveFlaggedApplication, rejectFlaggedApplication } from "./actions";
import { formatCurrency } from "@/lib/utils-client";
import { AdminService } from "@/services/admin.service";
import { Prisma } from "@prisma/client";
import VerificationQueue from "@/components/admin/VerificationQueue";
import EmptyState from "@/components/ui/EmptyState";
import { Button, Input } from "@/components/ui";

type FlaggedAppElement = Prisma.PromiseReturnType<typeof AdminService.getFlaggedApplications>[number];

export const dynamic = "force-dynamic";

export default async function VerifiedQueuePage() {
  // Call service methods directly on the server to prevent port-binding failures and loopback request overhead
  const [pendingUsers, flaggedApps] = await Promise.all([
    AdminService.getVerificationQueue(),
    AdminService.getFlaggedApplications(),
  ]);

  return (
    <div className="admin-page">
      {/* 1. Verification Queue Section */}
      <section style={{ marginBottom: "48px" }}>
        <header style={{ marginBottom: "24px" }}>
          <h1 className="gradient-text" style={{ fontSize: "26px", fontWeight: 900, marginBottom: "6px" }}>
            Verification Queue
          </h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
            Manage and review pending KYC requests from influencers and brands.
          </p>
        </header>

        <VerificationQueue pendingUsers={pendingUsers} />
      </section>

      {/* 2. Flagged Applications Section */}
      <section>
        <header style={{ marginBottom: "24px" }}>
          <h1 className="gradient-text" style={{ fontSize: "26px", fontWeight: 900, marginBottom: "6px" }}>
            Flagged Applications Review
          </h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
            Review campaign pitches flagged by the security risk engine.
          </p>
        </header>

        {flaggedApps.length === 0 ? (
          <EmptyState
            emoji="🛡️"
            title="No Flagged Applications"
            description="All applications are verified and safe."
            compact
          />
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
            {flaggedApps.map((app: FlaggedAppElement) => {
              const approveAction = approveFlaggedApplication.bind(null, app.id);
              const rejectAction = async (formData: FormData) => {
                "use server";
                const reason = formData.get("reason") as string || "Security check failed";
                await rejectFlaggedApplication(app.id, reason);
              };

              return (
                <div
                  key={app.id}
                  className="card"
                  style={{
                    padding: "24px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    background: "rgba(239, 68, 68, 0.02)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
                    <div>
                      <h4 style={{ fontWeight: 800, fontSize: "16px", color: "var(--color-text-primary)", marginBottom: "4px" }}>
                        {app.campaign.title}
                      </h4>
                      <p style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
                        Brand: <strong>{app.campaign.brand?.companyName || "Unknown Brand"}</strong>
                      </p>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Proposed Rate</div>
                      <div style={{ fontWeight: 800, fontSize: "16px", color: "var(--color-accent-emerald)" }}>
                        {formatCurrency(app.proposedRate || 0)}
                      </div>
                    </div>
                  </div>

                  <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
                    <div>
                      <div style={{ fontSize: "13px", color: "var(--color-text-primary)", fontWeight: 700 }}>
                        Influencer: {app.influencer.displayName}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", display: "flex", gap: "12px", marginTop: "2px" }}>
                        <span>Email: {app.influencer.user.email}</span>
                        <span>Trust Score: <strong style={{ color: "var(--color-accent-amber)" }}>{app.influencer.user.trustScore}</strong></span>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      <form action={approveAction}>
                        <Button type="submit" variant="success" style={{ padding: "8px 16px", fontSize: "13px" }}>
                          Approve Application
                        </Button>
                      </form>

                      <form action={rejectAction} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <Input
                          type="text"
                          name="reason"
                          placeholder="Rejection reason..."
                          style={{
                            padding: "6px 12px",
                            fontSize: "13px",
                            width: "180px",
                          }}
                        />
                        <Button type="submit" variant="danger" style={{ padding: "8px 16px", fontSize: "13px" }}>
                          Reject
                        </Button>
                      </form>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
