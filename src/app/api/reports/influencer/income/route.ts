import { NextRequest } from "next/server";
import { apiWrapper, ApiResponse } from "@/lib/api-wrapper";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { toCsv, csvResponse, paiseToRupees, getIndianFYBounds } from "@/lib/csv-export";
import { format } from "date-fns";
import { RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
import { getPlatformHeader, getPlatformFooter } from "@/lib/platform-config";

async function _handler(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.userType !== "INFLUENCER") {
    return ApiResponse.unauthorized();
  }

  const { searchParams } = new URL(req.url);
  const fy      = searchParams.get("fy") ?? getCurrentFY();
  const fmt     = searchParams.get("format") === "csv" ? "csv" : "json";
  
  const bounds = getIndianFYBounds(fy);
  if (!bounds) return ApiResponse.error("Invalid FY format. Use YYYY-YY e.g. 2025-26");

  // Get influencer profile id
  const profile = await prisma.influencerProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, displayName: true },
  });
  if (!profile) return ApiResponse.error("Profile not found", 404);

  // ─── Deals in this FY ───
  const deals = await prisma.deal.findMany({
    where: {
      influencerId: profile.id,
      status: "COMPLETED",
      completedAt: { gte: bounds.start, lte: bounds.end },
    },
    select: {
      id: true,
      amount: true,
      platformFee: true,
      grossPayout: true,
      tdsDeducted: true,
      netPayout: true,
      completedAt: true,
      campaign: {
        select: { title: true, targetCategories: true },
      },
      brand: {
        select: { companyName: true },
      },
    },
    orderBy: { completedAt: "asc" },
  });

  // ─── Summary Totals ───
  const totalGross      = deals.reduce((s, d) => s + (d.grossPayout || d.amount), 0);
  const totalPlatformFee = deals.reduce((s, d) => s + d.platformFee, 0);
  const totalTDS        = deals.reduce((s, d) => s + (d.tdsDeducted || 0), 0);
  const totalNet        = deals.reduce((s, d) => s + (d.netPayout || d.amount - d.platformFee), 0);

  // ─── Month-wise breakdown ───
  const monthMap = new Map<string, { gross: number; tds: number; net: number; count: number }>();
  for (const deal of deals) {
    if (!deal.completedAt) continue;
    const month = format(deal.completedAt, "MMM yyyy");
    const prev = monthMap.get(month) ?? { gross: 0, tds: 0, net: 0, count: 0 };
    monthMap.set(month, {
      gross: prev.gross + (deal.grossPayout || deal.amount),
      tds:   prev.tds   + (deal.tdsDeducted || 0),
      net:   prev.net   + (deal.netPayout || deal.amount - deal.platformFee),
      count: prev.count + 1,
    });
  }

  if (fmt === "csv") {
    // ─── CSV: Deal-wise rows ───
    const rows = deals.map((d) => ({
      "Deal ID":          d.id,
      "Brand":            d.brand?.companyName ?? "—",
      "Campaign":         d.campaign?.title ?? "—",
      "Category":         String(d.campaign?.targetCategories?.[0] ?? "—"),
      "Completed Date":   d.completedAt ? format(d.completedAt, "dd/MM/yyyy") : "—",
      "Gross (₹)":        paiseToRupees(d.grossPayout || d.amount),
      "Platform Fee (₹)": paiseToRupees(d.platformFee),
      "TDS 194-O (₹)":    paiseToRupees(d.tdsDeducted || 0),
      "Net Received (₹)": paiseToRupees(d.netPayout || d.amount - d.platformFee),
    }));

    // Add summary rows at bottom
    rows.push({ "Deal ID": "", "Brand": "", "Campaign": "", "Category": "", "Completed Date": "─────", "Gross (₹)": "─────", "Platform Fee (₹)": "─────", "TDS 194-O (₹)": "─────", "Net Received (₹)": "─────" });
    rows.push({ "Deal ID": "TOTAL", "Brand": `FY ${fy}`, "Campaign": `${deals.length} deals`, "Category": "", "Completed Date": "", "Gross (₹)": paiseToRupees(totalGross), "Platform Fee (₹)": paiseToRupees(totalPlatformFee), "TDS 194-O (₹)": paiseToRupees(totalTDS), "Net Received (₹)": paiseToRupees(totalNet) });

    // Add platform header and footer
    const platformHeader = getPlatformHeader().map((line) => ({ "Platform Info": line }));
    const platformFooter = getPlatformFooter().map((line) => ({ "Platform Info": line }));

    const finalRows = [
      ...platformHeader,
      { "Deal ID": "", "Brand": "", "Campaign": "", "Category": "", "Completed Date": "─────", "Gross (₹)": "─────", "Platform Fee (₹)": "─────", "TDS 194-O (₹)": "─────", "Net Received (₹)": "─────" },
      ...rows,
      ...platformFooter,
    ];

    const filename = `decisional-income-${fy}-${profile.displayName?.replace(/\s+/g, "_") ?? session.user.id}.csv`;
    return csvResponse(toCsv(finalRows), filename);
  }

  // ─── JSON response ───
  return ApiResponse.success({
    fy,
    influencer:    profile.displayName,
    period:        { from: bounds.start, to: bounds.end },
    summary: {
      totalGrossRupees:       paiseToRupees(totalGross),
      totalPlatformFeeRupees: paiseToRupees(totalPlatformFee),
      totalTDSRupees:         paiseToRupees(totalTDS),
      totalNetRupees:         paiseToRupees(totalNet),
      dealCount:              deals.length,
      tdsSection:             "194-O (0.1% above ₹50L threshold)",
    },
    monthWise: Array.from(monthMap.entries()).map(([month, data]) => ({
      month,
      ...data,
      grossRupees: paiseToRupees(data.gross),
      netRupees:   paiseToRupees(data.net),
      tdsRupees:   paiseToRupees(data.tds),
    })),
    deals: deals.map((d) => ({
      id:             d.id,
      brand:          d.brand?.companyName,
      campaign:       d.campaign?.title,
      completedAt:    d.completedAt,
      grossRupees:    paiseToRupees(d.grossPayout || d.amount),
      platformFeeRupees: paiseToRupees(d.platformFee),
      tdsRupees:      paiseToRupees(d.tdsDeducted || 0),
      netRupees:      paiseToRupees(d.netPayout || d.amount - d.platformFee),
    })),
  }, "Income report generated");
}

function getCurrentFY(): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(new Date().getTime() + IST_OFFSET_MS);
  const yr = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${yr}-${String(yr + 1).slice(-2)}`;
}

export const GET = apiWrapper(_handler, { 
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.REPORTS,
});
