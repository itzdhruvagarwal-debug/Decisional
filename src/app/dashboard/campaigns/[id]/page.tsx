import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import DashboardShell from "@/components/dashboard/DashboardShell";

import CampaignDetailClient from "./CampaignDetailClient";

export default async function CampaignDetailPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <DashboardShell user={session.user}>
      <CampaignDetailClient user={session.user} />
    </DashboardShell>
  );
}
