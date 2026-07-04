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

function buildMandatoryContractCsvRows(deal: any, terms: ContractTermsType, platform: PlatformDetails): Record<string, string | number>[] {
  return [
    { "Section": "PLATFORM DETAILS", "Field": "", "Value": "" },
    { "Section": "", "Field": "Platform Name", "Value": platform.name || "Decisional" },
    { "Section": "", "Field": "Legal Name", "Value": platform.legalName || "—" },
    { "Section": "", "Field": "Address", "Value": platform.address || "—" },
    { "Section": "", "Field": "GSTIN", "Value": platform.gstin || "—" },
    { "Section": "", "Field": "Email", "Value": platform.email || "—" },
    { "Section": "", "Field": "Phone", "Value": platform.phone || "—" },
    { "Section": "", "Field": "Website", "Value": platform.website || "—" },
    { "Section": "", "Field": "", "Value": "─────" },
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
  ];
}

function buildOptionalContractCsvRows(terms: ContractTermsType): Record<string, string | number>[] {
  const productRows = terms.requiresProduct ? [
    { "Section": "PRODUCT DETAILS", "Field": "", "Value": "" },
    { "Section": "", "Field": "Product Required", "Value": "Yes" },
    { "Section": "", "Field": "Product Name", "Value": terms.productName || "—" },
    { "Section": "", "Field": "Product Value (₹)", "Value": terms.productValue ? paiseToRupees(terms.productValue) : "—" },
    { "Section": "", "Field": "Product Description", "Value": terms.productDescription || "—" },
    { "Section": "", "Field": "", "Value": "─────" }
  ] : [];

  const deliverableRows = Array.isArray(terms.deliverables)
    ? terms.deliverables.flatMap((del, idx: number) => [
        { "Section": "", "Field": `Deliverable ${idx + 1}`, "Value": "" },
        { "Section": "", "Field": "Type", "Value": del.type || "—" },
        { "Section": "", "Field": "Count", "Value": String(del.count || 1) },
        { "Section": "", "Field": "Platform", "Value": del.platform || "—" },
        { "Section": "", "Field": "Details", "Value": del.details || "—" },
        { "Section": "", "Field": "", "Value": "─────" }
      ])
    : [];

  return [
    ...productRows,
    { "Section": "DELIVERABLES", "Field": "", "Value": "" },
    ...deliverableRows
  ];
}

function buildPolicyAndObligationCsvRows(terms: ContractTermsType): Record<string, string | number>[] {
  const cancellationFeeRows = terms.cancellationFee ? [
    { "Section": "", "Field": "Before Approval", "Value": `${terms.cancellationFee.beforeApproval || 0}% fee` },
    { "Section": "", "Field": "After Approval", "Value": `${terms.cancellationFee.afterApproval || 30}% fee` },
    { "Section": "", "Field": "After Submission", "Value": `${terms.cancellationFee.afterSubmission || 70}% fee` },
    { "Section": "", "Field": "After Posting", "Value": `${terms.cancellationFee.afterPosting || 100}% fee` }
  ] : [];

  const usageRows = terms.contentUsage ? [
    { "Section": "", "Field": "Organic Repost", "Value": terms.contentUsage.organicRepost || "—" },
    { "Section": "", "Field": "Paid Ads", "Value": terms.contentUsage.paidAds || "—" },
    { "Section": "", "Field": "Whitelisting", "Value": terms.contentUsage.whitelisting || "—" }
  ] : [];

  const influencerObligationRows = Array.isArray(terms.influencerObligations)
    ? terms.influencerObligations.map((obligation: string, idx: number) => ({
        "Section": "",
        "Field": `Obligation ${idx + 1}`,
        "Value": obligation,
      }))
    : [];

  const brandObligationRows = Array.isArray(terms.brandObligations)
    ? terms.brandObligations.map((obligation: string, idx: number) => ({
        "Section": "",
        "Field": `Obligation ${idx + 1}`,
        "Value": obligation,
      }))
    : [];

  return [
    { "Section": "CANCELLATION POLICY", "Field": "", "Value": "" },
    ...cancellationFeeRows,
    { "Section": "", "Field": "Brand Late Approval Fee", "Value": `${terms.brandLateApprovalFee || 10}%` },
    { "Section": "", "Field": "", "Value": "─────" },
    { "Section": "CONTENT USAGE RIGHTS", "Field": "", "Value": "" },
    ...usageRows,
    { "Section": "", "Field": "", "Value": "─────" },
    { "Section": "INFLUENCER OBLIGATIONS", "Field": "", "Value": "" },
    ...influencerObligationRows,
    { "Section": "", "Field": "", "Value": "─────" },
    { "Section": "BRAND OBLIGATIONS", "Field": "", "Value": "" },
    ...brandObligationRows,
    { "Section": "", "Field": "", "Value": "─────" }
  ];
}

