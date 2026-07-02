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
  if (!session?.user?.id || session.user.userType !== "ADMIN") {
    return ApiResponse.unauthorized();
  }

  const { searchParams } = new URL(req.url);
  const fy      = searchParams.get("fy") ?? getCurrentFY();
  const fmt     = searchParams.get("format") === "csv" ? "csv" : "json";
  
  const bounds = getIndianFYBounds(fy);
  if (!bounds) return ApiResponse.error("Invalid FY format. Use YYYY-YY e.g. 2025-26");

  // Query all TDS transactions in FY
  const tdsTransactions = await prisma.transaction.findMany({
    where: {
      type: "DEBIT",
      status: "COMPLETED",
      createdAt: { gte: bounds.start, lte: bounds.end },
      metadata: {
        path: ["source"],
        equals: "tds_withholding",
      },
    },
    include: {
      deal: {
        include: {
          influencer: {
            include: {
              user: {
                include: { 
                  taxCompliance: { 
                    select: { panLast4: true } 
                  } 
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Summary totals
  const totalGross = tdsTransactions.reduce((s, t) => s + ((t.metadata as Record<string, number | undefined>)?.grossPayout ?? 0), 0);
  const totalTDS = tdsTransactions.reduce((s, t) => s + t.amount, 0);
  const totalNet = tdsTransactions.reduce((s, t) => s + ((t.metadata as Record<string, number | undefined>)?.netPayout ?? 0), 0);

  if (fmt === "csv") {
    // CSV output for CA/tax consultant
    const rows = tdsTransactions.map((t) => ({
      "Deal ID": t.dealId,
      "Influencer": t.deal?.influencer?.displayName ?? "—",
      "PAN (last 4)": t.deal?.influencer?.user?.taxCompliance?.panLast4 ?? "—",
      "Gross (₹)": paiseToRupees((t.metadata as Record<string, number | undefined>)?.grossPayout ?? 0),
      "TDS Rate": "0.1%",
      "TDS (₹)": paiseToRupees(t.amount),
      "Net (₹)": paiseToRupees((t.metadata as Record<string, number | undefined>)?.netPayout ?? 0),
      "Date": format(new Date(t.createdAt), "dd/MM/yyyy"),
      "Section": "194-O",
    }));

    // Add summary rows
    rows.push({ "Deal ID": "", "Influencer": "", "PAN (last 4)": "─────", "Gross (₹)": "─────", "TDS Rate": "─────", "TDS (₹)": "─────", "Net (₹)": "─────", "Date": "─────", "Section": "─────" });
    rows.push({ "Deal ID": "TOTAL", "Influencer": `${tdsTransactions.length} deals`, "PAN (last 4)": "", "Gross (₹)": paiseToRupees(totalGross), "TDS Rate": "", "TDS (₹)": paiseToRupees(totalTDS), "Net (₹)": paiseToRupees(totalNet), "Date": `FY ${fy}`, "Section": "194-O" });

    // Add platform header and footer
    const platformHeader = getPlatformHeader().map((line) => ({ "Platform Info": line }));
    const platformFooter = getPlatformFooter().map((line) => ({ "Platform Info": line }));

    const finalRows = [
      ...platformHeader,
      { "Deal ID": "", "Influencer": "", "PAN (last 4)": "─────", "Gross (₹)": "─────", "TDS Rate": "─────", "TDS (₹)": "─────", "Net (₹)": "─────", "Date": "─────", "Section": "─────" },
      ...rows,
      ...platformFooter,
    ];

    const filename = `decisional-tds-summary-${fy}-${Date.now()}.csv`;
    return csvResponse(toCsv(finalRows), filename);
  }

  // JSON response
  return ApiResponse.success({
    fy,
    period: { from: bounds.start, to: bounds.end },
    summary: {
      totalGrossRupees: paiseToRupees(totalGross),
      totalTDSRupees: paiseToRupees(totalTDS),
      totalNetRupees: paiseToRupees(totalNet),
      dealCount: tdsTransactions.length,
      tdsSection: "194-O (0.1% above ₹50L threshold)",
    },
    transactions: tdsTransactions.map((t) => ({
      dealId: t.dealId,
      influencer: t.deal?.influencer?.displayName,
      panLast4: t.deal?.influencer?.user?.taxCompliance?.panLast4,
      grossRupees: paiseToRupees((t.metadata as Record<string, number | undefined>)?.grossPayout ?? 0),
      tdsRate: "0.1%",
      tdsRupees: paiseToRupees(t.amount),
      netRupees: paiseToRupees((t.metadata as Record<string, number | undefined>)?.netPayout ?? 0),
      date: t.createdAt,
      section: "194-O",
    })),
  }, "TDS summary generated");
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
