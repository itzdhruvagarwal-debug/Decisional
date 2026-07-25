import { AdminService } from "@/services/admin.service";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import EmptyState from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

async function getViolations() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const violations = await AdminService.listViolations();
  return violations;
}

function getSeverityVariant(severity: string): "danger" | "warning" | "success" | "ghost" {
  switch (severity) {
    case "CRITICAL":
    case "HIGH":
      return "danger";
    case "MEDIUM":
      return "warning";
    case "LOW":
      return "success";
    default:
      return "ghost";
  }
}

function getActionVariant(action: string): "danger" | "warning" | "ghost" {
  switch (action) {
    case "PERMANENT_BAN":
      return "danger";
    case "TEMP_SUSPENSION":
      return "warning";
    default:
      return "ghost";
  }
}

export default async function AdminViolationsPage() {
  const violations = await getViolations();

  return (
    <div className="admin-page">
      <div className="admin-toolbar mb-6">
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
        <div className="card overflow-hidden p-0">
          <div className="admin-table-wrap">
            <table className="w-full border-collapse" aria-label="User violations list">
              <thead>
                <tr className="bg-secondary">
                  {["User", "Type", "Severity", "Action", "Description", "Date", "Expires"].map(
                    (heading) => (
                      <th
                        key={heading}
                        scope="col"
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
                  const name =
                    violation.user.influencerProfile?.displayName ||
                    violation.user.brandProfile?.companyName ||
                    violation.user.email;

                  return (
                    <tr key={violation.id} className="border-b-card">
                      <td className="p-card">
                        <div className="font-extrabold">{name}</div>
                        <div className="text-muted text-xs mt-1">
                          {violation.user.email} ({violation.user.userType})
                        </div>
                      </td>
                      <td className="p-card font-bold">
                        {violation.type}
                      </td>
                      <td className="p-card">
                        <Badge variant={getSeverityVariant(violation.severity)} className="font-extrabold text-xs uppercase">
                          {violation.severity}
                        </Badge>
                      </td>
                      <td className="p-card">
                        <Badge variant={getActionVariant(violation.action)} className="font-extrabold text-xs uppercase">
                          {violation.action}
                        </Badge>
                      </td>
                      <td className="p-card text-sm text-primary">
                        <div className="overflow-hidden whitespace-nowrap max-w-240 text-ellipsis" title={violation.description}>
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
