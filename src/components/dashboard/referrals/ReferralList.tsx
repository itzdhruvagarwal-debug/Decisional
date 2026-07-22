import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import EmptyState from "@/components/ui/EmptyState";
import { Button } from "@/components/ui";

interface Referral {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  status: string;
  type: string;
  earnings: number;
}

interface ReferralsResponse {
  referrals?: Referral[];
}

export default function ReferralList() {
  const [filter, setFilter] = useState("ALL");
  const { data, isLoading } = useSWR<ReferralsResponse>("/api/referrals/list", fetcher);

  const referrals = data?.referrals || [];

  const filteredReferrals =
    filter === "ALL" ? referrals : referrals.filter((r) => r.status === filter);

  if (isLoading)
    return (
      <div className="card p-8 text-center">
        <div className="loading"></div>
      </div>
    );

  if (referrals.length === 0) {
    return (
      <EmptyState
        emoji="👥"
        title="No Referrals Yet"
        description="Share your unique invite code to unlock fee discounts and GMV revenue share."
      />
    );
  }

  return (
    <div
      className="card p-0 overflow-hidden" style={{ border: "1px solid var(--color-border)", borderRadius: "16px", background: "var(--color-bg-card)" }}
    >
      <div
        className="p-6 border-b-card flex justify-between items-center flex-wrap gap-4"
      >
        <h3
          className="text-lg font-bold flex items-center gap-2"
        >
          Referral History{" "}
          <span className="badge badge-primary">{referrals.length}</span>
        </h3>

        <div className="flex gap-2">
          {["ALL", "ACTIVE", "PENDING"].map((f) => (
            <Button
              key={f}
              variant="ghost"
              onClick={() => setFilter(f)}
              className="text-xs font-semibold" style={{ padding: "6px 12px", borderRadius: "8px", background:
                  filter === f ? "var(--color-primary)" : "var(--color-bg-tertiary)", color: filter === f ? "white" : "var(--color-text-secondary)", border: "none" }}
            >
              {f}
            </Button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr
              className="p-4 font-semibold text-secondary" style={{ background: "var(--color-bg-secondary)" }}
            >
              <th className="p-4 text-left">User</th>
              <th className="p-4 text-left">Type</th>
              <th className="hide-mobile p-4 text-left">
                Date Joined
              </th>
              <th className="p-4 text-center">Status</th>
              <th
                className="p-4 text-right"
              >
                Est. Earnings
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredReferrals.map((ref) => (
              <tr
                key={ref.id}
                 style={{ transition: "background 0.2s" }}
                 className="border-b-card hover:bg-[var(--color-bg-tertiary)] text-sm"
              >
                <td className="p-4">
                  <div
                    className="flex items-center gap-3"
                  >
                    <div
                      className="flex items-center justify-center font-bold text-sm" style={{ width: "36px", height: "36px", borderRadius: "50%", background:
                          "linear-gradient(135deg, var(--color-primary), var(--color-accent-purple))", color: "white" }}
                    >
                      {ref.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div
                        className="font-semibold" style={{ color: "var(--color-text-primary)" }}
                      >
                        {ref.name}
                      </div>
                      <div
                        className="text-xs text-secondary"
                      >
                        {ref.email}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="p-4">
                  <span
                    className="font-bold" style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "11px", textTransform: "uppercase", background:
                        ref.type === "BRAND"
                          ? "rgba(6, 182, 212, 0.15)"
                          : "rgba(236, 72, 153, 0.15)", color:
                        ref.type === "BRAND"
                          ? "var(--color-accent-cyan)"
                          : "var(--color-secondary)" }}
                  >
                    {ref.type}
                  </span>
                </td>
                <td
                  className="hide-mobile p-4 text-secondary text-sm"
                >
                  {new Date(ref.joinedAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </td>
                <td className="p-4 text-center">
                  <span
                    className="inline-flex items-center text-xs font-semibold" style={{ gap: "6px", padding: "4px 10px", borderRadius: "12px", background:
                        ref.status === "ACTIVE"
                          ? "rgba(16, 185, 129, 0.15)"
                          : "rgba(245, 158, 11, 0.15)", color:
                        ref.status === "ACTIVE"
                          ? "var(--color-accent-emerald)"
                          : "var(--color-accent-amber)" }}
                  >
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "currentColor",
                      }}
                    ></span>
                    {ref.status}
                  </span>
                </td>
                <td
                  className="p-4 text-right font-bold" style={{ color: "var(--color-accent-emerald)" }}
                >
                  {ref.earnings > 0
                    ? `₹${(ref.earnings / 100).toLocaleString("en-IN")}`
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredReferrals.length === 0 && (
        <EmptyState
          emoji="🔍"
          title="No Match"
          description="No referrals found matching the selected filter."
          compact
        />
      )}
    </div >
  );
}
