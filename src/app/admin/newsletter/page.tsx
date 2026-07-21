import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { Button, Input, Textarea } from "@/components/ui";

export const dynamic = "force-dynamic";

async function getSubscriberStats() {
  const total = await prisma.blogSubscriber.count();
  const verified = await prisma.blogSubscriber.count({ where: { verified: true } });
  const unverified = total - verified;
  return { total, verified, unverified };
}

export default async function AdminNewsletterPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const stats = await getSubscriberStats();

  return (
    <div className="admin-page">
      <div className="admin-toolbar" style={{ marginBottom: "28px" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 900, marginBottom: "6px" }}>
            Send Newsletter
          </h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
            Compose and send newsletters to verified blog subscribers.
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px", marginBottom: "28px" }}>
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ color: "var(--color-text-muted)", fontSize: "12px", marginBottom: "6px" }}>Total Subscribers</div>
          <div style={{ fontSize: "28px", fontWeight: 900, color: "var(--color-primary-light)" }}>{stats.total}</div>
        </div>
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ color: "var(--color-text-muted)", fontSize: "12px", marginBottom: "6px" }}>Verified Subscribers</div>
          <div style={{ fontSize: "28px", fontWeight: 900, color: "var(--color-success)" }}>{stats.verified}</div>
        </div>
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ color: "var(--color-text-muted)", fontSize: "12px", marginBottom: "6px" }}>Pending Verification</div>
          <div style={{ fontSize: "28px", fontWeight: 900, color: "var(--color-warning)" }}>{stats.unverified}</div>
        </div>
      </div>

      <div className="card" style={{ padding: "28px" }}>
        <form action="/api/admin/newsletter" method="POST">
          <div style={{ marginBottom: "20px" }}>
            <Input
              type="text"
              id="subject"
              name="subject"
              label="Subject Line"
              required
              placeholder="e.g., New Guide: TDS Compliance for Influencers"
              fullWidth
            />
          </div>

          <div style={{ marginBottom: "20px" }}>
            <Textarea
              id="content"
              name="content"
              label="Content (HTML supported)"
              required
              rows={12}
              style={{
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "14px",
                minHeight: "220px",
                resize: "vertical",
              }}
              placeholder="Enter your newsletter content here. You can use HTML tags for formatting."
              fullWidth
            />
            <p style={{ color: "var(--color-text-muted)", fontSize: "12px", marginTop: "6px" }}>
              Tip: Use &lt;p&gt;, &lt;strong&gt;, &lt;em&gt;, &lt;a&gt;, &lt;ul&gt;, &lt;li&gt; for basic formatting.
            </p>
          </div>

          <div className="card-gradient" style={{ padding: "16px 20px", borderRadius: "var(--radius-md)", border: "1px dashed rgba(245, 158, 11, 0.4)", marginBottom: "24px", background: "rgba(245, 158, 11, 0.05)" }}>
            <p style={{ color: "var(--color-accent-amber)", fontSize: "13px", lineHeight: "1.5", fontWeight: 600 }}>
              ⚠️ Warning: This will send an email to {stats.verified} verified subscribers immediately. Make sure to test your content before sending.
            </p>
          </div>

          <Button
            type="submit"
            variant="primary"
            style={{ width: "100%", justifyContent: "center", padding: "14px 28px", fontWeight: 800 }}
          >
            Send Newsletter to {stats.verified} Subscribers
          </Button>
        </form>
      </div>
    </div>
  );
}
