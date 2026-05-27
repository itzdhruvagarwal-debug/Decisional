import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { DealService } from "@/services/deal.service";
import { requireActiveAdmin } from "@/lib/admin-auth";

export async function POST() {
  try {
    const session = await auth();
    let adminId: string;
    try {
      const admin = await requireActiveAdmin(session?.user);
      adminId = admin.id;
    } catch {
      return NextResponse.json(
        { success: false, message: "Forbidden. Admin access required." },
        { status: 403 }
      );
    }

    logger.info("Auto-approval job triggered by admin", {
      adminId,
    });
    const result = await DealService.autoApproveExpiredContent();

    return NextResponse.json(
      { success: true, message: "Auto-approve job completed", data: result },
      { status: 200 },
    );
  } catch (error: any) {
    logger.error("POST /api/deals/auto-approve error", { error: error.message });
    return NextResponse.json(
      { success: false, message: "Failed to run auto-approval" },
      { status: 500 }
    );
  }
}
