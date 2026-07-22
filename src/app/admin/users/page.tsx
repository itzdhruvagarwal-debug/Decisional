import { banUser, unbanUser, awardBadgeAction } from "../actions";
import Link from "next/link";
import Image from "next/image";
import { AdminService } from "@/services/admin.service";
import { Prisma } from "@prisma/client";
import EmptyState from "@/components/ui/EmptyState";
import { Button, Input, Select } from "@/components/ui";
import { z } from "zod";

export const adminUserFilterSchema = z.object({
  search: z.string().optional(),
  type: z.enum(["ALL", "INFLUENCER", "BRAND"]),
  status: z.enum(["ALL", "ACTIVE", "PENDING_VERIFICATION", "SUSPENDED", "BANNED", "FLAGGED"]),
});

export const awardBadgeSchema = z.object({
  badgeId: z.enum(["beta_tester", "mystery_badge", "bug_reporter", "feedback_giver"]),
  userId: z.string().uuid(),
});

export type AdminUserListElement = Prisma.PromiseReturnType<typeof AdminService.listUsers>["users"][number];

export const dynamic = "force-dynamic";

function getParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function statusColor(status: string) {
  if (status === "ACTIVE") return "var(--color-success)";
  if (status === "BANNED" || status === "SUSPENDED") return "var(--color-error)";
  return "var(--color-warning)";
}

interface TaxComplianceUser {
  userType: string;
  taxCompliance?: {
    panLast4?: string | null;
    eInvoiceApplicable?: boolean | null;
    status?: string | null;
    gstinLast4?: string | null;
  } | null;
}

function taxStatusLabel(user: TaxComplianceUser) {
  if (user.userType === "ADMIN") return "Not applicable";
  const tax = user.taxCompliance;
  if (!tax?.panLast4) return "PAN missing";
  if (user.userType === "BRAND" && tax.eInvoiceApplicable) return "E-invoice";
  if (tax.status === "READY") return "Ready";
  return tax.status ? tax.status.toLowerCase().replaceAll("_", " ") : "Pending";
}

function taxStatusColor(user: TaxComplianceUser) {
  if (user.userType === "ADMIN") return "var(--color-text-muted)";
  const tax = user.taxCompliance;
  if (!tax?.panLast4) return "var(--color-error)";
  if (tax.status === "READY") return "var(--color-success)";
  return "var(--color-warning)";
}

