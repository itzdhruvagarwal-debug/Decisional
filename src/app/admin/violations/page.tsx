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
          <h1 className="text-3xl font-extrabold mb-1">
            User Violations
          </h1>
          <p className="text-secondary text-sm">
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
        <div className="card overflow-hidden" style={{ padding: 0 }}>
          <div className="admin-table-wrap">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="bg-secondary">
                  {["User", "Type", "Severity", "Action", "Description", "Date", "Expires"].map(
                    (heading) => (
                      <th
                        key={heading}
                        className="text-left border-b-card text-muted text-xs font-extrabold uppercase" style={{ padding: "14px 18px" }}
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
                    <tr key={violation.id} className="border-b-card">
                      <td className="p-card">
                        <div className="font-extrabold">{name}</div>
                        <div className="text-muted text-xs" style={{ marginTop: "2px" }}>
                          {violation.user.email} ({violation.user.userType})
                        </div>
                      </td>
                      <td className="p-card font-bold">
                        {violation.type}
                      </td>
                      <td className="p-card">
                        <span
                          className="badge font-extrabold text-xs rounded-lg uppercase" style={{ background: severityStyle.background, color: severityStyle.color, padding: "4px 8px" }}
                        >
                          {violation.severity}
                        </span>
                      </td>
                      <td className="p-card">
                        <span
                          className="badge font-extrabold text-xs uppercase" style={{ background: actionStyle.background, color: actionStyle.color, padding: "4px 8px", borderRadius: "6px" }}
                        >
                          {violation.action}
                        </span>
                      </td>
                      <td className="p-card text-sm" style={{ color: "var(--color-text-primary)" }}>
                        <div className="overflow-hidden" style={{ maxWidth: "240px", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={violation.description}>
                          {violation.description}
                        </div>
                      </td>
                      <td className="p-card text-secondary text-sm">
                        {new Date(violation.createdAt).toLocaleDateString("en-IN")}
                      </td>
                      <td className="p-card text-secondary text-sm">
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
