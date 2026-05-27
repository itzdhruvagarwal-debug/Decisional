/**
 * Utility Functions
 */

import { randomInt, createHash } from "crypto";

// Read fee percentages at call-time, not import-time (supports runtime env changes in serverless)
function getPlatformFeePercentage(): number {
  return Number(process.env.PLATFORM_FEE_PERCENTAGE) || 10;
}

function getGatewayFeePercentage(): number {
  return Number(process.env.GATEWAY_FEE_PERCENTAGE) || 2;
}

export interface PaymentBreakdown {
  amount: number; // Deal amount in paise
  platformFee: number; // Platform fee in paise
  gatewayFee: number; // Gateway fee in paise
  totalAmount: number; // Total to charge brand in paise
  influencerPayout: number; // Amount influencer receives in paise
}

export function calculatePaymentBreakdown(
  dealAmount: number,
  feeDiscount: number = 0,
): PaymentBreakdown {
  // dealAmount is in paise (1 rupee = 100 paise)
  const effectiveFeePercentage = Math.max(
    0,
    getPlatformFeePercentage() - feeDiscount,
  );

  const platformFee = Math.round((dealAmount * effectiveFeePercentage) / 100);
  const gatewayFee = Math.round(
    ((dealAmount + platformFee) * getGatewayFeePercentage()) / 100,
  );
  const totalAmount = dealAmount + platformFee + gatewayFee;
  const influencerPayout = dealAmount; // Influencer gets full deal amount

  return {
    amount: dealAmount,
    platformFee,
    gatewayFee,
    totalAmount,
    influencerPayout,
  };
}

// ==================== FORMATTING ====================

export function formatCurrency(amountInPaise: number): string {
  const rupees = amountInPaise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees);
}

export function formatNumber(num: number): string {
  if (num >= 10000000) {
    return (num / 10000000).toFixed(1) + "Cr";
  }
  if (num >= 100000) {
    return (num / 100000).toFixed(1) + "L";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDate(date);
}

// ==================== STRING UTILITIES ====================

export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

// ==================== VALIDATION HELPERS ====================

export function isValidInstagramUrl(url: string): boolean {
  const patterns = [
    /^https?:\/\/(www\.)?instagram\.com\/p\/[\w-]+\/?$/,
    /^https?:\/\/(www\.)?instagram\.com\/reel\/[\w-]+\/?$/,
    /^https?:\/\/(www\.)?instagram\.com\/stories\/[\w-]+\/[\w-]+\/?$/,
  ];
  return patterns.some((pattern) => pattern.test(url));
}

export function isValidYoutubeUrl(url: string): boolean {
  const patterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
    /^https?:\/\/(www\.)?youtu\.be\/[\w-]+/,
    /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/,
  ];
  return patterns.some((pattern) => pattern.test(url));
}

export function extractInstagramUsername(url: string): string | null {
  const match = url.match(/instagram\.com\/([\w.]+)/);
  return match ? (match[1] ?? null) : null;
}

// ==================== DATE UTILITIES ====================

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addHours(date: Date, hours: number): Date {
  const result = new Date(date);
  result.setTime(result.getTime() + hours * 60 * 60 * 1000);
  return result;
}

export function isExpired(date: Date): boolean {
  return new Date() > date;
}

export function getTimeRemaining(deadline: Date): {
  days: number;
  hours: number;
  minutes: number;
  isExpired: boolean;
} {
  const now = new Date();
  const diff = deadline.getTime() - now.getTime();

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, isExpired: true };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return { days, hours, minutes, isExpired: false };
}

// ==================== RANDOM GENERATORS ====================

export function generateOTP(): string {
  return randomInt(100000, 999999).toString();
}

export function generateReferralCode(prefix: string = ""): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  // Use timestamp base36 suffix + 6 random chars for near-zero collision probability
  const timePart = Date.now().toString(36).slice(-3).toUpperCase();
  // Add random salt to reduce collision risk under concurrent load
  const salt = randomInt(0, 1000).toString(36).toUpperCase();
  let code = prefix.toUpperCase() + timePart + salt;
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(randomInt(0, chars.length));
  }
  return code;
}

// ==================== HASH UTILITIES ====================

/**
 * Generate a SHA-256 hash for content verification (not the old DJB2 fake-MD5).
 * Used in fraud detection for content uniqueness checks.
 */
export function generateContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** @deprecated Use generateContentHash instead */
export const generateMD5Hash = generateContentHash;

// ==================== CATEGORY & LANGUAGE DATA ====================

export const CATEGORIES = [
  "Fashion",
  "Beauty",
  "Lifestyle",
  "Food",
  "Travel",
  "Fitness",
  "Technology",
  "Gaming",
  "Entertainment",
  "Education",
  "Business",
  "Finance",
  "Health",
  "Parenting",
  "Pets",
  "Sports",
  "Music",
  "Art",
  "Photography",
  "Comedy",
] as const;

export const LANGUAGES = [
  "Hindi",
  "English",
  "Tamil",
  "Telugu",
  "Kannada",
  "Malayalam",
  "Bengali",
  "Marathi",
  "Gujarati",
  "Punjabi",
  "Odia",
  "Assamese",
] as const;

export const INDIAN_CITIES = [
  "Mumbai",
  "Delhi",
  "Bangalore",
  "Hyderabad",
  "Chennai",
  "Kolkata",
  "Pune",
  "Ahmedabad",
  "Jaipur",
  "Lucknow",
  "Surat",
  "Kanpur",
  "Nagpur",
  "Indore",
  "Thane",
  "Bhopal",
  "Visakhapatnam",
  "Patna",
  "Vadodara",
  "Ghaziabad",
] as const;

export const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Delhi",
] as const;

// ==================== STATUS LABELS ====================

export const DEAL_STATUS_LABELS: Record<
  string,
  { label: string; color: string }
> = {
  PENDING_SIGNATURE: { label: "Pending Signature", color: "yellow" },
  PAYMENT_PENDING: { label: "Payment Pending", color: "yellow" },
  PAYMENT_HELD: { label: "Payment Secured", color: "blue" },
  ACTIVE: { label: "Active", color: "blue" },
  CONTENT_SUBMITTED: { label: "Content Submitted", color: "purple" },
  REVISION_REQUESTED: { label: "Revision Requested", color: "orange" },
  CONTENT_APPROVED: { label: "Content Approved", color: "green" },
  POSTED: { label: "Posted", color: "green" },
  VERIFICATION_PENDING: { label: "Verifying Post", color: "purple" },
  VERIFIED: { label: "Verified", color: "green" },
  COMPLETED: { label: "Completed", color: "green" },
  DISPUTED: { label: "In Dispute", color: "red" },
  CANCELLED: { label: "Cancelled", color: "gray" },
};

export const TRUST_TIER_LABELS: Record<
  string,
  { label: string; color: string; description: string }
> = {
  FLAGGED: {
    label: "Flagged",
    color: "red",
    description: "Manual review required before any transactions",
  },
  LIMITED: {
    label: "Limited",
    color: "yellow",
    description: "Maximum ₹5,000 per deal",
  },
  NORMAL: {
    label: "Normal",
    color: "blue",
    description: "Maximum ₹25,000 per deal",
  },
  TRUSTED: {
    label: "Trusted",
    color: "green",
    description: "Maximum ₹1,00,000 per deal",
  },
  ELITE: {
    label: "Elite",
    color: "purple",
    description: "Unlimited deal amount + perks",
  },
};
