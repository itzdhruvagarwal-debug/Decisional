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
          <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
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
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="admin-table-wrap">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--color-bg-secondary)" }}>
                  {["Actor ID", "Action Type", "Entity Type", "Entity ID", "Timestamp", "Details"].map(
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
                {auditLogs.map((log) => {
                  const badgeStyle = getEntityTypeBadgeStyle(log.entityType);
                  return (
                    <tr key={log.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "16px 18px", color: "var(--color-text-secondary)", fontSize: "13px" }}>
                        {log.actorId}
                      </td>
                      <td style={{ padding: "16px 18px", fontWeight: 800 }}>
                        {log.actionType}
                      </td>
                      <td style={{ padding: "16px 18px" }}>
                        <span
                          className="badge"
                          style={{
                            background: badgeStyle.background,
                            color: badgeStyle.color,
                            fontSize: "11px",
                            fontWeight: 800,
                            padding: "4px 8px",
                            borderRadius: "12px",
                            textTransform: "uppercase",
                          }}
                        >
                          {log.entityType}
                        </span>
                      </td>
                      <td style={{ padding: "16px 18px", color: "var(--color-text-secondary)", fontSize: "13px" }}>
                        {log.entityId || "-"}
                      </td>
                      <td style={{ padding: "16px 18px", color: "var(--color-text-secondary)", fontSize: "13px" }}>
                        {new Date(log.timestamp).toLocaleString("en-IN")}
                      </td>
                      <td style={{ padding: "16px 18px" }}>
                        <div style={{ fontSize: "13px", color: "var(--color-text-primary)", maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={log.beforeJSON || log.afterJSON ? JSON.stringify({ before: log.beforeJSON, after: log.afterJSON }) : ""}>
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
