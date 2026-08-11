import { z } from "zod";

export const disputeEscalationSchema = z.object({
reason: z.string().min(10, "Reason must be at least 10 characters").max(500),
});

export const disputeEvidenceSchema = z.object({
type: z.enum(["CONTRACT", "DELIVERABLE", "CHAT_LOG", "PAYMENT_PROOF", "OTHER"]),
url: z
.string()
.trim()
.refine((val) => {
if (!val) return true;
if (val.startsWith("/")) return true;
try {
const u = new URL(val);
return u.protocol === "http:" || u.protocol === "https:";
} catch {
return false;
}
}, "Please enter a valid URL or local path"),
description: z.string().min(5, "Description must be at least 5 characters").max(500),
});

export interface Finding {
check: string;
result: "PASS" | "FAIL" | "WARNING" | "N/A";
detail: string;
}

export interface MediatorAnalysis {
disputeId: string;
tier: number;
verdict: string;
confidence: string;
refundPercentage: number;
influencerPayoutPercentage: number;
trustScoreChanges: { influencer: number; brand: number };
explanation: string;
findings: Finding[];
suggestedAction: string;
autoResolvable: boolean;
}

export interface DisputeDetail {
id: string;
status: string;
tier: number;
type: string;
reason: string;
description: string;
createdAt: string;
resolvedAt?: string | null;
resolution?: string | null;
deal: {
id: string;
amount: number;
campaign: {
title: string;
};
};
evidence: Array<{
id: string;
type: string;
url?: string;
description?: string;
submittedAt?: string;
submittedByUserId?: string;
}>;
influencerOutcome?: string | null;
brandOutcome?: string | null;
}

export function getStatusColor(status: string) {
switch (status) {
case "OPEN":
return "var(--color-primary)";
case "TIER1_AUTO":
return "var(--color-accent-cyan)";
case "TIER2_MEDIATION":
return "var(--color-warning)";
case "TIER3_ARBITRATION":
return "#ef4444";
case "RESOLVED":
return "var(--color-success)";
case "CLOSED":
return "var(--color-text-muted)";
default:
return "var(--color-text-secondary)";
}
}

export function getVerdictColor(verdict: string) {
switch (verdict) {
case "INFLUENCER_FAVORED":
return "#22c55e";
case "BRAND_FAVORED":
return "#3b82f6";
case "SPLIT":
return "#f59e0b";
case "DISMISSED":
return "#6b7280";
case "ESCALATE":
return "#ef4444";
default:
return "var(--color-text-secondary)";
}
}

export function getFindingColor(result: string) {
switch (result) {
case "PASS":
return "#22c55e";
case "FAIL":
return "#ef4444";
case "WARNING":
return "#f59e0b";
default:
return "#6b7280";
}
}

export function getFindingIcon(result: string) {
  switch (result) {
    case "PASS":
      return "✓";
    case "FAIL":
      return "✗";
    case "WARNING":
      return "⚠";
    default:
      return "—";
  }
}
