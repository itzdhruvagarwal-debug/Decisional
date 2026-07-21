import { AdminService } from "@/services/admin.service";
import VerificationQueue from "@/components/admin/VerificationQueue";

export const dynamic = "force-dynamic";

export default async function VerifiedQueuePage() {
  // Call service directly on the server to prevent port-binding failures and loopback request overhead
  const pendingUsers = await AdminService.getVerificationQueue();

  return (
    <div className="admin-page admin-page-narrow">
      <header style={{ marginBottom: "32px" }}>
        <h1 className="gradient-text" style={{ fontSize: "28px", fontWeight: 900, marginBottom: "8px" }}>
          Verification Queue
        </h1>
        <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
          Manage and review pending KYC requests from influencers and brands.
        </p>
      </header>

      <VerificationQueue pendingUsers={pendingUsers} isNarrow={true} />
    </div>
  );
}
