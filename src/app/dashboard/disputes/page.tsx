"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import Link from "next/link";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { useSession } from "next-auth/react";
import EmptyState from "@/components/ui/EmptyState";

interface Dispute {
  id: string;
  type: string;
  status: string;
  description: string;
  createdAt: string;
  deal: {
    id: string;
    amount: number;
    campaign: { title: string };
    influencer: { displayName: string };
    brand: { companyName: string };
  };
}

interface DisputesResponse {
  disputes?: Dispute[];
}

export default function DisputesPage() {
  const { data: session } = useSession();
  const { data, isLoading } = useSWR<DisputesResponse>("/api/disputes", fetcher);
  const disputes = data?.disputes || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "OPEN": return "var(--color-primary)";
      case "TIER1_AUTO": return "var(--color-accent-cyan)";
      case "TIER2_MEDIATION": return "var(--color-warning)";
      case "RESOLVED": return "var(--color-success)";
      case "CLOSED": return "var(--color-text-muted)";
      default: return "var(--color-text-secondary)";
    }
  };

  const getStatusLabel = (status: string) => status.replaceAll("_", " ");

  return (
    <DashboardShell user={session?.user}>
      <div className="animate-fade-in">
        {/* Page Header */}
        <div
          className="flex justify-between items-center flex-wrap gap-3 mb-6"
        >
          <div>
            <h1 className="font-extrabold text-2xl">
              ⚖️ Disputes & Resolution
            </h1>
            <p className="text-secondary text-sm mt-1">
              Manage and track your dispute cases
            </p>
          </div>
          <Link href="/dashboard/deals" className="btn btn-secondary">
            ← Back to Deals
          </Link>
        </div>

        {/* Content */}
        {(() => {
          if (isLoading) {
            return (
              <div className="text-center p-10">
                <span className="loading w-36 h-36" />
              </div>
            );
          }
          if (disputes.length === 0) {
            return (
              <EmptyState
                emoji="✅"
                title="No Disputes Found"
                description="You have no open disputes at the moment."
                actionLabel="Go to Deals"
                actionHref="/dashboard/deals"
              />
            );
          }
          return (
            <div className="flex flex-col gap-4">
            {disputes.map((dispute) => (
              <Link
                key={dispute.id}
                href={`/dashboard/disputes/${dispute.id}`}
                className="no-underline text-inherit"
              >
                <div className="card hover-lift cursor-pointer">
                  {/* Top Row: Status + meta */}
                  <div
                    className="flex justify-between items-start mb-3 flex-wrap gap-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="badge text-xs text-white" style={{ background: getStatusColor(dispute.status) }}
                      >
                        {getStatusLabel(dispute.status)}
                      </span>
                      <span className="text-xs text-secondary">
                        #{dispute.id.slice(-6)}
                      </span>
                      <span className="text-xs text-muted">
                        {new Date(dispute.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <span
                      className="text-xs font-semibold text-amber rounded-md px-2-py-1" style={{ background: "rgba(245,158,11,0.1)" }}
                    >
                      {dispute.type} Issue
                    </span>
                  </div>

                  {/* Campaign Title */}
                  <h3 className="font-bold mb-1 text-base">
                    {dispute.deal.campaign.title}
                  </h3>

                  {/* Deal Info */}
                  <div
                    className="flex flex-wrap gap-3 text-sm text-secondary mb-3"
                  >
                    <span>💳 ₹{(dispute.deal.amount / 100).toLocaleString("en-IN")}</span>
                    <span>🎬 {dispute.deal.influencer?.displayName}</span>
                    <span>🏢 {dispute.deal.brand?.companyName}</span>
                  </div>

                  {/* Description Excerpt */}
                  <div
                    className="text-sm text-secondary bg-tertiary rounded-md leading-relaxed" style={{ padding: "12px 14px", borderLeft: `3px solid ${getStatusColor(dispute.status)}` }}
                  >
                    "{dispute.description.length > 120
                      ? dispute.description.slice(0, 120) + "..."
                      : dispute.description}"
                  </div>

                  {/* View Details CTA */}
                  <div className="flex justify-end mt-3-5">
                    <span
                      className="text-sm font-semibold text-primary"
                    >
                      View Full Details →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        );
      })()}
      </div>
    </DashboardShell>
  );
}
