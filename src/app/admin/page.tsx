import Link from "next/link";
import { approveFlaggedApplication, rejectFlaggedApplication } from "./actions";
import { formatCurrency } from "@/lib/utils-client";
import { AdminService } from "@/services/admin.service";

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

        {pendingUsers.length === 0 ? (
          <div
            className="card"
            style={{
              padding: "48px 24px",
              textAlign: "center",
              background: "rgba(16, 185, 129, 0.03)",
              borderColor: "rgba(16, 185, 129, 0.1)",
            }}
          >
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>✅</div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "6px" }}>All Caught Up!</h3>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "13px" }}>
              There are no pending verification requests at this moment.
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {pendingUsers.map((user: any) => {
              const name =
                user.influencerProfile?.displayName ||
                user.brandProfile?.companyName ||
                "Unknown User";

              return (
                <div
                  key={user.id}
                  className="card hover-lift"
                  style={{
                    padding: "20px 24px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "16px",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                    <div className="avatar" style={{ background: user.userType === "BRAND" ? "var(--color-secondary)" : "var(--gradient-primary)" }}>
                      {name[0]}
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: "16px", color: "var(--color-text-primary)" }}>
                        {name}
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--color-text-secondary)",
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <span className="badge badge-primary" style={{ fontSize: "9px", padding: "2px 8px" }}>{user.userType}</span>
                        <span>{user.email}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Tax</div>
                      <div style={{ fontWeight: 700, fontSize: "13px" }}>
                        {user.taxCompliance?.panLast4 ? (
                          <span style={{ color: "var(--color-accent-emerald)" }}>
                            PAN ****{user.taxCompliance.panLast4}
                          </span>
                        ) : (
                          <span style={{ color: "var(--color-accent-rose)" }}>
                            PAN missing
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Documents</div>
                      <div style={{ fontWeight: 700, fontSize: "13px" }}>
                        {user.verificationDocs.length > 0 ? (
                          <span style={{ color: "var(--color-accent-emerald)" }}>{user.verificationDocs.length} Attached ✅</span>
                        ) : (
                          <span style={{ color: "var(--color-accent-amber)" }}>0 Attached ⚠️</span>
                        )}
                      </div>
                    </div>

                    <Link
                      href={`/admin/verifications/${user.id}`}
                      className="btn btn-primary"
                      style={{ padding: "8px 24px" }}
                    >
                      Review
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
          <div
            className="card"
            style={{
              padding: "48px 24px",
              textAlign: "center",
              background: "rgba(16, 185, 129, 0.03)",
              borderColor: "rgba(16, 185, 129, 0.1)",
            }}
          >
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>🛡️</div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "6px" }}>No Flagged Applications</h3>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "13px" }}>
              All applications are verified and safe.
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "16px" }}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {flaggedApps.map((app: any) => {
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
                        <button type="submit" className="btn btn-success" style={{ padding: "8px 16px", fontSize: "13px" }}>
                          Approve Application
                        </button>
                      </form>

                      <form action={rejectAction} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <input
                          type="text"
                          name="reason"
                          placeholder="Rejection reason..."
                          className="input"
                          style={{
                            padding: "6px 12px",
                            fontSize: "13px",
                            background: "var(--color-bg-primary)",
                            border: "1px solid var(--color-border)",
                            borderRadius: "8px",
                            width: "180px",
                          }}
                        />
                        <button type="submit" className="btn btn-danger" style={{ padding: "8px 16px", fontSize: "13px" }}>
                          Reject
                        </button>
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
