import { AdminService } from "@/services/admin.service";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import EmptyState from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

async function getViolations() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const violations = await AdminService.listViolations();
  return violations;
}

function getSeverityStyle(severity: string) {
  switch (severity) {
    case "CRITICAL":
      return { background: "rgba(239, 68, 68, 0.15)", color: "#f87171" };
    case "HIGH":
      return { background: "rgba(249, 115, 22, 0.15)", color: "#fb923c" };
    case "MEDIUM":
      return { background: "rgba(234, 179, 8, 0.15)", color: "#facc15" };
    case "LOW":
      return { background: "rgba(34, 197, 94, 0.15)", color: "#4ade80" };
    default:
      return { background: "rgba(107, 114, 128, 0.15)", color: "#9ca3af" };
  }
}

function getActionStyle(action: string) {
  switch (action) {
    case "PERMANENT_BAN":
      return { background: "var(--color-error)", color: "white" };
    case "TEMP_SUSPENSION":
      return { background: "rgba(249, 115, 22, 0.8)", color: "white" };
    case "WARNING":
      return { background: "rgba(234, 179, 8, 0.8)", color: "white" };
    default:
      return { background: "rgba(107, 114, 128, 0.8)", color: "white" };
  }
}

export default async function AdminViolationsPage() {
  const violations = await getViolations();

  return (
    <div className="admin-page">
      <div className="admin-toolbar" style={{ marginBottom: "28px" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 900, marginBottom: "6px" }}>
            User Violations
          </h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
            View all user violations and enforcement actions.
          </p>
        </div>
      </div>

      {violations.length === 0 ? (
        <EmptyState
          emoji="✔"
          title="No Violations"
          description="No violations have been recorded yet."
        />
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="admin-table-wrap">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--color-bg-secondary)" }}>
                  {["User", "Type", "Severity", "Action", "Description", "Date", "Expires"].map(
                    (heading) => (
                      <th
                        key={heading}
                        style={{
                          padding: "14px 18px",
                          textAlign: "left",
                          borderBottom: "1px solid var(--color-border)",
                          color: "var(--color-text-muted)",
                          fontSize: "12px",
                          fontWeight: 800,
                          textTransform: "uppercase",
                        }}
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {violations.map((violation) => {
                  const severityStyle = getSeverityStyle(violation.severity);
                  const actionStyle = getActionStyle(violation.action);
                  const name =
                    violation.user.influencerProfile?.displayName ||
                    violation.user.brandProfile?.companyName ||
                    violation.user.email;

                  return (
                    <tr key={violation.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "16px 18px" }}>
                        <div style={{ fontWeight: 800 }}>{name}</div>
                        <div style={{ color: "var(--color-text-muted)", fontSize: "12px", marginTop: "2px" }}>
                          {violation.user.email} ({violation.user.userType})
                        </div>
                      </td>
                      <td style={{ padding: "16px 18px", fontWeight: 700 }}>
                        {violation.type}
                      </td>
                      <td style={{ padding: "16px 18px" }}>
                        <span
                          className="badge"
                          style={{
                            background: severityStyle.background,
                            color: severityStyle.color,
                            fontSize: "11px",
                            fontWeight: 800,
                            padding: "4px 8px",
                            borderRadius: "12px",
                            textTransform: "uppercase",
                          }}
                        >
                          {violation.severity}
                        </span>
                      </td>
                      <td style={{ padding: "16px 18px" }}>
                        <span
                          className="badge"
                          style={{
                            background: actionStyle.background,
                            color: actionStyle.color,
                            fontSize: "11px",
                            fontWeight: 800,
                            padding: "4px 8px",
                            borderRadius: "6px",
                            textTransform: "uppercase",
                          }}
                        >
                          {violation.action}
                        </span>
                      </td>
                      <td style={{ padding: "16px 18px", color: "var(--color-text-primary)", fontSize: "13px" }}>
                        <div style={{ maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={violation.description}>
                          {violation.description}
                        </div>
                      </td>
                      <td style={{ padding: "16px 18px", color: "var(--color-text-secondary)", fontSize: "13px" }}>
                        {new Date(violation.createdAt).toLocaleDateString("en-IN")}
                      </td>
                      <td style={{ padding: "16px 18px", color: "var(--color-text-secondary)", fontSize: "13px" }}>
                        {violation.expiresAt
                          ? new Date(violation.expiresAt).toLocaleDateString("en-IN")
                          : "Never"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
