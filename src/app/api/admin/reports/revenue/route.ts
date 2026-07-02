import { NextRequest } from "next/server";
import { apiWrapper, ApiResponse } from "@/lib/api-wrapper";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { toCsv, paiseToRupees, getIndianFYBounds } from "@/lib/csv-export";
import { format } from "date-fns";
import { RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
import { getPlatformHeader, getPlatformFooter } from "@/lib/platform-config";

async function _handler(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.userType !== "ADMIN") {
    return ApiResponse.unauthorized();
  }

  const { searchParams } = new URL(req.url);
  const fy      = searchParams.get("fy") ?? getCurrentFY();
  const fmt     = searchParams.get("format") === "csv" ? "csv" : "json";
  
  const bounds = getIndianFYBounds(fy);
  if (!bounds) return ApiResponse.error("Invalid FY format. Use YYYY-YY e.g. 2025-26");

  // Get monthly revenue data for the FY (12 months)
  const startDate = bounds.start;
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + i);
    return {
      date: d,
      month: format(d, "MMM yyyy"),
      revenue: 0,
      gmv: 0,
      deals: 0,
    };
  });

  // Query platform fee transactions within FY
  const transactions = await prisma.transaction.findMany({
    where: {
      type: "PLATFORM_FEE",
      status: "COMPLETED",
      createdAt: { gte: bounds.start, lte: bounds.end },
    },
    take: 10000,
  });

  transactions.forEach((tx: { amount: number; createdAt: Date }) => {
    const monthStr = format(tx.createdAt, "MMM yyyy");
    const monthObj = months.find((m) => m.month === monthStr);
    if (monthObj) monthObj.revenue += tx.amount;
  });

  // Query completed deals within FY
  const deals = await prisma.deal.findMany({
    where: {
      status: "COMPLETED",
      completedAt: { gte: bounds.start, lte: bounds.end },
    },
    select: { totalAmount: true, completedAt: true },
  });

  deals.forEach((deal: { totalAmount: number; completedAt: Date | null }) => {
    if (!deal.completedAt) return;
    const monthStr = format(deal.completedAt, "MMM yyyy");
    const monthObj = months.find((m) => m.month === monthStr);
    if (monthObj) {
      monthObj.gmv += deal.totalAmount;
      monthObj.deals += 1;
    }
  });

  // Summary totals
  const totalRevenue = months.reduce((s, m) => s + m.revenue, 0);
  const totalGMV = months.reduce((s, m) => s + m.gmv, 0);
  const totalDeals = months.reduce((s, m) => s + m.deals, 0);
  const avgDealSize = totalDeals > 0 ? Math.round(totalGMV / totalDeals) : 0;

  if (fmt === "csv") {
    const rows = months.map((m) => ({
      "Month": m.month,
      "Revenue (₹)": paiseToRupees(m.revenue),
      "GMV (₹)": paiseToRupees(m.gmv),
      "Deals": String(m.deals),
      "Avg Deal Size (₹)": m.deals > 0 ? paiseToRupees(Math.round(m.gmv / m.deals)) : "N/A",
    }));

    // Add summary rows
    rows.push(
      { "Month": "", "Revenue (₹)": "─────", "GMV (₹)": "─────", "Deals": "─────", "Avg Deal Size (₹)": "─────" },
      { "Month": "TOTAL", "Revenue (₹)": paiseToRupees(totalRevenue), "GMV (₹)": paiseToRupees(totalGMV), "Deals": String(totalDeals), "Avg Deal Size (₹)": paiseToRupees(avgDealSize) }
    );

    // Add platform header and footer
    const platformHeader = getPlatformHeader().map((line) => ({ "Platform Info": line }));
    const platformFooter = getPlatformFooter().map((line) => ({ "Platform Info": line }));

    const finalRows = [
      ...platformHeader,
      { "Month": "", "Revenue (₹)": "─────", "GMV (₹)": "─────", "Deals": "─────", "Avg Deal Size (₹)": "─────" },
      ...rows,
      ...platformFooter,
    ];

    const filename = `decisional-platform-revenue-${fy}-${Date.now()}.csv`;
    return new Response(toCsv(finalRows), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return ApiResponse.success({
    fy,
    period: { from: bounds.start, to: bounds.end },
    summary: {
      totalRevenueRupees: paiseToRupees(totalRevenue),
      totalGMVRupees: paiseToRupees(totalGMV),
      totalDeals,
      avgDealSizeRupees: paiseToRupees(avgDealSize),
    },
    monthly: months.map((m) => ({
      month: m.month,
      revenueRupees: paiseToRupees(m.revenue),
      gmvRupees: paiseToRupees(m.gmv),
      deals: m.deals,
      avgDealSizeRupees: m.deals > 0 ? paiseToRupees(Math.round(m.gmv / m.deals)) : "N/A",
    })),
  }, "Platform revenue report generated");
}

function getCurrentFY(): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  const yr = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${yr}-${String(yr + 1).slice(-2)}`;
}

export const GET = apiWrapper(_handler, { 
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.REPORTS,
});
