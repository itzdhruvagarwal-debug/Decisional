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

function statusTone(status: string) {
  if (status === "ACTIVE") return "success";
  if (status === "BANNED" || status === "SUSPENDED") return "danger";
  return "warning";
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

function taxStatusTone(user: TaxComplianceUser) {
  if (user.userType === "ADMIN") return "muted";
  const tax = user.taxCompliance;
  if (!tax?.panLast4) return "danger";
  if (tax.status === "READY") return "success";
  return "warning";
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
          <h1 className="text-3xl font-extrabold mb-1">
            User Management
          </h1>
          <p className="text-secondary text-sm">
            Search, review, ban, and reactivate platform accounts.
          </p>
        </div>
        <div className="card px-4-py-3 min-w-180">
          <div className="text-muted text-xs">
            Matching users
          </div>
          <div className="font-extrabold text-2xl">{total}</div>
        </div>
      </div>

      <form className="card admin-filter-row p-3.5 mb-4">
        <Input
          name="search"
          placeholder="Search name, email, or phone"
          defaultValue={query}
          className="admin-user-search"
        />
        <Select name="type" defaultValue={userType} className="w-180">
          <option value="ALL">All roles</option>
          <option value="INFLUENCER">Influencers</option>
          <option value="BRAND">Brands</option>
        </Select>
        <Select name="status" defaultValue={status} className="admin-status-select">
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

      <div className="card overflow-hidden p-0">
        {users.length === 0 ? (
          <EmptyState
            emoji="👤"
            title="No Users Found"
            description="Try changing the search query or status filters."
          />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-users-table w-full border-collapse">
              <thead>
                <tr className="bg-secondary">
                  {["User", "Role", "Status", "Tax", "Trust", "Joined", "Action"].map(
                    (heading) => (
                      <th
                        key={heading}
                        className="admin-users-th border-b-card text-muted text-xs font-extrabold uppercase"
                        data-align={heading === "Action" ? "right" : heading === "Trust" ? "center" : "left"}
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
                            className="admin-user-avatar flex items-center justify-center relative overflow-hidden rounded-full font-extrabold bg-gradient-primary text-white"
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
                          <div className="min-w-0">
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
                          className="admin-tone-badge badge capitalize text-white"
                          data-tone={statusTone(user.status)}
                        >
                          {user.status.toLowerCase().replaceAll("_", " ")}
                        </span>
                      </td>
                      <td className="p-card">
                        <span
                          className="admin-tone-badge badge capitalize text-white"
                          data-tone={taxStatusTone(user)}
                        >
                          {taxStatusLabel(user)}
                        </span>
                        {user.taxCompliance?.gstinLast4 && (
                          <div className="text-muted mt-1 text-xs">
                            GST ****{user.taxCompliance.gstinLast4}
                          </div>
                        )}
                      </td>
                      <td className="p-card text-center font-extrabold">
                        {user.trustScore}
                        <span className="text-muted text-xs">
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
                className="admin-award-select text-xs px-2-py-05 h-30"
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
                className="admin-grant-btn h-30"
              >
                Grant
              </Button>
            </form>
          )}
                          {user.userType !== "ADMIN" && (
                            <>
                              {user.status === "FLAGGED" && (
                                <form action={unbanUser.bind(null, user.id)}>
                                  <Button variant="success" size="sm" type="submit" className="h-30">
                                    Approve (Activate)
                                  </Button>
                                </form>
                              )}
                              {isBanned ? (
                                <form action={unbanUser.bind(null, user.id)}>
                                  <Button variant="secondary" size="sm" type="submit" className="h-30">
                                    Unban
                                  </Button>
                                </form>
                              ) : (
                                <form action={banUser.bind(null, user.id)}>
                                  <Button variant="danger" size="sm" type="submit" className="h-30">
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
            className="admin-page-link btn btn-secondary btn-sm"
            data-disabled={page <= 1}
            aria-disabled={page <= 1}
          >
            Previous
          </Link>
          <Link
            href={`/admin/users?page=${page + 1}&search=${encodeURIComponent(query)}&type=${userType}&status=${status}`}
            className="admin-page-link btn btn-secondary btn-sm"
            data-disabled={page >= totalPages}
            aria-disabled={page >= totalPages}
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
