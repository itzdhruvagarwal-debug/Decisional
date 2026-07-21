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
      className="card"
      style={{
        padding: "0",
        overflow: "hidden",
        border: "1px solid var(--color-border)",
        borderRadius: "16px",
        background: "var(--color-bg-card)",
      }}
    >
      <div
        style={{
          padding: "24px",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <h3
          style={{
            fontSize: "18px",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          Referral History{" "}
          <span className="badge badge-primary">{referrals.length}</span>
        </h3>

        <div style={{ display: "flex", gap: "8px" }}>
          {["ALL", "ACTIVE", "PENDING"].map((f) => (
            <Button
              key={f}
              variant="ghost"
              onClick={() => setFilter(f)}
              style={{
                padding: "6px 12px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: 600,
                background:
                  filter === f ? "var(--color-primary)" : "var(--color-bg-tertiary)",
                color: filter === f ? "white" : "var(--color-text-secondary)",
                border: "none",
              }}
            >
              {f}
            </Button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr
              style={{
                padding: "16px",
                fontWeight: 600,
                color: "var(--color-text-secondary)",
                background: "var(--color-bg-secondary)",
              }}
            >
              <th style={{ padding: "16px", textAlign: "left" }}>User</th>
              <th style={{ padding: "16px", textAlign: "left" }}>Type</th>
              <th className="hide-mobile" style={{ padding: "16px", textAlign: "left" }}>
                Date Joined
              </th>
              <th style={{ padding: "16px", textAlign: "center" }}>Status</th>
              <th
                style={{
                  padding: "16px",
                  textAlign: "right",
                }}
              >
                Est. Earnings
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredReferrals.map((ref) => (
              <tr
                key={ref.id}
                style={{
                  borderBottom: "1px solid var(--color-border)",
                  transition: "background 0.2s",
                }}
                className="hover:bg-[var(--color-bg-tertiary)] text-sm"
              >
                <td style={{ padding: "16px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "50%",
                        background:
                          "linear-gradient(135deg, var(--color-primary), var(--color-accent-purple))",
                        color: "white",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: "14px",
                      }}
                    >
                      {ref.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div
                        style={{
                          fontWeight: 600,
                          color: "var(--color-text-primary)",
                        }}
                      >
                        {ref.name}
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {ref.email}
                      </div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: "16px" }}>
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: "20px",
                      fontSize: "11px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      background:
                        ref.type === "BRAND"
                          ? "rgba(6, 182, 212, 0.15)"
                          : "rgba(236, 72, 153, 0.15)",
                      color:
                        ref.type === "BRAND"
                          ? "var(--color-accent-cyan)"
                          : "var(--color-secondary)",
                    }}
                  >
                    {ref.type}
                  </span>
                </td>
                <td
                  className="hide-mobile"
                  style={{
                    padding: "16px",
                    color: "var(--color-text-secondary)",
                    fontSize: "13px",
                  }}
                >
                  {new Date(ref.joinedAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </td>
                <td style={{ padding: "16px", textAlign: "center" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "4px 10px",
                      borderRadius: "12px",
                      fontSize: "12px",
                      fontWeight: 600,
                      background:
                        ref.status === "ACTIVE"
                          ? "rgba(16, 185, 129, 0.15)"
                          : "rgba(245, 158, 11, 0.15)",
                      color:
                        ref.status === "ACTIVE"
                          ? "var(--color-accent-emerald)"
                          : "var(--color-accent-amber)",
                    }}
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
                  style={{
                    padding: "16px",
                    textAlign: "right",
                    fontWeight: 700,
                    color: "var(--color-accent-emerald)",
                  }}
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
