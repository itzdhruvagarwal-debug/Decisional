/**
 * KYC Verification Service
 * Supports DigiLocker (Aadhaar/PAN) and bank account verification.
 * Add KYC_PROVIDER_KEY to .env to activate.
 *
 * Supported providers: DigiLocker, Surepass, IDfy, Cashfree
 * Default: Manual verification (admin reviews uploaded docs)
 */

import { logger } from "./logger";
import prisma from "./db";
import { decrypt } from "./encryption";
import { getErrorMessage } from "./utils";

const KYC_API_KEY = process.env.KYC_API_KEY;
const KYC_PROVIDER = process.env.KYC_PROVIDER || "manual"; // 'digilocker' | 'surepass' | 'idfy' | 'manual'

// ==================== TYPES ====================

export type KYCDocType =
  | "AADHAAR"
  | "PAN"
  | "GST"
  | "BANK_ACCOUNT"
  | "BUSINESS_REG";

export type KYCStatus = "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED";



export interface BankVerifyResult {
  success: boolean;
  nameMatch: boolean;
  accountExists: boolean;
  beneficiaryName?: string;
  error?: string;
}

// ==================== AADHAAR VERIFICATION ====================

/**
 * Verify Aadhaar number via DigiLocker/Surepass.
 * In manual mode, returns pending status for admin review.
 */
export async function verifyAadhaar(
  aadhaarNumber: string,
  userId?: string,
): Promise<KYCVerifyResult> {
  if (KYC_PROVIDER === "manual" || (!KYC_API_KEY && KYC_PROVIDER !== "digilocker")) {
    logger.warn(
      "Running in manual mode — Aadhaar verification queued for admin review",
    );
    return {
      success: false,
      status: "PENDING",
      data: { documentNumber: maskDocument(aadhaarNumber, 4) },
      error: "Manual KYC requires admin review",
    };
  }

  try {
    if (KYC_PROVIDER === "surepass") {
      return await surepassVerifyAadhaar(aadhaarNumber);
    }

    // DigiLocker flow (requires OAuth redirect)
    if (KYC_PROVIDER === "digilocker") {
      return await digilockerVerifyAadhaar(aadhaarNumber, userId);
    }

    return {
      success: false,
      status: "PENDING",
      error: `Unknown KYC provider: ${KYC_PROVIDER}`,
    };
  } catch (error) {
    logger.error("Aadhaar verification error", error);
    return {
      success: false,
      status: "PENDING",
      error: "Verification service unavailable",
    };
  }
}

// ==================== PAN VERIFICATION ====================

/**
 * Verify PAN card number.
 */
export async function verifyPAN(panNumber: string): Promise<KYCVerifyResult> {
  // Basic format validation
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  if (!panRegex.test(panNumber.toUpperCase())) {
    return { success: false, status: "REJECTED", error: "Invalid PAN format" };
  }

  if (KYC_PROVIDER === "manual" || !KYC_API_KEY) {
    logger.warn("Manual mode — PAN verification queued for admin");
    return {
      success: false,
      status: "PENDING",
      data: { documentNumber: maskDocument(panNumber, 4) },
      error: "Manual KYC requires admin review",
    };
  }

  try {
    if (KYC_PROVIDER === "surepass") {
      const res = await fetch("https://kyc-api.surepass.io/api/v1/pan/pan", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${KYC_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id_number: panNumber.toUpperCase() }),
      });

      const data = await res.json();

      if (data.success && data.data) {
        return {
          success: true,
          status: "VERIFIED",
          data: {
            name: data.data.full_name,
            documentNumber: maskDocument(panNumber, 4),
            isValid: data.data.valid,
          },
        };
      }

      return {
        success: false,
        status: "REJECTED",
        error: data.message || "PAN verification failed",
      };
    }

    return {
      success: false,
      status: "PENDING",
      error: "Provider not configured",
    };
  } catch (error) {
    logger.error("PAN verification error", error);
    return {
      success: false,
      status: "PENDING",
      error: "Verification service unavailable",
    };
  }
}

// ==================== GST VERIFICATION ====================

/**
 * Verify GST number (for brands).
 */
