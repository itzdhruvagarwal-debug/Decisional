import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { BADGES } from "@/lib/badges";
import { auth } from "@/lib/auth";
import { apiWrapper } from "@/lib/api-wrapper";
import { AdminService } from "@/services/admin.service";

export const POST = apiWrapper(async () => {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await AdminService.checkAdminAccess(session.user);
  } catch (_e) {
    return NextResponse.json(
      { error: "Unauthorized: Admin access required" },
      { status: 403 },
    );
  }

  let created = 0;
  let updated = 0;

  for (const badge of BADGES) {
    const existing = await prisma.badge.findUnique({
      where: { name: badge.name },
    });

    if (existing) {
      await prisma.badge.update({
        where: { id: existing.id },
        data: {
          description: badge.description,
          icon: badge.icon,
          category: badge.category,
          xpReward: badge.xpReward,
        },
      });
      updated++;
    } else {
      await prisma.badge.create({
        data: {
          name: badge.name,
          description: badge.description,
          icon: badge.icon,
          category: badge.category,
          xpReward: badge.xpReward,
          criteria: {},
        },
      });
      created++;
    }
  }

  return NextResponse.json({ success: true, created, updated });
});
