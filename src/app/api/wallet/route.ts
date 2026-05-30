import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { WalletService } from "@/services/wallet.service";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Valid session required." },
        { status: 401 }
      );
    }

    const result = await WalletService.getWallet(
      session.user.id,
      1,
      20,
      undefined,
      session.user.userType,
    );

    if (!result?.wallet) {
      return NextResponse.json(
        { success: false, message: "Wallet not found for user." },
        { status: 404 }
      );
    }

    const w = result.wallet;
    const walletPayload = {
      id: w.id,
      balance: w.balance,
      pendingBalance: w.pendingBalance,
      totalEarned: w.totalEarned,
      totalWithdrawn: w.totalWithdrawn,
      totalHeld: (w as any).totalHeld || 0,
      totalSpent: w.totalSpent,
      totalDeposited: w.totalDeposited,
      isFrozen: w.isFrozen,
    };

    return NextResponse.json(
      {
        success: true,
        message: "Wallet fetched successfully",
        userType: session.user.userType,
        wallet: walletPayload,
        data: walletPayload,
      },
      { status: 200 }
    );
  } catch (error: any) {
    logger.error("GET /api/wallet error", { error: error.message });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
