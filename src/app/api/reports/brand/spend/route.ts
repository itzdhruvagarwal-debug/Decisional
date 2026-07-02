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
  if (!session?.user?.id || session.user.userType !== "BRAND") {
    return ApiResponse.unauthorized();
  }

  const { searchParams } = new URL(req.url);
  const fy      = searchParams.get("fy") ?? getCurrentFY();
  const fmt     = searchParams.get("format") === "csv" ? "csv" : "json";
  
  const bounds = getIndianFYBounds(fy);
  if (!bounds) return ApiResponse.error("Invalid FY format. Use YYYY-YY e.g. 2025-26");

  // Get brand profile
  const profile = await prisma.brandProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true, companyName: true },
  });
  if (!profile) return ApiResponse.error("Profile not found", 404);

  // ─── Deals in this FY ───
  const deals = await prisma.deal.findMany({
    where: {
      brandId: profile.id,
      status: "COMPLETED",
      completedAt: { gte: bounds.start, lte: bounds.end },
    },
    select: {
      id: true,
      amount: true,
      totalAmount: true,
      platformFee: true,
      completedAt: true,
      campaign: { 
        select: { 
          id: true,
          title: true, 
          targetCategories: true 
        } 
      },
      influencer: {
        select: {
          displayName: true,
          instagramHandle: true,
          instagramFollowers: true,
        },
      },
    },
    orderBy: { completedAt: "asc" },
  });

  // ─── Summary Totals ───
  const totalPaid = deals.reduce((s, d) => s + d.amount, 0);
  const totalPlatformFee = deals.reduce((s, d) => s + d.platformFee, 0);
  const totalGST = Math.round(totalPlatformFee * 0.18); // 18% GST on platform fee
  const totalInvoice = totalPlatformFee + totalGST;

  if (fmt === "csv") {
    // ─── CSV: Deal-wise rows ───
    const rows: Record<string, string | number>[] = deals.map((d) => {
      const gstOnFee = Math.round(d.platformFee * 0.18);
      const invoiceTotal = d.platformFee + gstOnFee;
      
      return {
        "Date": d.completedAt ? format(d.completedAt, "dd/MM/yyyy") : "—",
        "Campaign": d.campaign?.title ?? "—",
        "Influencer": d.influencer?.displayName ?? "—",
        "Platform": d.influencer?.instagramHandle ?? "—",
        "Followers": d.influencer?.instagramFollowers ?? 0,
        "Paid (₹)": paiseToRupees(d.amount),
        "Fee (₹)": paiseToRupees(d.platformFee),
        "GST 18% (₹)": paiseToRupees(gstOnFee),
        "Invoice Total (₹)": paiseToRupees(invoiceTotal),
      };
    });

    // Add summary rows at bottom
    rows.push({ "Date": "", "Campaign": "", "Influencer": "", "Platform": "", "Followers": "─────", "Paid (₹)": "─────", "Fee (₹)": "─────", "GST 18% (₹)": "─────", "Invoice Total (₹)": "─────" });
    rows.push({ "Date": "TOTAL", "Campaign": `FY ${fy}`, "Influencer": `${deals.length} deals`, "Platform": "", "Followers": "", "Paid (₹)": paiseToRupees(totalPaid), "Fee (₹)": paiseToRupees(totalPlatformFee), "GST 18% (₹)": paiseToRupees(totalGST), "Invoice Total (₹)": paiseToRupees(totalInvoice) });

    // Add platform header and footer
    const platformHeader = getPlatformHeader().map((line) => ({ "Platform Info": line }));
    const platformFooter = getPlatformFooter().map((line) => ({ "Platform Info": line }));

    const finalRows = [
      ...platformHeader,
      { "Date": "", "Campaign": "", "Influencer": "", "Platform": "", "Followers": "─────", "Paid (₹)": "─────", "Fee (₹)": "─────", "GST 18% (₹)": "─────", "Invoice Total (₹)": "─────" },
      ...rows,
      ...platformFooter,
    ];

    const filename = `decisional-spend-${fy}-${profile.companyName?.replace(/\s+/g, "_") ?? session.user.id}.csv`;
    return csvResponse(toCsv(finalRows), filename);
  }

  // ─── JSON response ───
  return ApiResponse.success({
    fy,
    period: { from: bounds.start, to: bounds.end },
    summary: {
      totalPaidRupees: paiseToRupees(totalPaid),
      totalFeeRupees: paiseToRupees(totalPlatformFee),
      totalGstRupees: paiseToRupees(totalGST),
      totalInvoiceRupees: paiseToRupees(totalInvoice),
      dealCount: deals.length,
    },
    deals: deals.map((d) => {
      const gstOnFee = Math.round(d.platformFee * 0.18);
      const invoiceTotal = d.platformFee + gstOnFee;
      return {
        id: d.id,
        completedAt: d.completedAt,
        campaign: d.campaign?.title,
        influencer: d.influencer?.displayName,
        paidRupees: paiseToRupees(d.amount),
        platformFeeRupees: paiseToRupees(d.platformFee),
        gstrRupees: paiseToRupees(gstOnFee),
        invoiceTotalRupees: paiseToRupees(invoiceTotal),
      };
    }),
  }, "Spend report generated");
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
