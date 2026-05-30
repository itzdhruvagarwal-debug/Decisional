import { NextResponse } from "next/server";
import { DocumentType } from "@prisma/client";

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { decrypt, encrypt } from "@/lib/encryption";
import {
  getGstinStateCode,
  getIndiaTaxSummary,
  gstinBelongsToPan,
  indiaTaxComplianceInputSchema,
  isEInvoiceApplicable,
  maskIdentifier,
} from "@/lib/india-compliance";
import { logger } from "@/lib/logger";
import { verifyPAN, verifyGST } from "@/lib/kyc";

// Simple token-overlap check for name matching
function namesMatch(registeredName: string, kycName: string): boolean {
  const regTokens = registeredName.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  const kycTokens = kycName.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  
  return regTokens.some(token => kycTokens.includes(token));
}

function isInvoiceProfileComplete(user: {
  brandProfile?: {
    address: string | null;
    state: string | null;
    pinCode: string | null;
  } | null;
}) {
  const profile = user.brandProfile;
  return Boolean(profile?.address && profile.state && profile.pinCode);
}

function tryDecrypt(value?: string | null) {
  if (!value) return undefined;
  try {
    return decrypt(value);
  } catch {
    return undefined;
  }
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        userType: true,
        taxCompliance: true,
        brandProfile: {
          select: {
            address: true,
            state: true,
            pinCode: true,
          },
        },
        verificationDocs: {
          where: { type: "PAN_CARD" as DocumentType, status: "VERIFIED" },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    const compliance = user.taxCompliance;
    const summary = getIndiaTaxSummary({
      userType: user.userType,
      panPresent: Boolean(compliance?.panLast4),
      gstinPresent: Boolean(compliance?.gstinLast4),
      itrPresent: Boolean(compliance?.itrAcknowledgementLast4),
      gstRegistrationType: compliance?.gstRegistrationType as any,
      gstTurnoverSlab: compliance?.gstTurnoverSlab as any,
      profileCompleteForInvoice:
        user.userType === "BRAND" ? isInvoiceProfileComplete(user) : true,
    });

    return NextResponse.json({
      success: true,
      data: {
        userType: user.userType,
        verifiedPanDocument: user.verificationDocs.length > 0,
        compliance: compliance
          ? {
              id: compliance.id,
              panNumberMasked: maskIdentifier(compliance.panLast4),
              gstinMasked: maskIdentifier(compliance.gstinLast4),
              gstStateCode: compliance.gstStateCode,
              gstRegistrationType: compliance.gstRegistrationType,
              gstTurnoverSlab: compliance.gstTurnoverSlab,
              itrAcknowledgementMasked: maskIdentifier(
                compliance.itrAcknowledgementLast4,
              ),
              itrAssessmentYear: compliance.itrAssessmentYear,
              tdsSection: compliance.tdsSection,
              eInvoiceApplicable: compliance.eInvoiceApplicable,
              status: summary.status,
              verifiedAt: compliance.verifiedAt,
              updatedAt: compliance.updatedAt,
            }
          : null,
        summary,
      },
    });
  } catch (error) {
    logger.error("India tax compliance fetch failed", error);
    return NextResponse.json(
      { success: false, message: "Failed to load India tax compliance" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = indiaTaxComplianceInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid tax compliance payload",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        userType: true,
        taxCompliance: true,
        influencerProfile: { select: { displayName: true } },
        brandProfile: {
          select: {
            companyName: true,
            address: true,
            state: true,
            pinCode: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    const current = user.taxCompliance;
    const data = parsed.data;
    const bodyRecord =
      body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const nextRegistrationType =
      Object.prototype.hasOwnProperty.call(bodyRecord, "gstRegistrationType")
        ? (data.gstRegistrationType ?? "UNREGISTERED")
        : (current?.gstRegistrationType ?? "UNREGISTERED");
    const registeredForGst =
      nextRegistrationType === "REGISTERED" ||
      nextRegistrationType === "COMPOSITION";
    const currentPan = tryDecrypt(current?.panNumber);
    const currentGstin = tryDecrypt(current?.gstin);
    const nextPanNumber = data.panNumber ?? currentPan;
    const nextGstin = registeredForGst
      ? (data.gstin ?? currentGstin)
      : undefined;
    const nextGstinPresent = registeredForGst
      ? Boolean(nextGstin || current?.gstinLast4)
      : false;

    if (registeredForGst && !nextGstinPresent) {
      return NextResponse.json(
        {
          success: false,
          message: "GSTIN is required for registered GST profiles",
        },
        { status: 400 },
      );
    }

    if (registeredForGst && data.panNumber && current?.gstinLast4 && !nextGstin) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Please re-enter GSTIN when changing PAN so we can verify the embedded PAN.",
        },
        { status: 400 },
      );
    }

    if (nextPanNumber && nextGstin && !gstinBelongsToPan(nextGstin, nextPanNumber)) {
      return NextResponse.json(
        {
          success: false,
          message: "GSTIN embedded PAN does not match the PAN number",
        },
        { status: 400 },
      );
    }

    // Real-time PAN Verification & Name Match Guard
    if (data.panNumber) {
      const kycRes = await verifyPAN(data.panNumber);
      if (!kycRes.success || kycRes.status === "REJECTED") {
        return NextResponse.json(
          { success: false, message: `PAN verification failed: ${kycRes.error || "Invalid PAN number"}` },
          { status: 400 }
        );
      }

      // Name overlap match guard
      if (kycRes.status === "VERIFIED" && kycRes.data?.name) {
        const registeredName = user.userType === "INFLUENCER"
          ? user.influencerProfile?.displayName
          : user.brandProfile?.companyName;

        if (registeredName && !namesMatch(registeredName, kycRes.data.name)) {
          return NextResponse.json(
            {
              success: false,
              message: `PAN holder name mismatch. PAN is registered under '${kycRes.data.name}', but your profile name is '${registeredName}'.`
            },
            { status: 400 }
          );
        }
      }
    }

    // Real-time GSTIN Verification & Business Name Match Guard
    if (registeredForGst && data.gstin) {
      const kycRes = await verifyGST(data.gstin);
      if (!kycRes.success || kycRes.status === "REJECTED") {
        return NextResponse.json(
          { success: false, message: `GSTIN verification failed: ${kycRes.error || "Invalid GSTIN"}` },
          { status: 400 }
        );
      }

      // Business name overlap match guard
      if (kycRes.status === "VERIFIED" && kycRes.data?.name) {
        const registeredName = user.brandProfile?.companyName;
        if (registeredName && !namesMatch(registeredName, kycRes.data.name)) {
          return NextResponse.json(
            {
              success: false,
              message: `GST business name mismatch. GST is registered under '${kycRes.data.name}', but your company name is '${registeredName}'.`
            },
            { status: 400 }
          );
        }
      }
    }

    const nextPanPresent = Boolean(nextPanNumber || current?.panLast4);
    const nextItrPresent = Boolean(
      data.itrAcknowledgementNumber || current?.itrAcknowledgementLast4,
    );
    const nextSlab = data.gstTurnoverSlab ?? current?.gstTurnoverSlab ?? null;
    const summary = getIndiaTaxSummary({
      userType: user.userType,
      panPresent: nextPanPresent,
      gstinPresent: nextGstinPresent,
      itrPresent: nextItrPresent,
      gstRegistrationType: nextRegistrationType as any,
      gstTurnoverSlab: nextSlab as any,
      profileCompleteForInvoice:
        user.userType === "BRAND" ? isInvoiceProfileComplete(user) : true,
    });

    const updateData: any = {
      gstRegistrationType: nextRegistrationType,
      gstTurnoverSlab: nextSlab,
      tdsSection: user.userType === "BRAND" ? "194J_OR_194O_REVIEW" : "194J_REVIEW",
      eInvoiceApplicable: isEInvoiceApplicable(nextSlab as any),
      status: summary.status,
      submittedAt: new Date(),
      verifiedAt: null,
      rejectionReason: null,
    };

    if (data.panNumber) {
      updateData.panNumber = encrypt(data.panNumber);
      updateData.panLast4 = data.panNumber.slice(-4);
    }

    if (registeredForGst && data.gstin) {
      updateData.gstin = encrypt(data.gstin);
      updateData.gstinLast4 = data.gstin.slice(-4);
      updateData.gstStateCode = getGstinStateCode(data.gstin);
    } else if (!registeredForGst) {
      updateData.gstin = null;
      updateData.gstinLast4 = null;
      updateData.gstStateCode = null;
    }

    if (data.itrAcknowledgementNumber) {
      updateData.itrAcknowledgementNumber = encrypt(data.itrAcknowledgementNumber);
      updateData.itrAcknowledgementLast4 = data.itrAcknowledgementNumber.slice(-4);
    }

    if (data.itrAssessmentYear) {
      updateData.itrAssessmentYear = data.itrAssessmentYear;
    }

    const compliance = await prisma.indiaTaxCompliance.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        ...updateData,
      },
      update: updateData,
    });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "UPDATE_INDIA_TAX_COMPLIANCE",
        entityType: "IndiaTaxCompliance",
        entityId: compliance.id,
        metadata: {
          status: summary.status,
          gstRegistrationType: nextRegistrationType,
          gstTurnoverSlab: nextSlab,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "India tax compliance updated",
      data: {
        status: summary.status,
        summary,
      },
    });
  } catch (error) {
    logger.error("India tax compliance update failed", error);
    return NextResponse.json(
      { success: false, message: "Failed to update India tax compliance" },
      { status: 500 },
    );
  }
}