export async function verifyGST(gstNumber: string): Promise<KYCVerifyResult> {
  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!gstRegex.test(gstNumber.toUpperCase())) {
    return { success: false, status: "REJECTED", error: "Invalid GST format" };
  }

  if (KYC_PROVIDER === "manual" || !KYC_API_KEY) {
    logger.warn("Manual mode — GST verification queued for admin");
    return {
      success: false,
      status: "PENDING",
      data: { documentNumber: gstNumber },
      error: "Manual KYC requires admin review",
    };
  }

  try {
    if (KYC_PROVIDER === "surepass") {
      const res = await fetch(
        "https://kyc-api.surepass.io/api/v1/corporate/gstin",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${KYC_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ id_number: gstNumber.toUpperCase() }),
        },
      );

      const data = await res.json();

      if (data.success && data.data) {
        return {
          success: true,
          status: "VERIFIED",
          data: {
            name: data.data.business_name,
            address: data.data.address,
            documentNumber: gstNumber,
            isValid: data.data.valid,
          },
        };
      }

      return {
        success: false,
        status: "REJECTED",
        error: data.message || "GST verification failed",
      };
    }

    return {
      success: false,
      status: "PENDING",
      error: "Provider not configured",
    };
  } catch (error) {
    logger.error("GST verification error", error);
    return {
      success: false,
      status: "PENDING",
      error: "Verification service unavailable",
    };
  }
}

// ==================== BANK ACCOUNT VERIFICATION ====================

/**
 * Verify bank account using penny drop or name match.
 */
export async function verifyBankAccount(params: {
  accountNumber: string;
  ifscCode: string;
  beneficiaryName: string;
}): Promise<BankVerifyResult> {
  if (KYC_PROVIDER === "manual" || !KYC_API_KEY) {
    logger.warn("Manual mode — bank verification queued for admin");
    return {
      success: false,
      nameMatch: false,
      accountExists: false,
      beneficiaryName: params.beneficiaryName,
      error: "Manual bank verification requires admin review",
    };
  }

  try {
    if (KYC_PROVIDER === "surepass") {
      const res = await fetch(
        "https://kyc-api.surepass.io/api/v1/bank-verification/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${KYC_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id_number: params.accountNumber,
            ifsc: params.ifscCode,
            ifsc_details: true,
          }),
        },
      );

      const data = await res.json();

      if (data.success && data.data) {
        const bankName = data.data.full_name || "";
        const nameMatch = bankName
          .toLowerCase()
          .includes(params.beneficiaryName.toLowerCase().split(" ")[0]);

        return {
          success: true,
          nameMatch,
          accountExists: data.data.account_exists,
          beneficiaryName: bankName,
        };
      }

      return {
        success: false,
        nameMatch: false,
        accountExists: false,
        error: data.message,
      };
    }

    return {
      success: false,
      nameMatch: false,
      accountExists: false,
      error: "Provider not configured",
    };
  } catch (error) {
    logger.error("Bank verification error", error);
    return {
      success: false,
      nameMatch: false,
      accountExists: false,
      error: "Service unavailable",
    };
  }
}

// ==================== PROVIDER-SPECIFIC IMPLEMENTATIONS ====================

// Update KYCVerifyResult to include clientId
export interface KYCVerifyResult {
  success: boolean;
  status: KYCStatus;
  data?: {
    name?: string;
    dob?: string;
    address?: string;
    documentNumber?: string;
    isValid?: boolean;
    clientId?: string; // For Surepass Aadhaar OTP flow
  };
  error?: string;
}

async function surepassVerifyAadhaar(
  aadhaarNumber: string,
): Promise<KYCVerifyResult> {
  // Step 1: Generate OTP
  const otpRes = await fetch(
    "https://kyc-api.surepass.io/api/v1/aadhaar-v2/generate-otp",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KYC_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id_number: aadhaarNumber }),
    },
  );

  const otpData = await otpRes.json();

  if (!otpData.success) {
    return {
      success: false,
      status: "REJECTED",
      error: otpData.message || "Aadhaar OTP failed",
    };
  }

  // Return pending with clientId — frontend needs to collect OTP and call verifyAadhaarOTP
  return {
    success: true,
    status: "PENDING",
    data: {
      documentNumber: maskDocument(aadhaarNumber, 4),
      clientId: otpData.data?.client_id, // Include client_id for next step!
    },
  };
}

