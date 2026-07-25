"use client";


import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import Image from "next/image";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { formatCurrency } from "@/lib/utils-client";
import EmptyState from "@/components/ui/EmptyState";
import { Badge, Button, Skeleton, Spinner } from "@/components/ui";

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

function getStatusVariant(status: string): "success" | "danger" | "warning" {
  switch (status.toUpperCase()) {
    case "SELECTED":
    case "ACCEPTED":
      return "success";
    case "REJECTED":
      return "danger";
    case "PENDING":
    default:
      return "warning";
  }
}

/** Skeleton placeholder matching the 5-column applications table layout. */
function ApplicationsTableSkeleton() {
  return (
    <div className="card overflow-hidden p-0" aria-hidden="true">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b-card bg-tertiary">
              {["CAMPAIGN", "PROPOSED RATE", "SUBMITTED ON", "STATUS", "ACTION"].map((col) => (
                <th key={col} scope="col" className="p-4">
                  <Skeleton height={10} width={col === "CAMPAIGN" ? 72 : 56} borderRadius={4} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <tr key={i} className="border-b-card">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <Skeleton width={36} height={36} borderRadius={4} />
                    <div>
                      <Skeleton height={14} width={160} borderRadius={4} style={{ marginBottom: 6 }} />
                      <Skeleton height={11} width={100} borderRadius={4} />
                    </div>
                  </div>
                </td>
                <td className="p-4"><Skeleton height={14} width={72} borderRadius={4} /></td>
                <td className="p-4"><Skeleton height={14} width={80} borderRadius={4} /></td>
                <td className="p-4"><Skeleton height={24} width={72} borderRadius={6} /></td>
                <td className="p-4 text-right"><Skeleton height={32} width={108} borderRadius={6} style={{ marginLeft: "auto" }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
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
        <Spinner size="lg" />
      </div>
    );
  }

  let applicationsList;
  if (loading) {
    applicationsList = <ApplicationsTableSkeleton />;
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
            <table className="w-full text-left border-collapse" aria-label="My campaign applications">
              <thead>
                <tr className="border-b-card bg-tertiary">
                  <th scope="col" className="p-4 text-xs font-bold text-secondary">CAMPAIGN</th>
                  <th scope="col" className="p-4 text-xs font-bold text-secondary">PROPOSED RATE</th>
                  <th scope="col" className="p-4 text-xs font-bold text-secondary">SUBMITTED ON</th>
                  <th scope="col" className="p-4 text-xs font-bold text-secondary">STATUS</th>
                  <th scope="col" className="p-4 text-xs font-bold text-secondary text-right">ACTION</th>
                </tr>
              </thead>
            <tbody>
              {applications.map((app) => (
                <tr key={app.id} className="border-b-card">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden relative rounded-sm text-white w-36 h-36 bg-gradient-card"
                      >
                        {app.campaign.brand?.logo ? (
                          <Image
                            src={app.campaign.brand.logo}
                            alt={app.campaign.brand?.companyName ?? "Brand logo"}
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
                    <Badge variant={getStatusVariant(app.status)} className="text-xs font-extrabold">
                      {app.status}
                    </Badge>
                  </td>
                  <td className="p-4 text-right">
                    <Button
                      href={`/dashboard/campaigns/${app.campaign.id}`}
                      variant="ghost"
                      size="sm"
                      aria-label={`View campaign: ${app.campaign.title}`}
                    >
                      View Campaign
                    </Button>
                  </td>
                </tr>
              ))}
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
