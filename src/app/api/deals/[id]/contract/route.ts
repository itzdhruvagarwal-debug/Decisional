import { NextRequest } from "next/server";
import { apiWrapper, ApiResponse } from "@/lib/api-wrapper";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { toCsv, csvResponse, paiseToRupees } from "@/lib/csv-export";
import { format } from "date-fns";
import { RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";
import { getPlatformHeader, getPlatformFooter } from "@/lib/platform-config";
import { getDealParticipantRole } from "@/lib/utils";
import { decrypt } from "@/lib/encryption";

function tryDecrypt(value?: string | null): string {
  if (!value) return "—";
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

interface PlatformDetails {
  name?: string;
  legalName?: string;
  address?: string;
  gstin?: string;
  email?: string;
  phone?: string;
  website?: string;
}

interface ContractDeliverable {
  type?: string;
  count?: number;
  platform?: string;
  details?: string;
}

interface ContractTermsType {
  platform?: PlatformDetails;
  version?: number;
  createdAt?: string | Date;
  dealAmount?: number;
  platformFee?: number;
  gatewayFee?: number;
  platformFeePercent?: number;
  totalAmount?: number;
  influencerPayout?: number;
  requiresProduct?: boolean;
  productName?: string;
  productValue?: number;
  productDescription?: string;
  deliverables?: ContractDeliverable[];
  mandatoryTags?: string[];
  disclosureRequirement?: string;
  submissionDeadline?: string | Date;
  reviewPeriodHours?: number;
  postingDeadline?: string | Date;
  includedRevisions?: number;
  costPerExtraRevision?: number;
  cancellationFee?: {
    beforeApproval?: string | number;
    afterApproval?: string | number;
    afterSubmission?: string | number;
    afterPosting?: string | number;
  };
  brandLateApprovalFee?: number;
  contentUsage?: {
    organicRepost?: string;
    paidAds?: string;
    whitelisting?: string;
  };
  influencerObligations?: string[];
  brandObligations?: string[];
  taxNote?: string;
}

interface ContractSignatureDetails {
  contractHash?: string;
  isFullySigned?: boolean;
  signedAt?: string | Date;
  influencerSignature?: {
    signedAt: string | Date;
    signatureHash: string;
  };
  brandSignature?: {
    signedAt: string | Date;
    signatureHash: string;
  };
}

function buildMandatoryContractCsvRows(rows: Record<string, string | number>[], deal: any, terms: ContractTermsType, platform: PlatformDetails) {
  // Platform details
  rows.push(
    { "Section": "PLATFORM DETAILS", "Field": "", "Value": "" },
    { "Section": "", "Field": "Platform Name", "Value": platform.name || "Decisional" },
    { "Section": "", "Field": "Legal Name", "Value": platform.legalName || "—" },
    { "Section": "", "Field": "Address", "Value": platform.address || "—" },
    { "Section": "", "Field": "GSTIN", "Value": platform.gstin || "—" },
    { "Section": "", "Field": "Email", "Value": platform.email || "—" },
    { "Section": "", "Field": "Phone", "Value": platform.phone || "—" },
    { "Section": "", "Field": "Website", "Value": platform.website || "—" },
    { "Section": "", "Field": "", "Value": "─────" }
  );

  // Deal Information
  rows.push(
    { "Section": "DEAL INFORMATION", "Field": "", "Value": "" },
    { "Section": "", "Field": "Deal ID", "Value": deal.id },
    { "Section": "", "Field": "Campaign", "Value": deal.campaign.title },
    { "Section": "", "Field": "Category", "Value": String(deal.campaign.targetCategories?.[0] || "—") },
    { "Section": "", "Field": "Influencer", "Value": deal.influencer.displayName },
    { "Section": "", "Field": "Influencer Handle", "Value": deal.influencer.instagramHandle || "—" },
    { "Section": "", "Field": "Brand", "Value": deal.brand?.companyName || "—" },
    { "Section": "", "Field": "Brand GSTIN", "Value": tryDecrypt(deal.brand?.user?.taxCompliance?.gstin) },
    { "Section": "", "Field": "Influencer PAN (last 4)", "Value": deal.influencer.user?.taxCompliance?.panLast4 || "—" },
    { "Section": "", "Field": "Status", "Value": deal.status },
    { "Section": "", "Field": "Contract Version", "Value": String(terms.version || 1) },
    { "Section": "", "Field": "Created At", "Value": terms.createdAt ? format(new Date(terms.createdAt), "dd/MM/yyyy HH:mm") : "—" },
    { "Section": "", "Field": "", "Value": "─────" }
  );
}

function buildOptionalContractCsvRows(rows: Record<string, string | number>[], terms: ContractTermsType) {
  // Product Details (if applicable)
  if (terms.requiresProduct) {
    rows.push(
      { "Section": "PRODUCT DETAILS", "Field": "", "Value": "" },
      { "Section": "", "Field": "Product Required", "Value": "Yes" },
      { "Section": "", "Field": "Product Name", "Value": terms.productName || "—" },
      { "Section": "", "Field": "Product Value (₹)", "Value": terms.productValue ? paiseToRupees(terms.productValue) : "—" },
      { "Section": "", "Field": "Product Description", "Value": terms.productDescription || "—" },
      { "Section": "", "Field": "", "Value": "─────" }
    );
  }

  // Deliverables
  rows.push({ "Section": "DELIVERABLES", "Field": "", "Value": "" });
  if (Array.isArray(terms.deliverables)) {
    terms.deliverables.forEach((del, idx: number) => {
      rows.push({ "Section": "", "Field": `Deliverable ${idx + 1}`, "Value": "" });
      rows.push({ "Section": "", "Field": "Type", "Value": del.type || "—" });
      rows.push({ "Section": "", "Field": "Count", "Value": String(del.count || 1) });
      rows.push({ "Section": "", "Field": "Platform", "Value": del.platform || "—" });
      rows.push({ "Section": "", "Field": "Details", "Value": del.details || "—" });
      rows.push({ "Section": "", "Field": "", "Value": "─────" });
    });
  }
}

function buildPolicyAndObligationCsvRows(rows: Record<string, string | number>[], terms: ContractTermsType) {
  // Cancellation Policy
  rows.push({ "Section": "CANCELLATION POLICY", "Field": "", "Value": "" });
  if (terms.cancellationFee) {
    rows.push(
      { "Section": "", "Field": "Before Approval", "Value": `${terms.cancellationFee.beforeApproval || 0}% fee` },
      { "Section": "", "Field": "After Approval", "Value": `${terms.cancellationFee.afterApproval || 30}% fee` },
      { "Section": "", "Field": "After Submission", "Value": `${terms.cancellationFee.afterSubmission || 70}% fee` },
      { "Section": "", "Field": "After Posting", "Value": `${terms.cancellationFee.afterPosting || 100}% fee` }
    );
  }
  rows.push(
    { "Section": "", "Field": "Brand Late Approval Fee", "Value": `${terms.brandLateApprovalFee || 10}%` },
    { "Section": "", "Field": "", "Value": "─────" }
  );

  // Content Usage
  rows.push({ "Section": "CONTENT USAGE RIGHTS", "Field": "", "Value": "" });
  if (terms.contentUsage) {
    rows.push(
      { "Section": "", "Field": "Organic Repost", "Value": terms.contentUsage.organicRepost || "—" },
      { "Section": "", "Field": "Paid Ads", "Value": terms.contentUsage.paidAds || "—" },
      { "Section": "", "Field": "Whitelisting", "Value": terms.contentUsage.whitelisting || "—" }
    );
  }
  rows.push({ "Section": "", "Field": "", "Value": "─────" });

  // Obligations
  rows.push({ "Section": "INFLUENCER OBLIGATIONS", "Field": "", "Value": "" });
  if (Array.isArray(terms.influencerObligations)) {
    terms.influencerObligations.forEach((obligation: string, idx: number) => {
      rows.push({ "Section": "", "Field": `Obligation ${idx + 1}`, "Value": obligation });
    });
  }
  rows.push({ "Section": "", "Field": "", "Value": "─────" });

  rows.push({ "Section": "BRAND OBLIGATIONS", "Field": "", "Value": "" });
  if (Array.isArray(terms.brandObligations)) {
    terms.brandObligations.forEach((obligation: string, idx: number) => {
      rows.push({ "Section": "", "Field": `Obligation ${idx + 1}`, "Value": obligation });
    });
  }
  rows.push({ "Section": "", "Field": "", "Value": "─────" });
}

function buildLegalAndSignatureCsvRows(rows: Record<string, string | number>[], deal: any, terms: ContractTermsType) {
  // Tax Note
  rows.push(
    { "Section": "TAX & LEGAL", "Field": "", "Value": "" },
    { "Section": "", "Field": "Tax Note", "Value": terms.taxNote || "—" },
    { "Section": "", "Field": "", "Value": "─────" }
  );

  // Mandatory Tags
  rows.push({ "Section": "MANDATORY TAGS", "Field": "", "Value": "" });
  if (Array.isArray(terms.mandatoryTags)) {
    terms.mandatoryTags.forEach((tag: string, idx: number) => {
      rows.push({ "Section": "", "Field": `Tag ${idx + 1}`, "Value": tag });
    });
  }
  rows.push({ "Section": "", "Field": "", "Value": "─────" });

  // Disclosure Requirement
  rows.push(
    { "Section": "DISCLOSURE", "Field": "", "Value": "" },
    { "Section": "", "Field": "Disclosure Requirement", "Value": terms.disclosureRequirement || "—" },
    { "Section": "", "Field": "", "Value": "─────" }
  );

  // Signature Information
  rows.push({ "Section": "SIGNATURES", "Field": "", "Value": "" });
  if (deal.contractSignature) {
    const sig = deal.contractSignature as ContractSignatureDetails;
    rows.push(
      { "Section": "", "Field": "Contract Hash", "Value": sig.contractHash || "—" },
      { "Section": "", "Field": "Fully Signed", "Value": sig.isFullySigned ? "Yes" : "No" },
      { "Section": "", "Field": "Signed At", "Value": sig.signedAt ? format(new Date(sig.signedAt), "dd/MM/yyyy HH:mm") : "—" }
    );

    if (sig.influencerSignature) {
      rows.push(
        { "Section": "", "Field": "Influencer Signed At", "Value": format(new Date(sig.influencerSignature.signedAt), "dd/MM/yyyy HH:mm") },
        { "Section": "", "Field": "Influencer Signature Hash", "Value": sig.influencerSignature.signatureHash || "—" }
      );
    }

    if (sig.brandSignature) {
      rows.push(
        { "Section": "", "Field": "Brand Signed At", "Value": format(new Date(sig.brandSignature.signedAt), "dd/MM/yyyy HH:mm") },
        { "Section": "", "Field": "Brand Signature Hash", "Value": sig.brandSignature.signatureHash || "—" }
      );
    }
  } else {
    rows.push({ "Section": "", "Field": "Status", "Value": "Not signed yet" });
  }
  rows.push({ "Section": "", "Field": "", "Value": "─────" });
}

function buildContractCsvRows(deal: any, terms: ContractTermsType, platform: PlatformDetails) {
  const rows: Record<string, string | number>[] = [];

  buildMandatoryContractCsvRows(rows, deal, terms, platform);

  // Financial Terms
  rows.push(
    { "Section": "FINANCIAL TERMS", "Field": "", "Value": "" },
    { "Section": "", "Field": "Creator Fee (₹)", "Value": paiseToRupees(terms.dealAmount || 0) },
    { "Section": "", "Field": "Platform Fee (₹)", "Value": paiseToRupees(terms.platformFee || 0) },
    { "Section": "", "Field": "Gateway Fee (₹)", "Value": paiseToRupees(terms.gatewayFee || 0) },
    { "Section": "", "Field": "Platform Fee %", "Value": `${terms.platformFeePercent || 10}%` },
    { "Section": "", "Field": "Total Payable (₹)", "Value": paiseToRupees(terms.totalAmount || 0) },
    { "Section": "", "Field": "Influencer Payout (₹)", "Value": paiseToRupees(terms.influencerPayout || 0) },
    { "Section": "", "Field": "", "Value": "─────" }
  );

  buildOptionalContractCsvRows(rows, terms);

  // Timeline
  rows.push(
    { "Section": "TIMELINE", "Field": "", "Value": "" },
    { "Section": "", "Field": "Submission Deadline", "Value": terms.submissionDeadline ? format(new Date(terms.submissionDeadline), "dd/MM/yyyy") : "—" },
    { "Section": "", "Field": "Review Period (hours)", "Value": String(terms.reviewPeriodHours || 48) },
    { "Section": "", "Field": "Posting Deadline", "Value": terms.postingDeadline ? format(new Date(terms.postingDeadline), "dd/MM/yyyy") : "—" },
    { "Section": "", "Field": "", "Value": "─────" }
  );

  // Revisions
  rows.push(
    { "Section": "REVISIONS", "Field": "", "Value": "" },
    { "Section": "", "Field": "Included Revisions", "Value": String(terms.includedRevisions || 2) },
    { "Section": "", "Field": "Cost Per Extra Revision (₹)", "Value": paiseToRupees(terms.costPerExtraRevision || 50000) },
    { "Section": "", "Field": "", "Value": "─────" }
  );

  buildPolicyAndObligationCsvRows(rows, terms);
  buildLegalAndSignatureCsvRows(rows, deal, terms);

  return rows;
}

async function _handler(
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[]>> },
) {
  const resolvedParams = await context.params;
  const dealId = resolvedParams.id as string;
  const session = await auth();

  if (!session?.user?.id) {
    return ApiResponse.unauthorized();
  }

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      influencer: {
        select: {
          userId: true,
          displayName: true,
          instagramHandle: true,
          user: {
            select: {
              taxCompliance: {
                select: {
                  panLast4: true,
                },
              },
            },
          },
        },
      },
      brand: {
        select: {
          userId: true,
          companyName: true,
          user: {
            select: {
              taxCompliance: {
                select: {
                  gstin: true,
                },
              },
            },
          },
        },
      },
      campaign: {
        select: {
          title: true,
          targetCategories: true,
        },
      },
    },
  });

  if (!deal) {
    return ApiResponse.error("Deal not found", 404);
  }

  // Check if user is a party to this deal
  const { isInfluencer, isBrand } = getDealParticipantRole(deal, session.user.id);
  if (!isInfluencer && !isBrand) {
    return ApiResponse.forbidden();
  }

  if (!deal.contractTerms) {
    return ApiResponse.error("No contract terms available for this deal", 400);
  }

  const terms = deal.contractTerms as ContractTermsType;
  const platform = terms.platform || {};

  const rows = buildContractCsvRows(deal, terms, platform);

  // Add platform header and footer
  const platformHeader = getPlatformHeader().map((line) => ({ "Section": "PLATFORM HEADER", "Field": "", "Value": line }));
  const platformFooter = getPlatformFooter().map((line) => ({ "Section": "PLATFORM FOOTER", "Value": line, "Field": "" }));

  const finalRows = [
    ...platformHeader,
    ...rows,
    ...platformFooter,
  ];

  const filename = `decisional-contract-${deal.campaign.title.replace(/\s+/g, "_")}-${dealId.slice(0, 8)}-${Date.now()}.csv`;
  return csvResponse(toCsv(finalRows), filename);
}

export const GET = apiWrapper(_handler, {
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.REPORTS,
});
