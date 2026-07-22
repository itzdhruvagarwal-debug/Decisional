"use client";


import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import Image from "next/image";
import { useSession } from "next-auth/react";
import Link from "next/link";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { formatCurrency } from "@/lib/utils-client";
import EmptyState from "@/components/ui/EmptyState";

interface Application {
  id: string;
  status: string;
  proposedRate: number;
  createdAt: string;
  campaign: {
    id: string;
    title: string;
    perInfluencerBudget: number;
    brand: {
      companyName: string;
      logo: string | null;
    } | null;
  };
}

interface ApplicationsResponse {
  success?: boolean;
  message?: string;
  data?: { applications?: Application[]; totalPages?: number };
  applications?: Application[];
  totalPages?: number;
}

function getStatusStyle(status: string) {
  switch (status.toUpperCase()) {
    case "SELECTED":
    case "ACCEPTED":
      return {
        background: "rgba(16, 185, 129, 0.12)",
        color: "var(--color-accent-emerald)",
        borderColor: "rgba(16, 185, 129, 0.25)",
      };
    case "REJECTED":
      return {
        background: "rgba(244, 63, 94, 0.12)",
        color: "var(--color-accent-rose)",
        borderColor: "rgba(244, 63, 94, 0.25)",
      };
    case "PENDING":
    default:
      return {
        background: "rgba(245, 158, 11, 0.12)",
        color: "var(--color-accent-amber)",
        borderColor: "rgba(245, 158, 11, 0.25)",
      };
  }
}

export default function ApplicationsPage() {
  const { data: session } = useSession();
  const page = 1;
  const limit = 10;

  const { data: payload, isLoading: loading, error: fetchErr } = useSWR<ApplicationsResponse>(
    session?.user ? `/api/applications?page=${page}&limit=${limit}` : null,
    fetcher
  );

  const applications = payload?.data?.applications || payload?.applications || [];
  const error = fetchErr ? "Failed to fetch applications" : (payload && !payload.success ? (payload.message || "Failed to load applications") : "");

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="loading" />
      </div>
    );
  }

  let applicationsList;
  if (loading) {
    applicationsList = (
      <div className="flex justify-center p-10">
        <span className="loading w-40 h-40" />
      </div>
    );
  } else if (error) {
    applicationsList = (
      <div className="text-center text-rose p-10">
        ⚠️ {error}
      </div>
    );
  } else if (applications.length === 0) {
    applicationsList = (
      <EmptyState
        emoji="📋"
        title="No Applications Found"
        description="You haven't submitted any campaign applications yet."
        actionLabel="Discover Campaigns"
        actionHref="/dashboard/campaigns"
      />
    );
  } else {
    applicationsList = (
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-card bg-tertiary">
                <th className="p-4 text-xs font-bold text-secondary">CAMPAIGN</th>
                <th className="p-4 text-xs font-bold text-secondary">PROPOSED RATE</th>
                <th className="p-4 text-xs font-bold text-secondary">SUBMITTED ON</th>
                <th className="p-4 text-xs font-bold text-secondary">STATUS</th>
                <th className="p-4 text-xs font-bold text-secondary text-right">ACTION</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => {
                const statusStyle = getStatusStyle(app.status);
                return (
                  <tr key={app.id} className="border-b-card">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden relative rounded-sm text-white w-36 h-36 bg-gradient-card"
                        >
                          {app.campaign.brand?.logo ? (
                            <Image
                              src={app.campaign.brand.logo}
                              alt=""
                              fill
                              unoptimized
                              className="object-cover"
                            />
                          ) : (
                            (app.campaign.brand?.companyName || "DC").slice(0, 2).toUpperCase()
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-sm">
                            {app.campaign.title}
                          </div>
                          <div className="text-xs text-secondary">
                            by {app.campaign.brand?.companyName || "Unknown Brand"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 font-bold">{formatCurrency(app.proposedRate)}</td>
                    <td className="p-4 text-secondary text-sm">
                      {new Date(app.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="p-4">
                      <span
                        className="inline-flex text-xs font-extrabold rounded-md" style={{ border: "1px solid", padding: "4px 10px", ...statusStyle }}
                      >
                        {app.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <Link href={`/dashboard/campaigns/${app.campaign.id}`} className="btn btn-ghost btn-sm">
                        View Campaign
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell user={session.user}>
      <div className="mx-auto max-w-1000" style={{ padding: "40px 20px" }}>
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-extrabold text-3xl">My Applications</h1>
          <p className="text-secondary text-sm mt-1">
            Track the status of your pitches and proposals submitted to campaigns.
          </p>
        </div>

        {error && (
          <div
            className="card p-4 mb-6 rounded-md text-rose" style={{ background: "rgba(244, 63, 94, 0.08)", border: "1px solid rgba(244, 63, 94, 0.2)" }}
          >
            {error}
          </div>
        )}

        {applicationsList}
      </div>
    </DashboardShell>
  );
}
