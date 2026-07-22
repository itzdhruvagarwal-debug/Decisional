import { approveFlaggedApplication, rejectFlaggedApplication } from "./actions";
import { formatCurrency } from "@/lib/utils-client";
import { AdminService } from "@/services/admin.service";
import { Prisma } from "@prisma/client";
import VerificationQueue from "@/components/admin/VerificationQueue";
import EmptyState from "@/components/ui/EmptyState";
import { Button, Input } from "@/components/ui";
import { z } from "zod";

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
        <header className="mb-6">
          <h1 className="gradient-text" style={{ fontSize: "26px", fontWeight: 900, marginBottom: "6px" }}>
            Verification Queue
          </h1>
          <p className="text-secondary text-sm">
            Manage and review pending KYC requests from influencers and brands.
          </p>
        </header>

        <VerificationQueue pendingUsers={pendingUsers} />
      </section>

      {/* 2. Flagged Applications Section */}
      <section>
        <header className="mb-6">
          <h1 className="gradient-text" style={{ fontSize: "26px", fontWeight: 900, marginBottom: "6px" }}>
            Flagged Applications Review
          </h1>
          <p className="text-secondary text-sm">
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
          <div className="grid gap-4">
            {flaggedApps.map((app: FlaggedAppElement) => {
              const approveAction = approveFlaggedApplication.bind(null, app.id);
              const rejectAction = async (formData: FormData) => {
                "use server";
                const rawReason = formData.get("reason") as string || "";
                const reason = z.string().max(200, "Reason must be less than 200 characters").default("Security check failed").parse(rawReason);
                await rejectFlaggedApplication(app.id, reason);
              };

              return (
                <div
                  key={app.id}
                  className="card p-6 flex flex-col gap-4" style={{ border: "1px solid rgba(239, 68, 68, 0.2)", background: "rgba(239, 68, 68, 0.02)" }}
                >
                  <div className="flex justify-between flex-wrap gap-4">
                    <div>
                      <h4 className="font-extrabold text-base mb-1" style={{ color: "var(--color-text-primary)" }}>
                        {app.campaign.title}
                      </h4>
                      <p className="text-sm text-secondary">
                        Brand: <strong>{app.campaign.brand?.companyName || "Unknown Brand"}</strong>
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="text-muted" style={{ fontSize: "11px" }}>Proposed Rate</div>
                      <div className="font-extrabold text-base" style={{ color: "var(--color-accent-emerald)" }}>
                        {formatCurrency(app.proposedRate || 0)}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center flex-wrap gap-4" style={{ borderTop: "1px solid var(--color-border)", paddingTop: "16px" }}>
                    <div>
                      <div className="text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>
                        Influencer: {app.influencer.displayName}
                      </div>
                      <div className="text-xs text-secondary flex gap-3" style={{ marginTop: "2px" }}>
                        <span>Email: {app.influencer.user.email}</span>
                        <span>Trust Score: <strong style={{ color: "var(--color-accent-amber)" }}>{app.influencer.user.trustScore}</strong></span>
                      </div>
                    </div>

                    <div className="flex gap-3 items-center">
                      <form action={approveAction}>
                        <Button type="submit" variant="success" className="text-sm" style={{ padding: "8px 16px" }}>
                          Approve Application
                        </Button>
                      </form>

                      <form action={rejectAction} className="flex gap-2 items-center">
                        <Input
                          type="text"
                          name="reason"
                          placeholder="Rejection reason..."
                          className="text-sm" style={{ padding: "6px 12px", width: "180px" }}
                        />
                        <Button type="submit" variant="danger" className="text-sm" style={{ padding: "8px 16px" }}>
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
