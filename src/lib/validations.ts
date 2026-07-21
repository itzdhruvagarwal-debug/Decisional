/**
 * Zod Validation Schemas - All input validation
 */

import { z } from "zod";

/**
 * Database primary ID checker.
 * Prisma defaults to CUIDs, but legacy imports and seeded records can use
 * URL-safe string IDs. Ownership checks still happen at the service layer.
 */
export const dbIdSchema = z
  .string()
  .trim()
  .min(1, "Invalid reference ID")
  .max(128, "Invalid reference ID")
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid reference ID");

/**
 * Route parameter schema for [id] routes.
 * Used for validating dynamic route parameters like /api/resource/[id]
 */
export const routeParamsSchema = z.object({ id: dbIdSchema });

/**
 * Pagination schema for query parameters.
 * Used for validating page and limit parameters across all paginated endpoints.
 */
export const paginationSchema = z.object({
  page: z.preprocess(
    (val) => (val === undefined ? undefined : Number(val)),
    z.number().int().min(1).default(1)
  ),
  limit: z.preprocess(
    (val) => (val === undefined ? undefined : Number(val)),
    z.number().int().min(1).max(100).default(20)
  ),
});

/**
 * Indian Phone Number Schema (10 digits starting with 6-9).
 */
export const phoneSchema = z
  .string({ message: "Phone number is required" })
  .regex(/^[6-9]\d{9}$/, "Must be a valid 10-digit Indian phone number");

/**
 * Standard Email Schema with transform.
 */
export const emailSchema = z
  .string({ message: "Email is required" })
  .email("Please provide a valid email address")
  .transform((v) => v.toLowerCase().trim());

/**
 * Strong password enforcement logic.
 */
export const passwordSchema = z
  .string({ message: "Password is required" })
  .min(8, "Password must be at least 8 characters long")
  .max(100, "Password length exceeds maximum allowed")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter (A-Z)")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter (a-z)")
  .regex(/\d/, "Password must contain at least one number (0-9)")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");


// ==================== AUTH SCHEMAS ====================

export const registerSchema = z.object({
  name: z
    .string({ message: "Name is required" })
    .trim()
    .min(2, "Name must be at least 2 characters long")
    .max(80, "Name cannot exceed 80 characters"),
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  userType: z.enum(["INFLUENCER", "BRAND"]),
  referralCode: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]+$/, "Referral code can only contain uppercase letters and numbers")
    .optional(),
  emailOtpVerified: z.boolean().default(false),
  phoneOtpVerified: z.boolean().default(false),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required to login"),
  twoFactorCode: z
    .string()
    .transform((val) => (val === "" ? undefined : val)) // Convert empty string to undefined
    .refine((val) => val === undefined || (val.length === 6 && /^\d+$/.test(val)), {
      message: "2FA Code must be exactly 6 digits",
    })
    .optional(),
});
// ==================== PROFILE SCHEMAS ====================

export const influencerProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name cannot exceed 50 characters"),
  bio: z.string().trim().max(500, "Bio must be under 500 characters").optional(),
  city: z.string().trim().max(50).optional(),
  state: z.string().trim().max(50).optional(),
  gender: z.enum(["MALE", "FEMALE", "NON_BINARY", "PREFER_NOT_TO_SAY", "OTHER"]).optional(),
  age: z.coerce.number().int("Age must be a whole number").min(13, "Must be at least 13 years old").max(100).optional(),
  instagramHandle: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9._]+$/, "Invalid Instagram handle format")
    .optional(),
  youtubeHandle: z.string().trim().optional(),
  categories: z.array(z.string().trim()).min(1, "Select at least one category").max(5, "Select at most 5 categories"),
  languages: z.array(z.string().trim()).min(1, "Select at least one language"),
  minRate: z.number().int().min(100, "Minimum rate must be at least ₹100").optional(),
  maxRate: z.number().int().optional(),
  minInstagramRate: z.number().int().min(100, "Minimum Instagram rate must be at least ₹100").optional(),
  maxInstagramRate: z.number().int().optional(),
  minYoutubeRate: z.number().int().min(100, "Minimum YouTube rate must be at least ₹100").optional(),
  maxYoutubeRate: z.number().int().optional(),
  instagramFollowers: z.number().int().min(0).optional(),
  youtubeSubscribers: z.number().int().min(-1).optional(),
  instagramEngagementRate: z.number().min(0).max(100, "Must be a valid percentage").optional(),
  youtubeEngagementRate: z.number().min(0).max(100, "Must be a valid percentage").optional(),
}).refine(data => !data.maxRate || (data.minRate !== undefined && data.maxRate >= data.minRate), {
  message: "Maximum rate must be greater than or equal to minimum rate",
  path: ["maxRate"],
}).refine(data => !data.maxInstagramRate || (data.minInstagramRate !== undefined && data.maxInstagramRate >= data.minInstagramRate), {
  message: "Maximum Instagram rate must be greater than or equal to minimum Instagram rate",
  path: ["maxInstagramRate"],
}).refine(data => !data.maxYoutubeRate || (data.minYoutubeRate !== undefined && data.maxYoutubeRate >= data.minYoutubeRate), {
  message: "Maximum YouTube rate must be greater than or equal to minimum YouTube rate",
  path: ["maxYoutubeRate"],
});

