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
    let str: string;
    if (typeof val === "string") {
      str = val;
    } else if (typeof val === "number" || typeof val === "boolean" || typeof val === "bigint") {
      str = String(val);
    } else if (val instanceof Date) {
      str = val.toISOString();
    } else if (typeof val === "object") {
      // Explicitly JSON-stringify objects rather than falling through to String()
      // which would produce the unhelpful "[object Object]" representation.
      str = JSON.stringify(val);
    } else {
      str = "";
    }
    // Neutralize formula injection characters: =, +, -, @, Tab, CR
    if (
      str.startsWith("=") ||
      str.startsWith("+") ||
      str.startsWith("-") ||
      str.startsWith("@") ||
      str.startsWith("\t") ||
      str.startsWith("\r")
    ) {
      str = "'" + str;
    }

    // Wrap in quotes if contains comma, quote, or newline
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replaceAll('"', '""')}"`;
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
  const match = /^(\d{4})-(\d{2})$/.exec(fy);
  if (!match) return null;
  
  const startYear = Number.parseInt(match[1]!, 10);
  const endYear = startYear + 1;
  
  // April 1 of startYear, 00:00 IST = March 31 18:30 UTC
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const start = new Date(Date.UTC(startYear, 3, 1, 0, 0, 0, 0) - IST_OFFSET_MS);
  const end   = new Date(Date.UTC(endYear,   2, 31, 23, 59, 59, 999) - IST_OFFSET_MS);
  
  return { start, end };
}

/**
 * Returns the current Indian Financial Year string (e.g. "2025-26").
 */
export function getCurrentFY(): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  const yr = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${yr}-${String(yr + 1).slice(-2)}`;
}

/**
 * Escapes a CSV field value (protects commas, quotes, formula injection).
 */
export function csvEsc(v: string | number): string {
  const s = String(v);
  return s.includes(",") || s.includes('"') ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Returns a labelled CSV row line. */
export function csvRow(label: string, value: string | number): string {
  return `${csvEsc(label)},${csvEsc(value)}\r\n`;
}

/** Returns an empty CSV separator line. */
export function csvSep(): string {
  return `\r\n`;
}

/** Returns a section title CSV line. */
export function csvTitle(t: string): string {
  return `${csvEsc(t)},\r\n`;
}

/**
 * Returns the standard Decisional platform header block for CSV reports.
 */
export function csvPlatformHeader(reportType: string): string {
  let out = "";
  out += csvRow("DECISIONAL TECHNOLOGIES PRIVATE LIMITED", "");
  out += csvRow(reportType, "");
  out += csvRow("Website", "https://decisional.in");
  out += csvRow("Support", "support@decisional.in");
  out += csvSep();
  return out;
}
