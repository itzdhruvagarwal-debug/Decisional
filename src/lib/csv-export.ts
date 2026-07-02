/**
 * CSV Export Utilities
 * Zero-dependency CSV generation for financial reports
 */

export type CsvRow = Record<string, string | number | null | undefined>;

/**
 * Converts array of objects to RFC 4180 CSV string.
 * Handles commas, quotes, newlines in values automatically.
 */
export function toCsv(rows: CsvRow[], headers?: string[]): string {
  if (rows.length === 0) return "";
  
  const keys = headers ?? Object.keys(rows[0]!);
  
  const escape = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    // Wrap in quotes if contains comma, quote, or newline
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerRow = keys.map(escape).join(",");
  const dataRows = rows.map((row) =>
    keys.map((k) => escape(row[k])).join(",")
  );
  
  return [headerRow, ...dataRows].join("\r\n");
}

/**
 * Returns a NextResponse with CSV content and download headers.
 */
export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Convert paise to rupee string for CSV display.
 */
export function paiseToRupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

/**
 * Get Indian Financial Year boundaries for a given date.
 * India FY: April 1 to March 31 (IST)
 */
export function getIndianFYBounds(fy: string): { start: Date; end: Date } | null {
  // fy format: "2025-26"
  const match = fy.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  
  const startYear = parseInt(match[1]!);
  const endYear = startYear + 1;
  
  // April 1 of startYear, 00:00 IST = March 31 18:30 UTC
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const start = new Date(Date.UTC(startYear, 3, 1, 0, 0, 0, 0) - IST_OFFSET_MS);
  const end   = new Date(Date.UTC(endYear,   2, 31, 23, 59, 59, 999) - IST_OFFSET_MS);
  
  return { start, end };
}

/**
 * List available FYs from a given earliest date to now.
 */
export function listAvailableFYs(earliestDate: Date): string[] {
  const fys: string[] = [];
  const now = new Date();
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const currentFYStart = istNow.getUTCMonth() >= 3
    ? istNow.getUTCFullYear()
    : istNow.getUTCFullYear() - 1;
  
  const istEarliest = new Date(earliestDate.getTime() + IST_OFFSET_MS);
  const earliestFYStart = istEarliest.getUTCMonth() >= 3
    ? istEarliest.getUTCFullYear()
    : istEarliest.getUTCFullYear() - 1;
  
  for (let yr = earliestFYStart; yr <= currentFYStart; yr++) {
    fys.push(`${yr}-${String(yr + 1).slice(-2)}`);
  }
  return fys.reverse(); // Most recent first
}
