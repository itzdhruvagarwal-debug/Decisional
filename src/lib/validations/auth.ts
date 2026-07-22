import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80, "Name cannot exceed 80 characters"),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Please enter a valid 10-digit Indian phone number"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  confirmPassword: z.string(),
  referralCode: z.string().optional(),
  agreeToTerms: z.literal(true, {
    message: "You must agree to the Terms of Service and Privacy Policy",
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  twoFactorCode: z.string().length(6, "2FA code must be 6 digits").optional().or(z.literal("")),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  confirmNewPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: "New passwords do not match",
  path: ["confirmNewPassword"],
});

export const taxComplianceSchema = z.object({
  pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, "Invalid PAN format (e.g. ABCDE1234F)").or(z.literal("")),
  gstin: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, "Invalid GSTIN format (15 characters)")
    .or(z.literal("")),
});

export const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const bankAccountSchema = z.object({
  payoutType: z.enum(["bank", "upi"]),
  accountName: z.string().min(2, "Beneficiary name must be at least 2 characters").max(100, "Beneficiary name cannot exceed 100 characters"),
  accountNumber: z.string().optional().or(z.literal("")),
  ifscCode: z.string().optional().or(z.literal("")),
  bankName: z.string().optional().or(z.literal("")),
  upiId: z.string().optional().or(z.literal("")),
}).superRefine((data, ctx) => {
  if (data.payoutType === "bank") {
    if (!data.accountNumber || data.accountNumber.length < 9 || data.accountNumber.length > 18 || !/^\d+$/.test(data.accountNumber)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please enter a valid 9 to 18 digit account number",
        path: ["accountNumber"],
      });
    }
    if (!data.ifscCode || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(data.ifscCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please enter a valid 11-digit IFSC code (e.g. SBIN0001234)",
        path: ["ifscCode"],
      });
    }
    if (!data.bankName || data.bankName.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please enter a valid bank name",
        path: ["bankName"],
      });
    }
  } else if (data.payoutType === "upi") {
    if (!data.upiId || !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(data.upiId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please enter a valid UPI ID (e.g. user@okaxis)",
        path: ["upiId"],
      });
    }
  }
});

export const deleteAccountSchema = z.object({
  confirmText: z.literal("DELETE", {
    message: "Please type DELETE to confirm",
  }),
  password: z.string().min(1, "Password is required to delete your account"),
  reason: z.string().max(500, "Reason cannot exceed 500 characters").optional(),
});

export const withdrawSchema = z.object({
  amount: z
    .number({ message: "Withdrawal amount must be a number" })
    .min(500, "Minimum withdrawal amount is INR 500"),
});