export default async function AdminUsersPage({
  searchParams,
}: {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) || {};
  const query = (getParam(params, "search") || getParam(params, "q"))?.trim() || "";
  const userType = getParam(params, "type") || "ALL";
  const status = getParam(params, "status") || "ALL";
  const page = Math.max(1, Number(getParam(params, "page") || 1));
  const limit = 50;

  // Call AdminService directly on the server to prevent port-binding failures and loopback request overhead
  const listParams: {
    page: number;
    limit: number;
    search?: string;
    userType?: string;
    status?: string;
  } = { page, limit };
  if (query) listParams.search = query;
  if (userType !== "ALL") listParams.userType = userType;
  if (status !== "ALL") listParams.status = status;

  const { users, total } = await AdminService.listUsers(listParams);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="admin-page">
      <div className="admin-toolbar">
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 900, marginBottom: "6px" }}>
            User Management
          </h1>
          <p className="text-secondary text-sm">
            Search, review, ban, and reactivate platform accounts.
          </p>
        </div>
        <div className="card" style={{ padding: "12px 16px", minWidth: "180px" }}>
          <div className="text-muted text-xs">
            Matching users
          </div>
          <div style={{ fontSize: "22px", fontWeight: 900 }}>{total}</div>
        </div>
      </div>

      <form className="card admin-filter-row" style={{ padding: "14px", marginBottom: "18px" }}>
        <Input
          name="search"
          placeholder="Search name, email, or phone"
          defaultValue={query}
          style={{ minWidth: "260px", flex: "1 1 320px" }}
        />
        <Select name="type" defaultValue={userType} style={{ width: "180px" }}>
          <option value="ALL">All roles</option>
          <option value="INFLUENCER">Influencers</option>
          <option value="BRAND">Brands</option>
        </Select>
        <Select name="status" defaultValue={status} style={{ width: "200px" }}>
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="PENDING_VERIFICATION">Pending verification</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="BANNED">Banned</option>
          <option value="FLAGGED">Flagged</option>
        </Select>
        <Button type="submit" variant="primary">
          Apply
        </Button>
      </form>

      <div className="card overflow-hidden" style={{ padding: 0 }}>
        {users.length === 0 ? (
          <EmptyState
            emoji="👤"
            title="No Users Found"
            description="Try changing the search query or status filters."
          />
        ) : (
          <div className="admin-table-wrap">
            <table className="w-full" style={{ minWidth: "960px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--color-bg-secondary)" }}>
                  {["User", "Role", "Status", "Tax", "Trust", "Joined", "Action"].map(
                    (heading) => (
                      <th
                        key={heading}
                        className="border-b-card text-muted text-xs font-extrabold" style={{ padding: "14px 18px", textAlign: (
                            {
                              Action: "right", Trust: "center"
                            } as const
                          )[heading as "Action" | "Trust"] || "left", textTransform: "uppercase" }}
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {users.map((user: AdminUserListElement) => {
                  const name =
                    user.influencerProfile?.displayName ||
                    user.brandProfile?.companyName ||
                    (user.userType === "ADMIN"
                      ? user.email?.split("@")[0]
                      : null) ||
                    "Unknown user";
                  const avatar =
                    user.influencerProfile?.avatar || user.brandProfile?.logo;
                  const isBanned = user.status === "BANNED";

                  return (
                    <tr key={user.id} className="border-b-card">
                      <td className="p-card">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex items-center justify-center relative overflow-hidden" style={{ width: "42px", height: "42px", borderRadius: "50%", background: "var(--gradient-primary)", color: "white", fontWeight: 900 }}
                          >
                            {avatar ? (
                              <Image
                                src={avatar}
                                alt=""
                                fill
                                unoptimized
                                className="object-cover"
                              />
                            ) : (
                              name.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div className="font-extrabold">{name}</div>
                            <div className="text-muted text-xs">
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-card">
                        <span className="badge badge-primary">{user.userType}</span>
                      </td>
                      <td className="p-card">
                        <span
                          className="badge"
                          style={{
                            background: statusColor(user.status),
                            color: "white",
                            textTransform: "capitalize",
                          }}
                        >
                          {user.status.toLowerCase().replaceAll("_", " ")}
                        </span>
                      </td>
                      <td className="p-card">
                        <span
                          className="badge"
                          style={{
                            background: taxStatusColor(user),
                            color: "white",
                            textTransform: "capitalize",
                          }}
                        >
                          {taxStatusLabel(user)}
                        </span>
                        {user.taxCompliance?.gstinLast4 && (
                          <div className="text-muted mt-1" style={{ fontSize: "11px" }}>
                            GST ****{user.taxCompliance.gstinLast4}
                          </div>
                        )}
                      </td>
                      <td className="p-card text-center" style={{ fontWeight: 900 }}>
                        {user.trustScore}
                        <span className="text-muted" style={{ fontSize: "11px" }}>
                          /900
                        </span>
                      </td>
                      <td className="p-card text-muted text-sm">
                        {new Date(user.createdAt).toLocaleDateString("en-IN")}
                      </td>
                      <td className="p-card text-right">
                        <div className="flex justify-end items-center gap-2">
                          {user.userType !== "ADMIN" && (
            <form action={awardBadgeAction} className="inline-flex gap-1">
              <input type="hidden" name="userId" value={user.id} />
              <Select
                name="badgeId"
                className="text-xs" style={{ padding: "2px 6px", width: "140px", height: "30px" }}
                defaultValue=""
                required
              >
                <option value="" disabled>Award Badge...</option>
                <option value="beta_tester">🔭 Beta Tester</option>
                <option value="mystery_badge">❓ Mystery Badge</option>
                <option value="bug_reporter">🐛 Bug Hunter</option>
                <option value="feedback_giver">💡 Idea Generator</option>
              </Select>
              <Button
                variant="primary"
                size="sm"
                type="submit"
                style={{ height: "30px", padding: "0 8px" }}
              >
                Grant
              </Button>
            </form>
          )}
                          {user.userType !== "ADMIN" && (
                            <>
                              {user.status === "FLAGGED" && (
                                <form action={unbanUser.bind(null, user.id)}>
                                  <Button variant="success" size="sm" type="submit" style={{ height: "30px" }}>
                                    Approve (Activate)
                                  </Button>
                                </form>
                              )}
                              {isBanned ? (
                                <form action={unbanUser.bind(null, user.id)}>
                                  <Button variant="secondary" size="sm" type="submit" style={{ height: "30px" }}>
                                    Unban
                                  </Button>
                                </form>
                              ) : (
                                <form action={banUser.bind(null, user.id)}>
                                  <Button variant="danger" size="sm" type="submit" style={{ height: "30px" }}>
                                    Ban
                                  </Button>
                                </form>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div
        className="flex justify-between items-center mt-4 text-muted text-sm"
      >
        <div className="flex gap-2">
          <Link
            href={`/admin/users?page=${page - 1}&search=${encodeURIComponent(query)}&type=${userType}&status=${status}`}
            className={`btn btn-secondary btn-sm`}
            style={{ pointerEvents: page <= 1 ? "none" : "auto", opacity: page <= 1 ? 0.5 : 1 }}
          >
            Previous
          </Link>
          <Link
            href={`/admin/users?page=${page + 1}&search=${encodeURIComponent(query)}&type=${userType}&status=${status}`}
            className={`btn btn-secondary btn-sm`}
            style={{ pointerEvents: page >= totalPages ? "none" : "auto", opacity: page >= totalPages ? 0.5 : 1 }}
          >
            Next
          </Link>
        </div>
        <span>
          Page {page} of {totalPages} &bull; Showing {users.length} of {total}
        </span>
      </div>
    </div>
  );
}
