"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function validateCampaignForm(formData: any) {
  if (formData.requiresProduct && formData.totalBudget === 0) {
    if (formData.productValue < 500) {
      throw new Error("Product-only campaigns must specify a product value of at least ₹500");
    }
    if (formData.minFollowers > 10000) {
      throw new Error("Product-only campaigns can only target influencers with up to 10,000 followers");
    }
  }
  if (formData.targetCategories.length === 0) {
    throw new Error("Please select at least one category");
  }
  if (formData.perInfluencerBudget > formData.totalBudget) {
    throw new Error("Per influencer budget cannot exceed total budget");
  }
  if (formData.maxFollowers !== null && formData.maxFollowers > 0 && formData.maxFollowers < formData.minFollowers) {
    throw new Error("Max followers must be greater than min followers");
  }
  if (!formData.contentDeadline || !formData.postingDeadline) {
    throw new Error("Please select content and posting deadlines");
  }
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
        console.error("[campaign-create] Failed to fetch invited influencer details:", err);
      }
    };
    fetchInfluencer();
  }, [invitedInfluencerId]);

  const editCampaignId = searchParams.get("edit");

  useEffect(() => {
    if (!editCampaignId) return;
    const fetchCampaign = async () => {
      try {
        const res = await fetch(`/api/campaigns/${editCampaignId}`);
        if (res.ok) {
          const data = await res.json();
          const campaign = data.campaign;
          if (campaign?.status === "DRAFT") {
            const formatDateForInput = (dateStr: string) => {
              if (!dateStr) return "";
              return dateStr.split("T")[0] || "";
            };

            setFormData({
              title: campaign.title || "",
              description: campaign.description || "",
              requirements: campaign.requirements || "",
              totalBudget: campaign.totalBudget / 100,
              perInfluencerBudget: (campaign.perInfluencerBudget || 0) / 100,
              targetCategories: campaign.targetCategories || [],
              targetCities: campaign.targetCities || [],
              targetGender: campaign.targetGender || "ANY",
              targetAgeMin: campaign.targetAgeMin,
              targetAgeMax: campaign.targetAgeMax,
              minFollowers: campaign.minFollowers || 0,
              maxFollowers: campaign.maxFollowers || null,
              maxInfluencers: campaign.maxInfluencers || null,
              applicationDeadline: formatDateForInput(campaign.applicationDeadline),
              contentDeadline: formatDateForInput(campaign.contentDeadline),
              postingDeadline: formatDateForInput(campaign.postingDeadline),
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
        }
      } catch (err) {
        console.error("[campaign-create] Failed to fetch campaign details for editing:", err);
      }
    };
    fetchCampaign();
  }, [editCampaignId]);

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

    try {
      validateCampaignForm(formData);

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
    <div style={{ maxWidth: "800px", margin: "0 auto", paddingBottom: "64px" }}>
      <h1
        style={{
          fontSize: "32px",
          fontWeight: 800,
          marginBottom: "8px",
          background: "var(--gradient-primary)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        {editCampaignId ? "Edit Draft Campaign" : "Create New Campaign"}
      </h1>
      <p
        style={{
          color: "var(--color-text-secondary)",
          marginBottom: "32px",
          fontSize: "16px",
        }}
      >
        {editCampaignId
          ? "Update your draft campaign details before launching"
          : "Launch your campaign and connect with influencers"}
      </p>

      {invitedInfluencer && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "16px 20px",
            background: "rgba(99, 102, 241, 0.1)",
            border: "1px solid rgba(99, 102, 241, 0.2)",
            borderRadius: "16px",
            marginBottom: "24px",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#6366f1",
              boxShadow: "0 0 12px #6366f1",
            }}
          />
          <span style={{ fontSize: "15px", fontWeight: 500, color: "var(--color-text-primary)" }}>
            Inviting: <strong style={{ color: "#6366f1" }}>@{invitedInfluencer.instagramHandle || invitedInfluencer.youtubeHandle || invitedInfluencer.displayName}</strong> ({invitedInfluencer.displayName})
          </span>
        </div>
      )}

      <div
        className="card"
        style={{
          background:
            "linear-gradient(145deg, rgba(28, 28, 48, 0.6) 0%, rgba(18, 18, 31, 0.8) 100%)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255, 255, 255, 0.05)",
          borderRadius: "24px",
          padding: "32px",
        }}
      >
        {error && (
          <div
            style={{
              padding: "12px 16px",
              background: "rgba(244, 63, 94, 0.1)",
              border: "1px solid rgba(244, 63, 94, 0.2)",
              borderRadius: "var(--radius-md)",
              color: "var(--color-accent-rose)",
              marginBottom: "24px",
            }}
          >
            {error}
          </div>
        )}

        <form>
          {/* Basic Info */}
          <div className="form-group" style={{ marginBottom: "24px" }}>
            <label
              className="label"
              htmlFor="campaign-title"
              style={{ color: "var(--color-text-primary)" }}
            >
              Campaign Title
            </label>
            <input
              id="campaign-title"
              type="text"
              className="input"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              required
              placeholder="e.g. Summer Collection Launch"
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: "24px" }}>
            <label
              className="label"
              htmlFor="campaign-description"
              style={{ color: "var(--color-text-primary)" }}
            >
              Overview / Description
            </label>
            <textarea
              id="campaign-description"
              className="input"
              style={{
                minHeight: "120px",
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              required
              placeholder="Describe your campaign goals and brand story..."
            />
          </div>

          <div className="form-group" style={{ marginBottom: "24px" }}>
            <label
              className="label"
              htmlFor="campaign-requirements"
              style={{ color: "var(--color-text-primary)" }}
            >
              Requirements & Guidelines
            </label>
            <textarea
              id="campaign-requirements"
              className="input"
              style={{
                minHeight: "120px",
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
              value={formData.requirements}
              onChange={(e) =>
                setFormData({ ...formData, requirements: e.target.value })
              }
              required
              placeholder="Specific requirements for influencers (e.g. 'Must use #SummerVibes', 'Link in bio')"
            />
          </div>

          {/* Target Audience */}
          <div className="form-group" style={{ marginBottom: "24px" }}>
            <label
              className="label"
              htmlFor="custom-category-input"
              style={{ color: "var(--color-text-primary)" }}
            >
              Target Categories (Select up to 5)
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => handleCategoryToggle(cat)}
                  className={`badge`}
                  style={{
                    cursor: "pointer",
                    background: formData.targetCategories.includes(cat)
                      ? "var(--gradient-primary)"
                      : "rgba(255, 255, 255, 0.03)",
                    color: formData.targetCategories.includes(cat)
                      ? "white"
                      : "var(--color-text-secondary)",
                    border: formData.targetCategories.includes(cat)
                      ? "none"
                      : "1px solid rgba(255, 255, 255, 0.08)",
                    boxShadow: formData.targetCategories.includes(cat)
                      ? "0 4px 16px rgba(99, 102, 241, 0.4)"
                      : "none",
                    padding: "8px 16px",
                    fontSize: "13px",
                    transition: "all 0.3s ease",
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                id="custom-category-input"
                type="text"
                className="input"
                placeholder="Enter custom category..."
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  maxWidth: "200px"
                }}
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
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: "8px 16px", fontSize: "13px" }}
                onClick={() => {
                  if (customCategory.trim() && !categories.includes(customCategory.trim())) {
                    setCategories(prev => [...prev, customCategory.trim()]);
                    handleCategoryToggle(customCategory.trim());
                    setCustomCategory("");
                  }
                }}
              >
                Add Category
              </button>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: "24px" }}>
            <label
              className="label"
              htmlFor="application-deadline"
              style={{ color: "var(--color-text-primary)" }}
            >
              Application Deadline (Optional)
            </label>
            <input
              id="application-deadline"
              type="date"
              className="input"
              value={formData.applicationDeadline}
              onChange={(e) =>
                setFormData({ ...formData, applicationDeadline: e.target.value })
              }
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                colorAdjust: "exact",
                colorScheme: "dark",
              }}
            />
          </div>

          <div className="grid-2" style={{ gap: "24px", marginBottom: "24px" }}>
            <div className="form-group">
              <label
                className="label"
                htmlFor="target-cities"
                style={{ color: "var(--color-text-primary)" }}
              >
                Target Cities (Comma Separated)
              </label>
              <input
                id="target-cities"
                type="text"
                className="input"
                placeholder="e.g. Mumbai, Delhi"
                value={formData.targetCities.join(", ")}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    targetCities: e.target.value.split(",").map(c => c.trim()).filter(Boolean),
                  })
                }
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              />
            </div>
            <div className="form-group">
              <label
                className="label"
                htmlFor="target-gender"
                style={{ color: "var(--color-text-primary)" }}
              >
                Target Gender
              </label>
              <select
                id="target-gender"
                className="input"
                value={formData.targetGender}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    targetGender: e.target.value,
                  })
                }
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  color: "white"
                }}
              >
                <option value="ANY">Any</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </select>
            </div>
          </div>

          <div className="grid-2" style={{ gap: "24px", marginBottom: "24px" }}>
            <div className="form-group">
              <label
                className="label"
                htmlFor="target-age-min"
                style={{ color: "var(--color-text-primary)" }}
              >
                Min Target Age
              </label>
              <input
                id="target-age-min"
                type="number"
                className="input"
                placeholder="e.g. 18"
                value={formData.targetAgeMin || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    targetAgeMin: e.target.value ? Number.parseInt(e.target.value, 10) : null,
                  })
                }
                min={13}
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              />
            </div>
            <div className="form-group">
              <label
                className="label"
                htmlFor="target-age-max"
                style={{ color: "var(--color-text-primary)" }}
              >
                Max Target Age
              </label>
              <input
                id="target-age-max"
                type="number"
                className="input"
                placeholder="e.g. 35"
                value={formData.targetAgeMax || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    targetAgeMax: e.target.value ? Number.parseInt(e.target.value, 10) : null,
                  })
                }
                min={13}
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px", marginBottom: "24px" }}>
            <div className="form-group">
              <label
                className="label"
                htmlFor="min-followers"
                style={{ color: "var(--color-text-primary)" }}
              >
                Min Followers Req.
              </label>
              <input
                id="min-followers"
                type="number"
                className="input"
                value={formData.minFollowers}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    minFollowers: Number.parseInt(e.target.value, 10) || 0,
                  })
                }
                min={100}
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              />
            </div>
            <div className="form-group">
              <label
                className="label"
                htmlFor="max-followers"
                style={{ color: "var(--color-text-primary)" }}
              >
                Max Followers Req. (Optional)
              </label>
              <input
                id="max-followers"
                type="number"
                className="input"
                value={formData.maxFollowers === null ? "" : formData.maxFollowers}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    maxFollowers: e.target.value ? Number.parseInt(e.target.value, 10) : null,
                  })
                }
                min={1000}
                placeholder="No limit"
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              />
            </div>
            <div className="form-group">
              <label
                className="label"
                htmlFor="max-influencers"
                style={{ color: "var(--color-text-primary)" }}
              >
                Max Influencer Slots
              </label>
              <input
                id="max-influencers"
                type="number"
                className="input"
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
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              />
            </div>
          </div>

           {/* Budget & Timeline */}
          <div className="grid-2">
            <div className="form-group">
              <label
                className="label"
                htmlFor="total-budget"
                style={{ color: "var(--color-text-primary)" }}
              >
                Total Budget (Rs)
              </label>
              <input
                id="total-budget"
                type="number"
                className="input"
                value={formData.totalBudget}
                readOnly
                disabled
                required
                min={formData.requiresProduct ? 0 : 1000}
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  cursor: "not-allowed",
                  color: "rgba(255, 255, 255, 0.5)",
                }}
              />
              <span style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.4)", marginTop: "4px", display: "block" }}>
                Auto-calculated: (Budget Per Influencer) × (Max Influencer Slots or 1)
              </span>
            </div>
            <div className="form-group">
              <label
                className="label"
                htmlFor="per-influencer-budget"
                style={{ color: "var(--color-text-primary)" }}
              >
                Budget Per Influencer (Approx Rs)
              </label>
              <input
                id="per-influencer-budget"
                type="number"
                className="input"
                value={formData.perInfluencerBudget}
                readOnly
                disabled
                required
                min={formData.requiresProduct ? 0 : 500}
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  cursor: "not-allowed",
                  color: "rgba(255, 255, 255, 0.5)",
                }}
              />
              <span style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.4)", marginTop: "4px", display: "block" }}>
                Auto-calculated: Sum of all deliverable rates per unit
              </span>
            </div>
          </div>

          <div className="grid-2" style={{ gap: "24px", marginBottom: "24px" }}>
            <div className="form-group">
              <label
                className="label"
                htmlFor="content-deadline"
                style={{ color: "var(--color-text-primary)" }}
              >
                Content Deadline
              </label>
              <input
                id="content-deadline"
                type="date"
                className="input"
                value={formData.contentDeadline}
                onChange={(e) =>
                  setFormData({ ...formData, contentDeadline: e.target.value })
                }
                required
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  colorAdjust: "exact",
                  colorScheme: "dark",
                }}
              />
            </div>
            <div className="form-group">
              <label
                className="label"
                htmlFor="posting-deadline"
                style={{ color: "var(--color-text-primary)" }}
              >
                Posting Deadline
              </label>
              <input
                id="posting-deadline"
                type="date"
                className="input"
                value={formData.postingDeadline}
                onChange={(e) =>
                  setFormData({ ...formData, postingDeadline: e.target.value })
                }
                required
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  colorAdjust: "exact",
                  colorScheme: "dark",
                }}
              />
            </div>
          </div>

          {/* Product Seeding Section */}
          <div
            className="card"
            style={{
              marginBottom: "24px",
              padding: "20px",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px dashed rgba(255, 255, 255, 0.1)",
              borderRadius: "12px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: formData.requiresProduct ? "16px" : "0",
              }}
            >
              <div>
                <h3
                  style={{
                    color: "var(--color-text-primary)",
                    fontSize: "16px",
                    fontWeight: 600,
                  }}
                >
                  Product Seeding (Barter / Logistics)
                </h3>
                <p
                  style={{
                    color: "var(--color-text-secondary)",
                    fontSize: "13px",
                    marginTop: "4px",
                  }}
                >
                  Do you need to ship a physical product to the influencer?
                </p>
              </div>
              <label className="switch" aria-label="Requires physical product seeding">
                <input
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
              <div style={{ marginTop: "16px" }}>
                <div className="grid-2" style={{ gap: "24px", marginBottom: "16px" }}>
                  <div className="form-group">
                    <label
                      className="label"
                      htmlFor="product-name"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Product Name
                    </label>
                    <input
                      id="product-name"
                      type="text"
                      className="input"
                      value={formData.productName}
                      onChange={(e) =>
                        setFormData({ ...formData, productName: e.target.value })
                      }
                      required={formData.requiresProduct}
                      placeholder="e.g. Glowing Skin Serum 50ml"
                      style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label
                      className="label"
                      htmlFor="product-value"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      Product Value (Rs)
                    </label>
                    <input
                      id="product-value"
                      type="number"
                      className="input"
                      value={formData.productValue}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          productValue: Number.parseInt(e.target.value, 10) || 0,
                        })
                      }
                      min={0}
                      placeholder="e.g. 1500"
                      style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                      }}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label
                    className="label"
                    htmlFor="product-description"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    Logistics / Shipping Instructions
                  </label>
                  <textarea
                    id="product-description"
                    className="input"
                    value={formData.productDescription}
                    onChange={(e) =>
                      setFormData({ ...formData, productDescription: e.target.value })
                    }
                    placeholder="Provide any details about the product and shipping timelines..."
                    style={{
                      minHeight: "80px",
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Deliverables */}
          <div className="form-group">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              <div className="label">Deliverables Required</div>
              <button
                type="button"
                onClick={handleAddDeliverable}
                style={{
                  fontSize: "13px",
                  color: "var(--color-primary)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                + Add Deliverable
              </button>
            </div>

            {formData.deliverables.map((item, index) => (
              <div
                key={`deliv-${item.type}-${index}`}
                style={{
                  display: "flex",
                  gap: "12px",
                  marginBottom: "8px",
                  alignItems: "center",
                }}
              >
                <select
                  className="input"
                  value={item.type}
                  onChange={(e) =>
                    handleDeliverableChange(index, "type", e.target.value)
                  }
                  style={{ flex: 2 }}
                >
                  {deliverableTypes.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  className="input"
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
                  style={{ width: "80px" }}
                />
                <span
                  style={{
                    fontSize: "14px",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  qty
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <input
                    type="number"
                    className="input"
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
                  <span style={{ fontSize: "10px", color: "rgba(255, 255, 255, 0.4)", whiteSpace: "nowrap" }}>
                    Rec: ₹{getRecommendedRate(item.type, formData.minFollowers).toLocaleString("en-IN")}
                  </span>
                </div>
                {formData.deliverables.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveDeliverable(index)}
                    style={{
                      color: "var(--color-accent-rose)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "18px",
                    }}
                  >
                    x
                  </button>
                )}
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: "32px",
              display: "flex",
              justifyContent: "flex-end",
              gap: "12px",
            }}
          >
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => router.back()}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={(e) => handleSubmit(e, true)}
              disabled={isLoading}
            >
              {isLoading ? <span className="loading" /> : "Save as Draft"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={(e) => handleSubmit(e, false)}
              disabled={isLoading}
            >
              {publishButtonContent}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

