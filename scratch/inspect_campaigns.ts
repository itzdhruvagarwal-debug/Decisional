import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const campaigns = await prisma.campaign.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      title: true,
      totalBudget: true,
      perInfluencerBudget: true,
      requiresProduct: true,
      productValue: true,
      reservedAmount: true,
      reservedTotalAmount: true,
      fundedAmount: true,
      maxInfluencers: true,
      selectedInfluencers: true,
      status: true,
    }
  });

  console.log("=== Campaigns ===");
  console.log(JSON.stringify(campaigns, null, 2));

  const applications = await prisma.application.findMany({
    select: {
      id: true,
      campaignId: true,
      status: true,
      proposedRate: true,
      proposal: true,
    }
  });

  console.log("=== Applications ===");
  console.log(JSON.stringify(applications, null, 2));

  const deals = await prisma.deal.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      campaignId: true,
      status: true,
      amount: true,
    }
  });

  console.log("=== Deals ===");
  console.log(JSON.stringify(deals, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