export const brandProfileSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(2, "Company name must be at least 2 characters")
    .max(100, "Company name cannot exceed 100 characters"),
  logo: z.string().url("Please provide a valid logo image URL").max(500).optional(),
  website: z
    .string()
    .url("Please provide a valid website URL")
    .max(500)
    .refine(
      (val) => val.startsWith("http://") || val.startsWith("https://"),
      "Website URL must start with http:// or https://",
    )
    .optional(),
  description: z.string().trim().max(1000, "Description cannot exceed 1000 characters").optional(),
  industry: z.string().trim().max(50).optional(),
  gstNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[\dA-Z]$/,
      "Must be a valid Indian GSTIN format",
    )
    .optional(),
  panNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}\d{4}[A-Z]$/, "Must be a valid Indian PAN format")
    .optional(),
  cinNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^([LUu])(\d{5})([A-Za-z]{2})(\d{4})([A-Za-z]{3})(\d{6})$/,
      "Must be a valid Indian CIN format",
    )
    .optional(),
});

// ==================== CAMPAIGN SCHEMAS ====================

export const deliverableSchema = z.object({
  type: z.enum([
    "INSTAGRAM_POST",
    "INSTAGRAM_REEL",
    "INSTAGRAM_STORY",
    "YOUTUBE_VIDEO",
    "YOUTUBE_SHORT",
  ]),
  count: z.number().int().min(1, "Count must be at least 1").max(10, "Maximum 10 deliverables per line"),
  duration: z.string().trim().max(20).optional(), // "30s", "60s" allowed shapes
  specs: z.string().trim().max(500, "Specifications input is too long").optional(),
});

