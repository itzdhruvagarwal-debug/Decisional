import { AdminService } from "@/services/admin.service";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import EmptyState from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

async function getAuditLogs() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const auditLogs = await AdminService.listAuditLogs();
  return auditLogs;
}

function getEntityTypeBadgeStyle(entityType: string) {
  switch (entityType) {
    case "USER":
      return { background: "rgba(59, 130, 246, 0.15)", color: "#60a5fa" };
    case "DEAL":
      return { background: "rgba(168, 85, 247, 0.15)", color: "#c084fc" };
    case "CAMPAIGN":
      return { background: "rgba(34, 197, 94, 0.15)", color: "#4ade80" };
    case "APPLICATION":
      return { background: "rgba(234, 179, 8, 0.15)", color: "#facc15" };
    case "WALLET":
      return { background: "rgba(236, 72, 153, 0.15)", color: "#f472b6" };
    default:
      return { background: "rgba(107, 114, 128, 0.15)", color: "#9ca3af" };
  }
}

export default async function AdminAuditLogsPage() {
  const auditLogs = await getAuditLogs();

  return (
    <div className="admin-page">
      <div className="admin-toolbar" style={{ marginBottom: "28px" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 900, marginBottom: "6px" }}>
            Audit Logs
          </h1>
          <p className="text-secondary text-sm">
            View all system activity and administrative actions.
          </p>
        </div>
      </div>

      {auditLogs.length === 0 ? (
        <EmptyState
          emoji="📋"
          title="No Audit Logs"
          description="No activity has been logged yet."
        />
      ) : (
        <div className="card overflow-hidden" style={{ padding: 0 }}>
          <div className="admin-table-wrap">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--color-bg-secondary)" }}>
                  {["Actor ID", "Action Type", "Entity Type", "Entity ID", "Timestamp", "Details"].map(
                    (heading) => (
                      <th
                        key={heading}
                        className="text-left border-b-card text-muted text-xs font-extrabold" style={{ padding: "14px 18px", textTransform: "uppercase" }}
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => {
                  const badgeStyle = getEntityTypeBadgeStyle(log.entityType);
                  return (
                    <tr key={log.id} className="border-b-card">
                      <td className="p-card text-secondary text-sm">
                        {log.actorId}
                      </td>
                      <td className="p-card font-extrabold">
                        {log.actionType}
                      </td>
                      <td className="p-card">
                        <span
                          className="badge font-extrabold" style={{ background: badgeStyle.background, color: badgeStyle.color, fontSize: "11px", padding: "4px 8px", borderRadius: "12px", textTransform: "uppercase" }}
                        >
                          {log.entityType}
                        </span>
                      </td>
                      <td className="p-card text-secondary text-sm">
                        {log.entityId || "-"}
                      </td>
                      <td className="p-card text-secondary text-sm">
                        {new Date(log.timestamp).toLocaleString("en-IN")}
                      </td>
                      <td className="p-card">
                        <div className="text-sm overflow-hidden" style={{ color: "var(--color-text-primary)", maxWidth: "240px", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={log.beforeJSON || log.afterJSON ? JSON.stringify({ before: log.beforeJSON, after: log.afterJSON }) : ""}>
                          {log.beforeJSON || log.afterJSON ? JSON.stringify({ before: log.beforeJSON, after: log.afterJSON }) : "-"}
                        </div>
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