function buildLegalAndSignatureCsvRows(deal: any, terms: ContractTermsType): Record<string, string | number>[] {
  const taxRows = [
    { "Section": "TAX & LEGAL", "Field": "", "Value": "" },
    { "Section": "", "Field": "Tax Note", "Value": terms.taxNote || "—" },
    { "Section": "", "Field": "", "Value": "─────" }
  ];

  const mandatoryTagRows = Array.isArray(terms.mandatoryTags)
    ? terms.mandatoryTags.map((tag: string, idx: number) => ({
        "Section": "",
        "Field": `Tag ${idx + 1}`,
        "Value": tag,
      }))
    : [];

  const tagRows = [
    { "Section": "MANDATORY TAGS", "Field": "", "Value": "" },
    ...mandatoryTagRows,
    { "Section": "", "Field": "", "Value": "─────" }
  ];

  const disclosureRows = [
    { "Section": "DISCLOSURE", "Field": "", "Value": "" },
    { "Section": "", "Field": "Disclosure Requirement", "Value": terms.disclosureRequirement || "—" },
    { "Section": "", "Field": "", "Value": "─────" }
  ];

  if (deal.contractSignature) {
    const sig = deal.contractSignature as ContractSignatureDetails;
    const baseSig = [
      { "Section": "", "Field": "Contract Hash", "Value": sig.contractHash || "—" },
      { "Section": "", "Field": "Fully Signed", "Value": sig.isFullySigned ? "Yes" : "No" },
      { "Section": "", "Field": "Signed At", "Value": sig.signedAt ? format(new Date(sig.signedAt), "dd/MM/yyyy HH:mm") : "—" }
    ];
    const influencerSig = sig.influencerSignature ? [
      { "Section": "", "Field": "Influencer Signed At", "Value": format(new Date(sig.influencerSignature.signedAt), "dd/MM/yyyy HH:mm") },
      { "Section": "", "Field": "Influencer Signature Hash", "Value": sig.influencerSignature.signatureHash || "—" }
    ] : [];
    const brandSig = sig.brandSignature ? [
      { "Section": "", "Field": "Brand Signed At", "Value": format(new Date(sig.brandSignature.signedAt), "dd/MM/yyyy HH:mm") },
      { "Section": "", "Field": "Brand Signature Hash", "Value": sig.brandSignature.signatureHash || "—" }
    ] : [];

    return [
      ...taxRows,
      ...tagRows,
      ...disclosureRows,
      { "Section": "SIGNATURES", "Field": "", "Value": "" },
      ...baseSig,
      ...influencerSig,
      ...brandSig,
      { "Section": "", "Field": "", "Value": "─────" }
    ];
  } else {
    return [
      ...taxRows,
      ...tagRows,
      ...disclosureRows,
      { "Section": "SIGNATURES", "Field": "", "Value": "" },
      { "Section": "", "Field": "Status", "Value": "Not signed yet" },
      { "Section": "", "Field": "", "Value": "─────" }
    ];
  }
}

function buildContractCsvRows(deal: any, terms: ContractTermsType, platform: PlatformDetails) {
  const mandatoryRows = buildMandatoryContractCsvRows(deal, terms, platform);

  const financialRows = [
    { "Section": "FINANCIAL TERMS", "Field": "", "Value": "" },
    { "Section": "", "Field": "Creator Fee (₹)", "Value": paiseToRupees(terms.dealAmount || 0) },
    { "Section": "", "Field": "Platform Fee (₹)", "Value": paiseToRupees(terms.platformFee || 0) },
    { "Section": "", "Field": "Gateway Fee (₹)", "Value": paiseToRupees(terms.gatewayFee || 0) },
    { "Section": "", "Field": "Platform Fee %", "Value": `${terms.platformFeePercent || 10}%` },
    { "Section": "", "Field": "Total Payable (₹)", "Value": paiseToRupees(terms.totalAmount || 0) },
    { "Section": "", "Field": "Influencer Payout (₹)", "Value": paiseToRupees(terms.influencerPayout || 0) },
    { "Section": "", "Field": "", "Value": "─────" }
  ];

  const optionalRows = buildOptionalContractCsvRows(terms);

  const timelineRows = [
    { "Section": "TIMELINE", "Field": "", "Value": "" },
    { "Section": "", "Field": "Submission Deadline", "Value": terms.submissionDeadline ? format(new Date(terms.submissionDeadline), "dd/MM/yyyy") : "—" },
    { "Section": "", "Field": "Review Period (hours)", "Value": String(terms.reviewPeriodHours || 48) },
    { "Section": "", "Field": "Posting Deadline", "Value": terms.postingDeadline ? format(new Date(terms.postingDeadline), "dd/MM/yyyy") : "—" },
    { "Section": "", "Field": "", "Value": "─────" }
  ];

  const revisionRows = [
    { "Section": "REVISIONS", "Field": "", "Value": "" },
    { "Section": "", "Field": "Included Revisions", "Value": String(terms.includedRevisions || 2) },
    { "Section": "", "Field": "Cost Per Extra Revision (₹)", "Value": paiseToRupees(terms.costPerExtraRevision || 50000) },
    { "Section": "", "Field": "", "Value": "─────" }
  ];

  const policyRows = buildPolicyAndObligationCsvRows(terms);
  const legalRows = buildLegalAndSignatureCsvRows(deal, terms);

  return [
    ...mandatoryRows,
    ...financialRows,
    ...optionalRows,
    ...timelineRows,
    ...revisionRows,
    ...policyRows,
    ...legalRows
  ];
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
