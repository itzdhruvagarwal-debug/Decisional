import prisma from "@/lib/db";
import { notFound } from "next/navigation";
import {
  approveUser,
  rejectUser,
  approveDocument,
  rejectDocument,
} from "../../actions";
import { getSignedUrl } from "@/lib/storage";
import EmptyState from "@/components/ui/EmptyState";
import { Button, Input } from "@/components/ui";

export const dynamic = "force-dynamic";

function getDocBadgeClass(status: string): string {
  if (status === "VERIFIED") return "badge-success";
  if (status === "REJECTED") return "badge-danger";
  return "badge-warning";
}

export default async function VerificationDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      influencerProfile: true,
      brandProfile: true,
      taxCompliance: true,
      verificationDocs: true,
      badges: { include: { badge: true } },
    },
  });

  if (!user) notFound();

  // Regenerate presigned URLs for all KYC documents on load
  // documentUrl stores either a full URL (already public/CDN) or an S3 key.
  // For keys (no http prefix), we generate a fresh 1-hour presigned URL.
  const docsWithRefreshedUrls = await Promise.all(
    user.verificationDocs.map(async (doc: typeof user.verificationDocs[number]) => {
      if (!doc.documentUrl) return doc;
      // If it's already a full URL (CDN / local path), use as-is
      if (doc.documentUrl.startsWith("http") || doc.documentUrl.startsWith("/")) {
        return doc;
      }
      // Otherwise treat as S3 key and generate fresh presigned URL (1h)
      const signedUrl = await getSignedUrl(doc.documentUrl, 3600);
      return { ...doc, documentUrl: signedUrl || doc.documentUrl };
    }),
  );

  const name =
    user.influencerProfile?.displayName ||
    user.brandProfile?.companyName ||
    "Unknown";
  const activeSince = new Date(user.createdAt).toLocaleDateString();

  return (
    <div className="admin-page admin-page-narrow">
      <header style={{ marginBottom: "32px" }}>
        <h1 className="gradient-text" style={{ fontSize: "28px", fontWeight: 900, marginBottom: "8px" }}>
          Review: {name}
        </h1>
        <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
          Critical KYC and Trust Verification Review Process
        </p>
      </header>

      <div className="grid-2" style={{ gap: "24px", alignItems: "start" }}>
        {/* Profile Info */}
        <section className="card">
          <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
            👤 Profile Detail
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {[
              { label: "Internal ID", value: user.id, color: "inherit" },
              { label: "Email Address", value: user.email, color: "inherit" },
              { label: "Phone Contact", value: user.phone || "Not provided", color: "inherit" },
              { label: "Account Type", value: user.userType, color: "inherit" },
              { label: "Registration", value: activeSince, color: "inherit" },
              { label: "Trust Score", value: user.trustScore, color: user.trustScore >= 50 ? "var(--color-accent-emerald)" : "var(--color-accent-amber)" },
            ].map((item) => (
              <div key={item.label} style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px",
                background: "var(--color-bg-tertiary)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)"
              }}>
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", fontWeight: 600, textTransform: "uppercase" }}>
                  {item.label}
                </span>
                <span style={{
                  fontSize: "14px",
                  fontWeight: 700,
                  color: item.color
                }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
            India Tax Readiness
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {[
              {
                label: "PAN",
                value: user.taxCompliance?.panLast4
                  ? `****${user.taxCompliance.panLast4}`
                  : "Missing",
              },
              {
                label: "GSTIN",
                value: user.taxCompliance?.gstinLast4
                  ? `****${user.taxCompliance.gstinLast4}`
                  : user.taxCompliance?.gstRegistrationType || "Not declared",
              },
              {
                label: "ITR acknowledgement",
                value: user.taxCompliance?.itrAcknowledgementLast4
                  ? `****${user.taxCompliance.itrAcknowledgementLast4}`
                  : "Not provided",
              },
              {
                label: "Assessment year",
                value: user.taxCompliance?.itrAssessmentYear || "Not provided",
              },
              {
                label: "E-invoice",
                value: user.taxCompliance?.eInvoiceApplicable ? "Applicable" : "Not marked",
              },
              {
                label: "Tax status",
                value: user.taxCompliance?.status || "ACTION_REQUIRED",
              },
            ].map((item) => (
              <div key={item.label} style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px",
                background: "var(--color-bg-tertiary)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)"
              }}>
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", fontWeight: 600, textTransform: "uppercase" }}>
                  {item.label}
                </span>
                <span style={{ fontSize: "14px", fontWeight: 700 }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Docs */}
        <section className="card">
          <h2 style={{ fontSize: "18px", fontWeight: 700, marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
            🛡️ Proof Documents
          </h2>
          {docsWithRefreshedUrls.length === 0 ? (
            <EmptyState
              emoji="🗂️"
              title="No Documents Uploaded"
              description="No verification documents have been submitted by this user."
              compact
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {docsWithRefreshedUrls.map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    padding: "16px",
                    background: "var(--color-bg-tertiary)",
                    borderRadius: "var(--radius-lg)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: "14px", color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: "8px", textTransform: "uppercase" }}>
                        {doc.type.replaceAll("_", " ")}
                        <span className={`badge ${getDocBadgeClass(doc.status)}`}>
                          {doc.status}
                        </span>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "4px" }}>
                        ID: {doc.id.slice(0, 8)}... • {new Date(doc.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    {doc.documentUrl && (
                      <a
                        href={doc.documentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-sm btn-secondary"
                        style={{ padding: "6px 12px" }}
                      >
                        Review Attachment ↗
                      </a>
                    )}
                  </div>

                  {doc.status === "PENDING" && (
                    <div style={{ display: "flex", gap: "10px", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--color-border)" }}>
                      <form action={approveDocument.bind(null, doc.id, user.id)} style={{ flex: 1 }}>
                        <Button variant="success" size="sm" style={{ width: "100%" }}>
                          Approve ✅
                        </Button>
                      </form>
                      <form
                        action={async (formData) => {
                          "use server";
                          const reason = formData.get("reason") as string;
                          if (!reason) return;
                          await rejectDocument(doc.id, user.id, reason);
                        }}
                        style={{ flex: 2, display: "flex", gap: "8px" }}
                      >
                        <Input
                          name="reason"
                          placeholder="Reason..."
                          required
                          style={{ flex: 1, padding: "8px 12px", fontSize: "12px" }}
                        />
                        <Button type="submit" variant="danger" size="sm">
                          Reject ❌
                        </Button>
                      </form>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Global Actions Bar */}
      <footer style={{
        marginTop: "40px",
        padding: "32px",
        background: "var(--color-bg-secondary)",
        borderRadius: "var(--radius-xl)",
        border: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        gap: "24px"
      }}>
        <div>
          <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "4px" }}>Decision Engine</h3>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "13px" }}>Finalize user status. This will trigger system-wide webhooks and emails.</p>
        </div>

        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
          <form action={approveUser.bind(null, user.id)}>
            <Button variant="success" size="lg" style={{ minWidth: "220px" }}>
              ✅ Full Verification Pass
            </Button>
          </form>

          <div style={{ height: "40px", width: "1px", background: "var(--color-border)" }} />

          <form
            action={async (formData) => {
              "use server";
              const reason = formData.get("reason") as string;
              if (!reason) return;
              await rejectUser(user.id, reason);
            }}
            style={{ display: "flex", gap: "12px", flex: "1 1 360px", flexWrap: "wrap" }}
          >
            <Input
              name="reason"
              placeholder="Final rejection context..."
              required
              style={{ flex: "1 1 260px", height: "52px" }}
            />
            <Button type="submit" variant="danger" size="lg" style={{ minWidth: "180px" }}>
              ❌ Hard Reject
            </Button>
          </form>
        </div>
      </footer>
    </div>
  );
}
