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
    .min(500, "Minimum budget per influencer is ₹500")
    .max(1000000, "Maximum budget per influencer is ₹10,00,000"),
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
  applicationDeadline: z.string().min(1, "Application deadline date is required"),
  postingDeadline: z.string().min(1, "Posting deadline date is required"),
});
