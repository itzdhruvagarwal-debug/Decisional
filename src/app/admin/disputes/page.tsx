import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { requireActiveAdmin } from "@/lib/admin-auth";
import EmptyState from "@/components/ui/EmptyState";
import { Badge, Button } from "@/components/ui";

import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type DisputeWithDetails = Prisma.DisputeGetPayload<{
  include: {
    deal: {
      include: {
        campaign: { select: { title: true } };
        influencer: { select: { displayName: true } };
        brand: { select: { companyName: true } };
      };
    };
    raisedBy: { select: { email: true } };
  };
}>;

function DisputeItem({
  dispute,
  showHistory,
}: {
  readonly dispute: DisputeWithDetails;
  readonly showHistory: boolean;
}) {
  const campaignTitle = dispute.deal?.campaign?.title || "Untitled Campaign";
  const userEmail = dispute.raisedBy?.email || "Unknown user";
  const createdDate = new Date(dispute.createdAt).toLocaleDateString();
  const badgeVariant = showHistory ? "success" : "danger";
  const formattedAmount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(Number(dispute.deal?.amount || 0) / 100);

  return (
    <div
      className="card flex justify-between items-center gap-4 flex-wrap bg-secondary border-card rounded-lg px-6-py-4"
    >
      <div>
        <div className="font-bold text-base mb-1">
          {campaignTitle}
        </div>
        <div className="text-xs text-muted">
          Raised by: {userEmail} | {createdDate}
        </div>
        <div className="mt-2 flex gap-2 text-xs">
          <Badge variant={badgeVariant}>
            {dispute.status}
          </Badge>
          <Badge variant="ghost">
            {dispute.type}
          </Badge>
          <span>
            Amount: {formattedAmount}
          </span>
        </div>
      </div>
      <Button
        href={`/admin/disputes/${dispute.id}`}
        variant="primary"
        size="sm"
        aria-label={
          showHistory
            ? `View details for dispute ${dispute.id}`
            : `Resolve dispute ${dispute.id}`
        }
      >
        {showHistory ? "View Details" : "Resolve"}
      </Button>
    </div>
  );
}

export default async function AdminDisputeListPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  try {
    await requireActiveAdmin(session?.user);
  } catch {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const showHistory = params.history === "true";

  let activeDisputes: DisputeWithDetails[] = [];
  let loadError = false;

  try {
    activeDisputes = await prisma.dispute.findMany({
      where: {
        status: showHistory
          ? { in: ["RESOLVED", "CLOSED", "TIER1_AUTO"] }
          : { in: ["OPEN", "TIER2_MEDIATION", "TIER3_ARBITRATION"] },
      },
      include: {
        deal: {
          include: {
            campaign: { select: { title: true } },
            influencer: { select: { displayName: true } },
            brand: { select: { companyName: true } },
          },
        },
        raisedBy: { select: { email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  } catch (error) {
    loadError = true;
    logger.error("Admin dispute queue failed to load", error);
  }

  let content;
  if (loadError) {
    content = (
      <div
        className="card p-6 text-rose" style={{ borderColor: "rgba(244, 63, 94, 0.3)" }}
      >
        Could not load disputes right now. Please retry after checking database connectivity.
      </div>
    );
  } else if (activeDisputes.length === 0) {
    content = (
      <EmptyState
        emoji={showHistory ? "📋" : "⚖️"}
        title={showHistory ? "No Historical Disputes" : "No Active Disputes"}
        description={showHistory ? "No historical disputes have been recorded." : "There are no active disputes at the moment."}
        compact
      />
    );
  } else {
    content = (
      <div className="grid gap-4">
        {activeDisputes.map((dispute) => (
          <DisputeItem
            key={dispute.id}
            dispute={dispute}
            showHistory={showHistory}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-toolbar">
        <div>
          <h1 className="text-3xl font-extrabold mb-1">
            Dispute Resolution Queue
          </h1>
          <p className="text-secondary text-sm">
            Review open and Tier 2 mediation cases before funds move.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6" role="tablist" aria-label="Dispute queue filters">
        <Button
          href="/admin/disputes"
          variant={showHistory ? "secondary" : "primary"}
          size="sm"
          aria-label="View active disputes"
          {...(!showHistory ? { "aria-current": "page" as const } : {})}
        >
          Active Disputes
        </Button>
        <Button
          href="/admin/disputes?history=true"
          variant={showHistory ? "primary" : "secondary"}
          size="sm"
          aria-label="View dispute history"
          {...(showHistory ? { "aria-current": "page" as const } : {})}
        >
          Dispute History
        </Button>
      </div>

      {content}
    </div>
  );
}
