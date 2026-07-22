import prisma from "@/lib/db";
import Link from "next/link";
import { logger } from "@/lib/logger";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { requireActiveAdmin } from "@/lib/admin-auth";
import EmptyState from "@/components/ui/EmptyState";

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
        className="card p-6" style={{ color: "var(--color-accent-rose)", borderColor: "rgba(244, 63, 94, 0.3)" }}
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
          <div
            key={dispute.id}
            className="card flex justify-between items-center gap-4 flex-wrap" style={{ padding: "16px 24px", background: "var(--color-bg-secondary)", border: "1px solid var(--color-border)", borderRadius: "12px" }}
          >
            <div>
              <div
                className="font-bold text-base mb-1"
              >
                {dispute.deal?.campaign?.title || "Untitled Campaign"}
              </div>
              <div
                className="text-xs text-muted"
              >
                Raised by: {dispute.raisedBy?.email || "Unknown user"} |{" "}
                {new Date(dispute.createdAt).toLocaleDateString()}
              </div>
              <div
                className="mt-2 flex gap-2 text-xs"
              >
                <span
                  className="font-bold" style={{ padding: "2px 6px", borderRadius: "4px", background: showHistory ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)", color: showHistory ? "#10b981" : "#ef4444" }}
                >
                  {dispute.status}
                </span>
                <span
                  className="text-secondary" style={{ padding: "2px 6px", borderRadius: "4px", background: "rgba(255, 255, 255, 0.05)" }}
                >
                  {dispute.type}
                </span>
                <span>
                  Amount: {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
                    Number(dispute.deal?.amount || 0) / 100,
                  )}
                </span>
              </div>
            </div>
            <Link
              href={`/admin/disputes/${dispute.id}`}
              className="btn btn-primary text-sm" style={{ padding: "8px 16px" }}
            >
              {showHistory ? "View Details" : "Resolve"}
            </Link>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-toolbar">
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 900, marginBottom: "6px" }}>
            Dispute Resolution Queue
          </h1>
          <p className="text-secondary text-sm">
            Review open and Tier 2 mediation cases before funds move.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <Link
          href="/admin/disputes"
          className={`btn ${showHistory ? "btn-secondary" : "btn-primary"} text-sm`}
          style={{ padding: "8px 16px" }}
        >
          Active Disputes
        </Link>
        <Link
          href="/admin/disputes?history=true"
          className={`btn ${showHistory ? "btn-primary" : "btn-secondary"} text-sm`}
          style={{ padding: "8px 16px" }}
        >
          Dispute History
        </Link>
      </div>

      {content}
    </div>
  );
}