async function digilockerVerifyAadhaar(
  aadhaarNumber: string,
  userId?: string,
): Promise<KYCVerifyResult> {
  if (!userId) {
    return {
      success: false,
      status: "PENDING",
      error: "Please connect your DigiLocker account first",
    };
  }

  try {
    const oauth = await prisma.oAuthAccount.findFirst({
      where: { userId, provider: "digilocker" },
    });

    if (!oauth || !oauth.accessToken) {
      return {
        success: false,
        status: "PENDING",
        error: "Please connect your DigiLocker account first",
      };
    }

    const decryptedAccessToken = decrypt(oauth.accessToken);

    const profileRes = await fetch("https://api.digilocker.gov.in/account/profile", {
      headers: {
        Authorization: `Bearer ${decryptedAccessToken}`,
      },
    });

    const profile = await profileRes.json();

    if (!profile || profile.error) {
      return {
        success: false,
        status: "PENDING",
        error: profile.error_description || profile.message || "Please connect your DigiLocker account first",
      };
    }

    const rawDlAadhaar = profile.aadhaar || profile.aadhaar_number || profile.uid || profile.extra?.aadhaar;
    const dlAadhaar = rawDlAadhaar ? String(rawDlAadhaar).replace(/[^0-9]/g, "") : "";

    if (!dlAadhaar || dlAadhaar.length < 4) {
      // Fallback: Verify that the connected DigiLocker profile name matches the user's account name
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          influencerProfile: { select: { displayName: true } },
          brandProfile: { select: { companyName: true } },
          email: true,
        },
      });
      const dlName = String(profile.name || "").trim().toLowerCase();
      const dbName = String(
        dbUser?.influencerProfile?.displayName ||
          dbUser?.brandProfile?.companyName ||
          dbUser?.email?.split("@")[0] ||
          "",
      ).trim().toLowerCase();

      if (!dlName || !dbName || (!dlName.includes(dbName.split(" ")[0]!) && !dbName.includes(dlName.split(" ")[0]!))) {
        return {
          success: false,
          status: "REJECTED",
          error: "The name on the connected DigiLocker profile does not match your registered name.",
        };
      }
    } else {
      const userLast4 = aadhaarNumber.slice(-4);
      const dlLast4 = dlAadhaar.slice(-4);

      if (dlAadhaar.length === 12) {
        if (dlAadhaar !== aadhaarNumber) {
          return {
            success: false,
            status: "REJECTED",
            error: "The provided Aadhaar number does not match the Aadhaar number linked to your DigiLocker profile.",
          };
        }
      } else {
        if (dlLast4 !== userLast4) {
          return {
            success: false,
            status: "REJECTED",
            error: "The provided Aadhaar number does not match the Aadhaar number linked to your DigiLocker profile.",
          };
        }
      }
    }

    return {
      success: true,
      status: "VERIFIED",
      data: {
        name: profile.name,
        dob: profile.dob,
        documentNumber: maskDocument(aadhaarNumber, 4),
        isValid: true,
      },
    };
  } catch (error: unknown) {
    logger.error("DigiLocker verification error", error);
    return {
      success: false,
      status: "PENDING",
      error: getErrorMessage(error) || "Please connect your DigiLocker account first",
    };
  }
}

/**
 * Complete Aadhaar verification after OTP (Surepass).
 */
export async function verifyAadhaarOTP(
  clientId: string,
  otp: string,
): Promise<KYCVerifyResult> {
  if (!KYC_API_KEY) {
    return {
      success: false,
      status: "PENDING",
      error: "KYC API key not configured",
    };
  }

  try {
    const res = await fetch(
      "https://kyc-api.surepass.io/api/v1/aadhaar-v2/submit-otp",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${KYC_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ client_id: clientId, otp }),
      },
    );

    const data = await res.json();

    if (data.success && data.data) {
      return {
        success: true,
        status: "VERIFIED",
        data: {
          name: data.data.full_name,
          dob: data.data.dob,
          address: data.data.address?.combined || "",
          documentNumber: maskDocument(data.data.aadhaar_number, 4),
          isValid: true,
        },
      };
    }

    return {
      success: false,
      status: "REJECTED",
      error: data.message || "Aadhaar OTP verification failed",
    };
  } catch (error) {
    logger.error("Aadhaar OTP verification error", error);
    return {
      success: false,
      status: "PENDING",
      error: "Verification service unavailable",
    };
  }
}

// ==================== HELPERS ====================

function maskDocument(doc: string, visibleDigits: number): string {
  if (doc.length <= visibleDigits) return doc;
  const masked = "X".repeat(doc.length - visibleDigits);
  return masked + doc.slice(-visibleDigits);
}
