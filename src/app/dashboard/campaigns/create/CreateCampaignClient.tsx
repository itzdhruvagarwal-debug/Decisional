"use client";


import { logger } from "@/lib/logger-client";
import { useState, useEffect } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Select, Textarea, Card } from "@/components/ui";
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

export type CreateCampaignValues = z.infer<typeof createCampaignSchema>;

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

function validateCampaignForm(formData: CampaignFormData): { success: boolean; fieldErrors?: Record<string, string>; error?: string } {
  const result = createCampaignSchema.safeParse({
    title: formData.title.trim(),
    description: formData.description.trim(),
    perInfluencerBudget: formData.perInfluencerBudget,
    maxInfluencers: formData.maxInfluencers ?? 1,
    minFollowers: formData.minFollowers,
    targetCategories: formData.targetCategories,
    applicationDeadline: formData.applicationDeadline,
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

  if (formData.requiresProduct && formData.totalBudget === 0) {
    if (formData.productValue < 500) {
      return { success: false, error: "Product-only campaigns must specify a product value of at least ₹500" };
    }
    if (formData.minFollowers > 10000) {
      return { success: false, error: "Product-only campaigns can only target influencers with up to 10,000 followers" };
    }
  }
  if (formData.targetCategories.length === 0) {
    return { success: false, error: "Please select at least one category" };
  }
  if (formData.perInfluencerBudget > formData.totalBudget) {
    return { success: false, error: "Per influencer budget cannot exceed total budget" };
  }
  if (formData.maxFollowers !== null && formData.maxFollowers > 0 && formData.maxFollowers < formData.minFollowers) {
    return { success: false, error: "Max followers must be greater than min followers" };
  }
  if (!formData.contentDeadline || !formData.postingDeadline) {
    return { success: false, error: "Please select content and posting deadlines" };
  }

  return { success: true };
}

interface DraftCampaignData {
  status?: string;
  title?: string;
  description?: string;
  requirements?: string;
  totalBudget?: number;
  perInfluencerBudget?: number;
  targetCategories?: string[];
  targetCities?: string[];
  targetGender?: string;
  targetAgeMin?: number | null;
  targetAgeMax?: number | null;
  minFollowers?: number;
  maxFollowers?: number | null;
  maxInfluencers?: number | null;
  applicationDeadline?: string;
  contentDeadline?: string;
  postingDeadline?: string;
  requiresProduct?: boolean;
  productName?: string;
  productValue?: number;
  productDescription?: string;
  deliverables?: Array<{ type: string; count: number; rate?: number }>;
}

interface DraftCampaignResponse {
  campaign?: DraftCampaignData;
  data?: { campaign?: DraftCampaignData };
}

export default function CreateCampaignClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitedInfluencerId = searchParams.get("invite");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [invitedInfluencer, setInvitedInfluencer] = useState<{
    displayName: string;
    instagramHandle?: string;
    youtubeHandle?: string;
  } | null>(null);

  useEffect(() => {
    if (!invitedInfluencerId) return;
    const fetchInfluencer = async () => {
      try {
        const res = await fetch(`/api/influencers/${invitedInfluencerId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.influencer) {
            setInvitedInfluencer(data.influencer);
          }
        }
      } catch (err) {
        logger.error("[campaign-create] Failed to fetch invited influencer details:", err);
      }
    };
    fetchInfluencer();
  }, [invitedInfluencerId]);

  const editCampaignId = searchParams.get("edit");

  const { data: draftData } = useSWR<DraftCampaignResponse>(
    editCampaignId ? `/api/campaigns/${editCampaignId}` : null,
    fetcher
  );

  useEffect(() => {
    if (!draftData) return;
    const campaign: DraftCampaignData | undefined = draftData.campaign || draftData.data?.campaign;
    if (campaign?.status === "DRAFT") {
      const formatDateForInput = (dateStr: string) => {
        if (!dateStr) return "";
        return dateStr.split("T")[0] || "";
      };

      setFormData({
        title: campaign.title || "",
        description: campaign.description || "",
        requirements: campaign.requirements || "",
        totalBudget: (campaign.totalBudget || 0) / 100,
        perInfluencerBudget: (campaign.perInfluencerBudget || 0) / 100,
        targetCategories: campaign.targetCategories || [],
        targetCities: campaign.targetCities || [],
        targetGender: campaign.targetGender || "ANY",
        targetAgeMin: campaign.targetAgeMin ?? null,
        targetAgeMax: campaign.targetAgeMax ?? null,
        minFollowers: campaign.minFollowers || 0,
        maxFollowers: campaign.maxFollowers || null,
        maxInfluencers: campaign.maxInfluencers || null,
        applicationDeadline: formatDateForInput(campaign.applicationDeadline || ""),
        contentDeadline: formatDateForInput(campaign.contentDeadline || ""),
        postingDeadline: formatDateForInput(campaign.postingDeadline || ""),
        requiresProduct: campaign.requiresProduct || false,
        productName: campaign.productName || "",
        productValue: (campaign.productValue || 0) / 100,
        productDescription: campaign.productDescription || "",
        deliverables: (campaign.deliverables || []).map((d: { type: string; count: number; rate?: number }) => ({
          type: d.type,
          count: d.count,
          rate: (d.rate || 0) / 100,
        })),
      });
    }
  }, [draftData]);

  // Form State
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    requirements: "",
    totalBudget: 5000,
    perInfluencerBudget: 1000,
    targetCategories: [] as string[],
    targetCities: [] as string[],
    targetGender: "ANY",
    targetAgeMin: null as number | null,
    targetAgeMax: null as number | null,
    minFollowers: 1000,
    maxFollowers: null as number | null,
    maxInfluencers: null as number | null,
    applicationDeadline: "",
    contentDeadline: "",
    postingDeadline: "",
    requiresProduct: false,
    productName: "",
    productValue: 0,
    productDescription: "",
    deliverables: [{ type: "INSTAGRAM_POST", count: 1, rate: 1000 }],
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [customCategory, setCustomCategory] = useState("");
  const [categories, setCategories] = useState([
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
    "Finance",
    "Health",
    "Parenting",
    "Sports",
    "Art",
    "Music",
    "Automotive",
    "Pets",
    "Real Estate",
    "Business"
  ]);

  const deliverableTypes = [
    { value: "INSTAGRAM_POST", label: "Instagram Post" },
    { value: "INSTAGRAM_REEL", label: "Instagram Reel" },
    { value: "INSTAGRAM_STORY", label: "Instagram Story" },
    { value: "YOUTUBE_VIDEO", label: "YouTube Video" },
    { value: "YOUTUBE_SHORT", label: "YouTube Short" },
  ];

  const handleCategoryToggle = (cat: string) => {
    setFormData((prev) => {
      if (prev.targetCategories.includes(cat)) {
        return {
          ...prev,
          targetCategories: prev.targetCategories.filter((c) => c !== cat),
        };
      } else {
        if (prev.targetCategories.length >= 5) return prev;
        return { ...prev, targetCategories: [...prev.targetCategories, cat] };
      }
    });
  };

  const handleAddDeliverable = () => {
    setFormData((prev) => {
      const type = "INSTAGRAM_POST";
      const count = 1;
      const rate = getRecommendedRate(type, prev.minFollowers);
      return {
        ...prev,
        deliverables: [
          ...prev.deliverables,
          { type, count, rate },
        ],
      };
    });
  };

  const handleRemoveDeliverable = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      deliverables: prev.deliverables.filter((_, i) => i !== index),
    }));
  };

  const getRecommendedRate = (type: string, minFollowers: number) => {
    const isYoutube = type.startsWith("YOUTUBE");
    const multiplier = isYoutube ? 2.5 : 2;
    const estimatedEngagement = minFollowers * 0.03;
    const calculated = Math.round(estimatedEngagement * multiplier);
    const floor = isYoutube ? 750 : 500;
    return Math.max(floor, Math.round(calculated / 10) * 10);
  };

  const handleDeliverableChange = (
    index: number,
    field: string,
    value: unknown,
  ) => {
    const newDeliverables = [...formData.deliverables] as Array<{ type: string; rate: number; count: number }>;
    const item = { ...newDeliverables[index]!, [field]: value };
    
    // Automatically recalculate recommended rate if type changes
    if (field === "type" && typeof value === "string") {
      item.rate = getRecommendedRate(value, formData.minFollowers);
    }
    
    newDeliverables[index] = item;
    setFormData((prev) => ({ ...prev, deliverables: newDeliverables }));
  };

  // Auto calculate perInfluencerBudget and totalBudget based on deliverables and maxInfluencers
  useEffect(() => {
    const calculatedPerInfluencer = formData.deliverables.reduce(
      (sum, d: { rate?: number; count?: number }) => sum + (d.rate || 0) * (d.count || 0),
      0
    );
    const calculatedTotal = calculatedPerInfluencer * (formData.maxInfluencers || 1);

    setFormData((prev) => {
      if (
        prev.perInfluencerBudget !== calculatedPerInfluencer ||
        prev.totalBudget !== calculatedTotal
      ) {
        return {
          ...prev,
          perInfluencerBudget: calculatedPerInfluencer,
          totalBudget: calculatedTotal,
        };
      }
      return prev;
    });
  }, [formData.deliverables, formData.maxInfluencers]);


  const handleSubmit = async (e: React.FormEvent, isDraft: boolean = false) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    setFieldErrors({});

    try {
      const validation = validateCampaignForm(formData);
      if (!validation.success) {
        if (validation.fieldErrors) {
          setFieldErrors(validation.fieldErrors);
          throw new Error("Please fix the validation errors below.");
        }
        throw new Error(validation.error || "Invalid campaign details");
      }

      const contentDeadline = new Date(`${formData.contentDeadline}T12:00:00.000Z`);
      const postingDeadline = new Date(`${formData.postingDeadline}T12:00:00.000Z`);
      const applicationDeadline = formData.applicationDeadline
        ? new Date(`${formData.applicationDeadline}T23:59:59.000Z`)
        : null;

      if (Number.isNaN(contentDeadline.getTime()) || Number.isNaN(postingDeadline.getTime())) {
        throw new TypeError("Invalid campaign deadlines");
      }
      if (postingDeadline < contentDeadline) {
        throw new Error("Posting deadline must be after content deadline");
      }
      if (applicationDeadline && Number.isNaN(applicationDeadline.getTime())) {
        throw new TypeError("Invalid application deadline");
      }
      if (applicationDeadline && applicationDeadline > contentDeadline) {
        throw new Error("Application deadline must be before content deadline");
      }

      const url = editCampaignId ? `/api/campaigns/${editCampaignId}` : "/api/campaigns";
      const method = editCampaignId ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          maxFollowers: formData.maxFollowers || 0,
          maxInfluencers: formData.maxInfluencers || null,
          applicationDeadline: applicationDeadline?.toISOString(),
          contentDeadline: contentDeadline.toISOString(),
          postingDeadline: postingDeadline.toISOString(),
          invitedInfluencerId: invitedInfluencerId || undefined,
          status: isDraft ? "DRAFT" : "ACTIVE",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Failed to create campaign");
      }

      router.push("/dashboard/campaigns");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  let publishButtonContent: React.ReactNode = "Create Campaign";
  if (isLoading) {
    publishButtonContent = <span className="loading" />;
  } else if (editCampaignId) {
    publishButtonContent = "Save & Publish";
  }

  return (
    <div className="w-full max-w-800 mx-auto" style={{ paddingBottom: "64px" }}>
      <h1
        className="font-black mb-2 text-3xl bg-gradient-primary" style={{ WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
      >
        {editCampaignId ? "Edit Draft Campaign" : "Create New Campaign"}
      </h1>
      <p
        className="text-secondary mb-8 text-base"
      >
        {editCampaignId
          ? "Update your draft campaign details before launching"
          : "Launch your campaign and connect with influencers"}
      </p>

      {invitedInfluencer && (
        <div
          className="flex items-center gap-3 mb-6 bg-indigo-subtle rounded-xl backdrop-blur" style={{ padding: "16px 20px", border: "1px solid rgba(99, 102, 241, 0.2)" }}
        >
          <div
            className="rounded-full" style={{ width: "8px", height: "8px", background: "#6366f1", boxShadow: "0 0 12px #6366f1" }}
          />
          <span className="font-medium text-sm text-primary">
            Inviting: <strong className="text-indigo">@{invitedInfluencer.instagramHandle || invitedInfluencer.youtubeHandle || invitedInfluencer.displayName}</strong> ({invitedInfluencer.displayName})
          </span>
        </div>
      )}

      <Card
        className="p-8 rounded-3xl"
      >
        {error && (
          <div
            className="mb-6 bg-rose-subtle rounded-md text-rose px-4-py-3" style={{ border: "1px solid rgba(244, 63, 94, 0.2)" }}
          >
            {error}
          </div>
        )}

        <form>
          {/* Basic Info */}
          <Input
            label="Campaign Title"
            id="campaign-title"
            type="text"
            value={formData.title}
            onChange={(e) =>
              setFormData({ ...formData, title: e.target.value })
            }
            required
            placeholder="e.g. Summer Collection Launch"
            className="mb-4"
            error={fieldErrors.title}
            fullWidth
          />

          <Textarea
            label="Overview / Description"
            id="campaign-description"
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            required
            placeholder="Describe your campaign goals and brand story..."
            className="mb-4"
            error={fieldErrors.description}
            fullWidth
          />

          <Textarea
            label="Requirements & Guidelines"
            id="campaign-requirements"
            value={formData.requirements}
            onChange={(e) =>
              setFormData({ ...formData, requirements: e.target.value })
            }
            required
            placeholder="Specific requirements for influencers (e.g. 'Must use #SummerVibes', 'Link in bio')"
            className="mb-4"
            error={fieldErrors.requirements}
            fullWidth
          />

          {/* Target Audience */}
          <div className="form-group mb-6">
            <label
              className="label text-primary"
              htmlFor="custom-category-input"
            >
              Target Categories (Select up to 5)
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {categories.map((cat) => (
                <Button
                  key={cat}
                  type="button"
                  onClick={() => handleCategoryToggle(cat)}
                  variant={formData.targetCategories.includes(cat) ? "primary" : "ghost"}
                  className="cursor-pointer text-sm px-4-py-2" style={{ background: formData.targetCategories.includes(cat)
                      ? "var(--gradient-primary)"
                      : "var(--color-bg-tertiary)", color: formData.targetCategories.includes(cat)
                      ? "white"
                      : "var(--color-text-secondary)", border: formData.targetCategories.includes(cat)
                      ? "none"
                      : "1px solid var(--color-border)", boxShadow: formData.targetCategories.includes(cat)
                      ? "0 4px 16px rgba(99, 102, 241, 0.4)"
                      : "none", transition: "all 0.3s ease" }}
                >
                  {cat}
                </Button>
              ))}
            </div>

            <div className="flex gap-2 items-center">
              <Input
                id="custom-category-input"
                type="text"
                placeholder="Enter custom category..."
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                className="max-w-200"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (customCategory.trim() && !categories.includes(customCategory.trim())) {
                      setCategories(prev => [...prev, customCategory.trim()]);
                      handleCategoryToggle(customCategory.trim());
                      setCustomCategory("");
                    }
                  }
                }}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (customCategory.trim() && !categories.includes(customCategory.trim())) {
                    setCategories(prev => [...prev, customCategory.trim()]);
                    handleCategoryToggle(customCategory.trim());
                    setCustomCategory("");
                  }
                }}
              >
                Add Category
              </Button>
            </div>
          </div>

          <Input
            label="Application Deadline (Optional)"
            id="application-deadline"
            type="date"
            value={formData.applicationDeadline}
            onChange={(e) =>
              setFormData({ ...formData, applicationDeadline: e.target.value })
            }
            className="mb-4 color-scheme-dark"
            error={fieldErrors.applicationDeadline}
            fullWidth
          />

          <div className="grid-2 gap-4 mb-4">
            <Input
              label="Target Cities (Comma Separated)"
              id="target-cities"
              type="text"
              placeholder="e.g. Mumbai, Delhi"
              value={formData.targetCities.join(", ")}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  targetCities: e.target.value.split(",").map(c => c.trim()).filter(Boolean),
                })
              }
              fullWidth
            />
            <Select
              label="Target Gender"
              id="target-gender"
              value={formData.targetGender}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  targetGender: e.target.value,
                })
              }
              fullWidth
            >
              <option value="ANY">Any</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
            </Select>
          </div>

          <div className="grid-2 gap-4 mb-4">
            <Input
              label="Min Target Age"
              id="target-age-min"
              type="number"
              placeholder="e.g. 18"
              value={formData.targetAgeMin || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  targetAgeMin: e.target.value ? Number.parseInt(e.target.value, 10) : null,
                })
              }
              min={13}
              fullWidth
            />
            <Input
              label="Max Target Age"
              id="target-age-max"
              type="number"
              placeholder="e.g. 35"
              value={formData.targetAgeMax || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  targetAgeMax: e.target.value ? Number.parseInt(e.target.value, 10) : null,
                })
              }
              min={13}
              fullWidth
            />
          </div>

          <div className="mb-4 grid gap-4 grid-cols-3">
            <Input
              label="Min Followers Req."
              id="min-followers"
              type="number"
              value={formData.minFollowers}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  minFollowers: Number.parseInt(e.target.value, 10) || 0,
                })
              }
              min={100}
              error={fieldErrors.minFollowers}
              fullWidth
            />
            <Input
              label="Max Followers Req. (Optional)"
              id="max-followers"
              type="number"
              value={formData.maxFollowers === null ? "" : formData.maxFollowers}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  maxFollowers: e.target.value ? Number.parseInt(e.target.value, 10) : null,
                })
              }
              min={1000}
              placeholder="No limit"
              error={fieldErrors.maxFollowers}
              fullWidth
            />
            <Input
              label="Max Influencer Slots"
              id="max-influencers"
              type="number"
              value={formData.maxInfluencers === null ? "" : formData.maxInfluencers}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  maxInfluencers: e.target.value ? Number.parseInt(e.target.value, 10) : null,
                })
              }
              min={1}
              max={100}
              placeholder="Unlimited"
              error={fieldErrors.maxInfluencers}
              fullWidth
            />
          </div>

          {/* Budget & Timeline */}
          <div className="grid-2 gap-4 mb-4">
            <Input
              label="Total Budget (Rs)"
              id="total-budget"
              type="number"
              value={formData.totalBudget}
              readOnly
              disabled
              required
              min={formData.requiresProduct ? 0 : 1000}
              fullWidth
              className="text-secondary bg-tertiary cursor-not-allowed"
            />
            <Input
              label="Budget Per Influencer (Approx Rs)"
              id="per-influencer-budget"
              type="number"
              value={formData.perInfluencerBudget}
              readOnly
              disabled
              required
              min={formData.requiresProduct ? 0 : 500}
              fullWidth
              className="text-secondary bg-tertiary cursor-not-allowed"
            />
          </div>

          <div className="grid-2 gap-4 mb-4">
            <Input
              label="Content Deadline"
              id="content-deadline"
              type="date"
              value={formData.contentDeadline}
              onChange={(e) =>
                setFormData({ ...formData, contentDeadline: e.target.value })
              }
              required
              error={fieldErrors.contentDeadline}
              fullWidth
              className="color-scheme-dark"
            />
            <Input
              label="Posting Deadline"
              id="posting-deadline"
              type="date"
              value={formData.postingDeadline}
              onChange={(e) =>
                setFormData({ ...formData, postingDeadline: e.target.value })
              }
              required
              error={fieldErrors.postingDeadline}
              fullWidth
              className="color-scheme-dark"
            />
          </div>

          <Card
            className="mb-4 p-5 bg-tertiary" style={{ border: "1px dashed var(--color-border)" }}
          >
            <div
              className="flex items-center justify-between"
              style={{
                marginBottom: formData.requiresProduct ? "16px" : "0",
              }}
            >
              <div>
                <h3
                  className="text-base font-semibold text-primary"
                >
                  Product Seeding (Barter / Logistics)
                </h3>
                <p
                  className="text-secondary text-sm mt-1"
                >
                  Do you need to ship a physical product to the influencer?
                </p>
              </div>
              <label className="switch" aria-label="Requires physical product seeding">
                <Input
                  type="checkbox"
                  checked={formData.requiresProduct}
                  onChange={(e) =>
                    setFormData({ ...formData, requiresProduct: e.target.checked })
                  }
                />
                <span className="slider round"></span>
                <span className="sr-only">Requires physical product seeding</span>
              </label>
            </div>

            {formData.requiresProduct && (
              <div className="mt-4">
                <div className="grid-2 gap-4 mb-3">
                  <Input
                    label="Product Name"
                    id="product-name"
                    type="text"
                    value={formData.productName}
                    onChange={(e) =>
                      setFormData({ ...formData, productName: e.target.value })
                    }
                    required={formData.requiresProduct}
                    placeholder="e.g. Glowing Skin Serum 50ml"
                    fullWidth
                  />
                  <Input
                    label="Product Value (Rs)"
                    id="product-value"
                    type="number"
                    value={formData.productValue}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        productValue: Number.parseInt(e.target.value, 10) || 0,
                      })
                    }
                    min={0}
                    placeholder="e.g. 1500"
                    fullWidth
                  />
                </div>
                <Textarea
                  label="Logistics / Shipping Instructions"
                  id="product-description"
                  value={formData.productDescription}
                  onChange={(e) =>
                    setFormData({ ...formData, productDescription: e.target.value })
                  }
                  placeholder="Provide any details about the product and shipping timelines..."
                  fullWidth
                />
              </div>
            )}
          </Card>

          {/* Deliverables */}
          <div className="form-group mb-4">
            <div className="flex justify-between items-center mb-2">
              <div className="label">Deliverables Required</div>
              <Button
                type="button"
                variant="ghost"
                onClick={handleAddDeliverable}
                className="text-sm font-semibold px-2-py-1"
              >
                + Add Deliverable
              </Button>
            </div>

            {formData.deliverables.map((item, index) => (
              <div
                key={`deliv-${item.type}-${index}`}
                className="flex gap-3 items-center mb-2"
              >
                <Select
                  value={item.type}
                  onChange={(e) =>
                    handleDeliverableChange(index, "type", e.target.value)
                  }
                  className="flex-2"
                >
                  {deliverableTypes.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
                
                <Input
                  type="number"
                  value={item.count}
                  onChange={(e) =>
                    handleDeliverableChange(
                      index,
                      "count",
                      Number.parseInt(e.target.value, 10) || 1,
                    )
                  }
                  min={1}
                  max={10}
                  className="w-80"
                />
                
                <span className="text-secondary text-sm">
                  qty
                </span>
                
                <div className="flex flex-col gap-1">
                  <Input
                    type="number"
                    value={item.rate || ""}
                    onChange={(e) =>
                      handleDeliverableChange(
                        index,
                        "rate",
                        Number.parseInt(e.target.value, 10) || 0,
                      )
                    }
                    min={0}
                    placeholder="Rate (Rs)"
                    style={{ width: "110px" }}
                  />
                  <span className="text-muted whitespace-nowrap text-2xs">
                    Rec: ₹{getRecommendedRate(item.type, formData.minFollowers).toLocaleString("en-IN")}
                  </span>
                </div>
                
                {formData.deliverables.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleRemoveDeliverable(index)}
                    className="text-lg text-rose" style={{ padding: "0 8px" }}
                  >
                    x
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.back()}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={(e) => handleSubmit(e, true)}
              disabled={isLoading}
            >
              {isLoading ? <span className="loading" /> : "Save as Draft"}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={(e) => handleSubmit(e, false)}
              disabled={isLoading}
            >
              {publishButtonContent}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