export const createCampaignSchema = z
  .object({
    title: z.string().min(3),
    description: z.string().min(10),
    requirements: z.string().min(10),
    guidelines: z.string().max(3000).optional(),

    totalBudget: z.number().int().min(1000, "Minimum campaign budget is ₹1,000"),
    perInfluencerBudget: z.number().int().min(500, "Minimum per-influencer budget is ₹500").optional(),
    maxInfluencers: z.number().int().min(1).max(100).nullable().optional(),

    targetCategories: z.array(z.string().min(1)).min(1),
    targetCities: z.array(z.string().min(1)).optional().default([]),
    targetLanguages: z.array(z.string().min(1)).optional().default([]),
    targetGender: z.enum(["ANY", "MALE", "FEMALE"]).optional(),
    targetAgeMin: z.number().int().min(13).max(100).nullable().optional(),
    targetAgeMax: z.number().int().min(13).max(100).nullable().optional(),
    minFollowers: z.number().int().min(0).optional().default(0),
    maxFollowers: z.number().int().min(0).optional().default(0),
    minEngagementRate: z.number().int().min(0).optional(),

    applicationDeadline: z.string().datetime().optional(),
    contentDeadline: z.string().datetime(),
    postingDeadline: z.string().datetime(),

    deliverables: z
      .array(
        z.object({
          type: z.string().min(1),
          count: z.number().int().min(1).max(50),
          rate: z.number().int().min(0).optional(),
          specs: z.string().max(500).optional(),
        }),
      )
      .min(1),

    requiresProduct: z.boolean().optional().default(false),
    productName: z.string().max(200).optional(),
    productValue: z.number().int().min(0).optional(),
    productDescription: z.string().max(5000).optional(),

    invitedInfluencerId: dbIdSchema.optional(),
    status: z.enum(["DRAFT", "ACTIVE"]).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.requiresProduct && value.totalBudget === 0) {
      if (value.productValue === undefined || value.productValue < 500) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["productValue"],
          message: "Product-only campaigns must specify a product value of at least ₹500",
        });
      }
      if (value.minFollowers !== undefined && value.minFollowers > 10000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["minFollowers"],
          message: "Product-only campaigns must target influencers with up to 10,000 followers",
        });
      }
    }

    if (
      value.perInfluencerBudget !== undefined &&
      value.perInfluencerBudget > value.totalBudget
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["perInfluencerBudget"],
        message: "Per influencer budget cannot exceed total budget",
      });
    }

    if (
      value.targetAgeMin !== null &&
      value.targetAgeMin !== undefined &&
      value.targetAgeMax !== null &&
      value.targetAgeMax !== undefined &&
      value.targetAgeMin > value.targetAgeMax
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetAgeMax"],
        message: "Maximum age must be greater than or equal to minimum age",
      });
    }
  });

// ==================== APPLICATION SCHEMAS ====================

export const createApplicationSchema = z.object({
  campaignId: dbIdSchema,
  proposal: z.string().min(10, "Proposal must be at least 10 characters"),
  proposedRate: z.number().positive("Proposed rate must be positive"),
  estimatedDeliveryDays: z.number().int().positive().max(90).optional(),
});

export const contentSubmissionItemSchema = z.object({
  type: z.string().trim(),
  url: z
    .string()
    .trim()
    .url("Please provide a valid content submission URL")
    .max(500, "Submitted URL is too long")
    .refine(
      (url) => {
        const lower = url.trim().toLowerCase();
        return (
          lower.startsWith("https://") &&
          !url.includes("<") &&
          !url.includes(">")
        );
      },
      "Only secure (HTTPS) URLs are allowed",
    ),
});

export const contentSubmissionSchema = z.object({
  dealId: dbIdSchema,
  contentUrl: z
    .string()
    .trim()
    .url("Please provide a valid content submission URL")
    .max(500, "Submitted URL is too long")
    .refine(
      (url) => {
        const lower = url.trim().toLowerCase();
        return (
          lower.startsWith("https://") &&
          !url.includes("<") &&
          !url.includes(">")
        );
      },
      "Only secure (HTTPS) URLs are allowed",
    )
    .optional(),
  contentUrls: z.array(contentSubmissionItemSchema).optional(),
  notes: z.string().trim().max(500, "Notes attached are exceeding limit").optional(),
});

export const deliverableReviewSchema = z.object({
  type: z.string().trim(),
  status: z.enum(["APPROVED", "REVISION_REQUESTED"]),
  feedback: z.string().trim().optional(),
});

export const contentApprovalSchema = z.object({
  dealId: dbIdSchema,
  approved: z.boolean(),
  feedback: z.string().trim().max(500).optional(),
  reviews: z.array(deliverableReviewSchema).optional(),
}).refine(data => data.approved || data.reviews?.some(r => r.status === "REVISION_REQUESTED") || (!!data.feedback && data.feedback.length > 0), {
  message: "You must provide feedback if you are requesting revisions",
  path: ["feedback"]
});

export const postVerificationSchema = z.object({
  dealId: dbIdSchema,
  postUrl: z
    .string()
    .trim()
    .url("Please provide a valid post URL")
    .regex(
      /^(https?:\/\/)?(www\.)?(instagram\.com\/(p|reel)\/.+|youtu\.be\/.+|youtube\.com\/(watch\?v=|shorts\/).+)/,
      "Currently only YouTube and Instagram are structurally supported for automated verifications",
    )
    .max(500, "URL too long"),
});

