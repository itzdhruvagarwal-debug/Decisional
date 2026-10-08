import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { PageContainer } from "@/components/ui";
import CampaignsClient from "./CampaignsClient";

export default async function CampaignsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <DashboardShell user={session.user}>
      <PageContainer maxWidth="7xl" className="py-4 sm:py-6">
        <CampaignsClient user={session.user} />
      </PageContainer>
    </DashboardShell>
  );
}
