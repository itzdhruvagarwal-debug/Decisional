import { z } from "zod";

export const createCampaignSchema = z.object({
title: z
.string()
.min(5, "Title must be at least 5 characters")
.max(100, "Title cannot exceed 100 characters"),
description: z
.string()
.min(20, "Description must be at least 20 characters")
.max(2000, "Description cannot exceed 2000 characters"),
perInfluencerBudget: z
.number({ message: "Budget per influencer must be a number" })
.min(0, "Budget per influencer cannot be negative")
.max(1000000, "Maximum budget per influencer is 10,00,000"),
maxInfluencers: z
.number({ message: "Influencer count must be a number" })
.min(1, "Campaign must accept at least 1 influencer")
.max(100, "Maximum 100 influencers per campaign"),
minFollowers: z
.number()
.min(0, "Minimum followers cannot be negative"),
targetCategories: z
.array(z.string())
.min(1, "Please select at least one target category"),
applicationDeadline: z.string().optional(),
postingDeadline: z.string().min(1, "Posting deadline date is required"),
});

export interface CampaignFormData {
title: string;
description: string;
requirements: string;
totalBudget: number;
perInfluencerBudget: number;
targetCategories: string[];
targetCities: string[];
targetGender: string;
targetAgeMin: number | null;
targetAgeMax: number | null;
minFollowers: number;
maxFollowers: number | null;
maxInfluencers: number | null;
applicationDeadline: string;
contentDeadline: string;
postingDeadline: string;
requiresProduct: boolean;
productName: string;
productValue: number;
productDescription: string;
deliverables: Array<{ type: string; count: number; rate: number }>;
}

type ValidationResult = { success: boolean; fieldErrors?: Record<string, string>; error?: string };

function validateBudget(formData: CampaignFormData): ValidationResult | null {
  if (formData.requiresProduct && formData.totalBudget === 0) {
    if (formData.productValue < 500) {
      return { success: false, error: "Product-only campaigns must specify a product value of at least ₹500" };
    }
    if (formData.minFollowers > 10000) {
      return { success: false, error: "Product-only campaigns can only target influencers with up to 10,000 followers" };
    }
  } else {
    if (formData.perInfluencerBudget < 500) {
      return { success: false, error: "Minimum budget per influencer is ₹500" };
    }
    if (formData.totalBudget < 1000) {
      return { success: false, error: "Minimum campaign budget is ₹1,000" };
    }
  }
  return null;
}

function validateDeadlines(formData: CampaignFormData): ValidationResult | null {
if (!formData.contentDeadline || !formData.postingDeadline) {
return { success: false, error: "Please select content and posting deadlines" };
}
const contentDate = new Date(formData.contentDeadline);
const postingDate = new Date(formData.postingDeadline);
if (Number.isNaN(contentDate.getTime()) || Number.isNaN(postingDate.getTime())) {
return { success: false, error: "Please select valid content and posting deadlines" };
}
if (postingDate < contentDate) {
return { success: false, error: "Posting deadline must be after content deadline" };
}
if (formData.applicationDeadline) {
const appDate = new Date(formData.applicationDeadline);
if (Number.isNaN(appDate.getTime())) {
return { success: false, error: "Please select a valid application deadline" };
}
const today = new Date();
today.setHours(0, 0, 0, 0);
const appDateStart = new Date(appDate);
appDateStart.setHours(0, 0, 0, 0);
if (appDateStart < today) {
return { success: false, error: "Application deadline cannot be in the past" };
}
if (appDateStart > contentDate) {
return { success: false, error: "Application deadline must be before content deadline" };
}
}
return null;
}

export function validateCampaignForm(formData: CampaignFormData): ValidationResult {
const result = createCampaignSchema.safeParse({
title: formData.title.trim(),
description: formData.description.trim(),
perInfluencerBudget: formData.perInfluencerBudget,
maxInfluencers: formData.maxInfluencers ?? 1,
minFollowers: formData.minFollowers,
targetCategories: formData.targetCategories,
applicationDeadline: formData.applicationDeadline || undefined,
postingDeadline: formData.postingDeadline,
});

if (!result.success) {
const fieldErrors: Record<string, string> = {};
result.error.issues.forEach((issue) => {
const path = issue.path[0];
if (typeof path === "string") {
fieldErrors[path] = issue.message;
}
});
return { success: false, fieldErrors };
}

const budgetError = validateBudget(formData);
if (budgetError) return budgetError;

if (formData.targetCategories.length === 0) {
return { success: false, error: "Please select at least one category" };
}
if (formData.perInfluencerBudget > formData.totalBudget) {
return { success: false, error: "Per influencer budget cannot exceed total budget" };
}
if (formData.maxFollowers !== null && formData.maxFollowers > 0 && formData.maxFollowers < formData.minFollowers) {
return { success: false, error: "Max followers must be greater than min followers" };
}

const deadlineError = validateDeadlines(formData);
if (deadlineError) return deadlineError;

return { success: true };
}

export const getRecommendedRate = (type: string, minFollowers: number) => {
const isYoutube = type.startsWith("YOUTUBE");
const multiplier = isYoutube ? 2.5 : 2;
const estimatedEngagement = minFollowers * 0.03;
const calculated = Math.round(estimatedEngagement * multiplier);
const floor = isYoutube ? 750 : 500;
return Math.max(floor, Math.round(calculated / 10) * 10);
};

export const deliverableTypes = [
{ value: "INSTAGRAM_POST", label: "Instagram Post" },
{ value: "INSTAGRAM_REEL", label: "Instagram Reel" },
{ value: "INSTAGRAM_STORY", label: "Instagram Story" },
{ value: "YOUTUBE_VIDEO", label: "YouTube Video" },
{ value: "YOUTUBE_SHORT", label: "YouTube Short" },
];
