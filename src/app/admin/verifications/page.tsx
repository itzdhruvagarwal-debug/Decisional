import Link from "next/link";
import { AdminService } from "@/services/admin.service";

export const dynamic = "force-dynamic";

export default async function VerifiedQueuePage() {
  // Call service directly on the server to prevent port-binding failures and loopback request overhead
  const pendingUsers = await AdminService.getVerificationQueue();

  return (
    <div className="admin-page admin-page-narrow">
      <header style={{ marginBottom: "32px" }}>
        <h1 className="gradient-text" style={{ fontSize: "28px", fontWeight: 900, marginBottom: "8px" }}>
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
            padding: "80px 40px",
            textAlign: "center",
            background: "rgba(16, 185, 129, 0.03)",
            borderColor: "rgba(16, 185, 129, 0.1)",
          }}
        >
          <div style={{ fontSize: "40px", marginBottom: "16px" }}>✅</div>
          <h3 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "8px" }}>All Caught Up!</h3>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
            There are no pending verification requests at this moment.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "16px" }}>
          {pendingUsers.map((user) => {
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

                <div
                  style={{ display: "flex", gap: "24px", alignItems: "center" }}
                >
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
    </div>
  );
}
