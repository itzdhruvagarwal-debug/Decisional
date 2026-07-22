import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { Button, Input, Textarea } from "@/components/ui";
import { z } from "zod";

export const newsletterSchema = z.object({
  subject: z.string().min(5, "Subject must be at least 5 characters").max(100),
  content: z.string().min(10, "Content must be at least 10 characters"),
});

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
      <div className="admin-toolbar mb-6">
        <div>
          <h1 className="text-3xl font-extrabold mb-1">
            Send Newsletter
          </h1>
          <p className="text-secondary text-sm">
            Compose and send newsletters to verified blog subscribers.
          </p>
        </div>
      </div>

      <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <div className="card" style={{ padding: "18px 20px" }}>
          <div className="text-muted text-xs mb-1">Total Subscribers</div>
          <div className="text-3xl font-extrabold text-primary-light">{stats.total}</div>
        </div>
        <div className="card" style={{ padding: "18px 20px" }}>
          <div className="text-muted text-xs mb-1">Verified Subscribers</div>
          <div className="text-3xl font-extrabold text-emerald">{stats.verified}</div>
        </div>
        <div className="card" style={{ padding: "18px 20px" }}>
          <div className="text-muted text-xs mb-1">Pending Verification</div>
          <div className="text-3xl font-extrabold text-amber">{stats.unverified}</div>
        </div>
      </div>

      <div className="card p-6">
        <form action="/api/admin/newsletter" method="POST">
          <div className="mb-5">
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

          <div className="mb-5">
            <Textarea
              id="content"
              name="content"
              label="Content (HTML supported)"
              required
              rows={12}
              className="text-sm resize-y" style={{ fontFamily: "var(--font-mono, monospace)", minHeight: "220px" }}
              placeholder="Enter your newsletter content here. You can use HTML tags for formatting."
              fullWidth
            />
            <p className="text-muted text-xs mt-1">
              Tip: Use &lt;p&gt;, &lt;strong&gt;, &lt;em&gt;, &lt;a&gt;, &lt;ul&gt;, &lt;li&gt; for basic formatting.
            </p>
          </div>

          <div className="card-gradient mb-6 rounded-md" style={{ padding: "16px 20px", border: "1px dashed rgba(245, 158, 11, 0.4)", background: "rgba(245, 158, 11, 0.05)" }}>
            <p className="text-sm font-semibold text-amber leading-normal">
              ⚠️ Warning: This will send an email to {stats.verified} verified subscribers immediately. Make sure to test your content before sending.
            </p>
          </div>

          <Button
            type="submit"
            variant="primary"
            className="w-full justify-center font-extrabold" style={{ padding: "14px 28px" }}
          >
            Send Newsletter to {stats.verified} Subscribers
          </Button>
        </form>
      </div>
    </div>
  );
}