export const shippingAddressSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: phoneSchema,
  line1: z.string().trim().min(5).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  pinCode: z.string().trim().regex(/^\d{6}$/, "Must be a valid 6-digit PIN code"),
  country: z.string().trim().max(80).optional().default("India"),
});

export const productFulfillmentSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("submit_address"),
    address: shippingAddressSchema,
  }),
  z.object({
    action: z.literal("confirm_dispatch"),
    trackingNumber: z.string().trim().min(1).max(120),
    carrier: z.string().trim().max(80).optional(),
  }),
  z.object({
    action: z.literal("confirm_received"),
  }),
]);

// ==================== PAYMENT SCHEMAS ====================

export const withdrawalSchema = z.object({
  amount: z.number().int().min(50000, "Minimum withdrawal limit is ₹500 (50000 paise)"), // Spec Part 7B
  bankAccountName: z.string().trim().min(2, "Invalid Account Name constraint"),
  bankAccountNumber: z
    .string()
    .trim()
    .regex(/^\d{9,18}$/, "Bank Account Must primarily consist of 9-18 exact digits"),
  ifscCode: z.string().trim().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Must be a valid standardized 11-digit IFSC code"),
  upiId: z.string().trim().regex(/^[\w.-]+@[\w.-]+$/, "Please submit a standard UPI ID format").optional(),
});

// ==================== DISPUTE SCHEMAS ====================

export const disputeSchema = z.object({
  dealId: dbIdSchema,
  type: z.enum([
    "QUALITY",
    "TIMELINE",
    "PAYMENT",
    "CONTENT_DELETED",
    "TERMS_VIOLATION",
    "OTHER",
  ]),
  description: z
    .string()
    .trim()
    .min(50, "You must describe the context sufficiently (50 chars min)")
    .max(2000, "Dispute bounds are 2000 characters to process concisely"),
});

export const disputeEvidenceSchema = z.object({
  disputeId: dbIdSchema,
  type: z.string().trim().min(3),
  url: z
    .string()
    .trim()
    .url("You must attach a valid link to review")
    .refine((value) => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    }, "Evidence links must use http or https"),
  description: z.string().trim().max(500).optional(),
});

// ==================== REVIEW SCHEMAS ====================

export const reviewSchema = z.object({
  dealId: dbIdSchema,
  receiverId: dbIdSchema.optional(),
  rating: z.number().int("Standard reviews are integer amounts").min(1).max(5),
  comment: z.string().trim().max(500).optional(),
  communicationRating: z.number().int().min(1).max(5).optional(),
  qualityRating: z.number().int().min(1).max(5).optional(),
  timelinessRating: z.number().int().min(1).max(5).optional(),
});

// ==================== MESSAGE SCHEMAS ====================

export const messageSchema = z.object({
  dealId: dbIdSchema.optional(),
  receiverId: dbIdSchema,
  content: z.string().trim().max(2000, "Message truncated. Avoid lengthy chats over 2000chars limit.").optional().default(""),
  messageType: z
    .enum(["TEXT", "FILE", "OFFER", "CONTRACT_ACCEPTANCE", "SYSTEM"])
    .optional(),
  fileUrl: z.string().url("Must be a remote asset string URL").optional(),
  // Restrict metadata to a safe, typed shape — no arbitrary nested prototype overrides
  metadata: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
});

// ==================== TYPE EXPORTS ====================

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type InfluencerProfileInput = z.infer<typeof influencerProfileSchema>;
export type BrandProfileInput = z.infer<typeof brandProfileSchema>;
export type CampaignInput = z.infer<typeof createCampaignSchema>;
export interface ApplicationInput {
  campaignId: string;
  proposal: string;
  proposedRate: number;
  estimatedDelivery?: string | undefined;
  estimatedDeliveryDays?: number | undefined;
}
export type ContentSubmissionInput = z.infer<typeof contentSubmissionSchema>;
export type ProductFulfillmentInput = z.infer<typeof productFulfillmentSchema>;
export type WithdrawalInput = z.infer<typeof withdrawalSchema>;
export type DisputeInput = z.infer<typeof disputeSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
export type MessageInput = z.infer<typeof messageSchema>;
