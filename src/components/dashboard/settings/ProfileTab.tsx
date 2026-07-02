"use client";

import Link from "next/link";
import { useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { type NotificationPreferences } from "./NotificationPreferencesPanel";


export interface Profile {
    displayName: string;
    bio: string;
    profileImage?: string;
    website?: string;
    industry?: string;
    city?: string;
    state?: string;
    address?: string;
    pinCode?: string;
    gender?: string;
    age?: number | null;
    minRate: number;
    maxRate: number;
    minInstagramRate?: number;
    maxInstagramRate?: number;
    minYoutubeRate?: number;
    maxYoutubeRate?: number;
    instagramHandle?: string;
    instagramFollowers: number;
    instagramEngagementRate: number;
    youtubeHandle?: string;
    youtubeSubscribers?: number;
    youtubeEngagementRate?: number;
    categories: string[];
    languages: string[];
}

export interface User {
    id: string;
    userType: string;
    referralCode?: string;
    name?: string;
    email?: string;
    phone?: string;
    emailVerified?: boolean;
    phoneVerified?: boolean;
    isTwoFactorEnabled?: boolean;
    notificationPreferences?: NotificationPreferences;
    lastLogin?: string;
}

interface ProfileTabProps {
    profile: Profile;
    setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
    user: User;
    referralCode: string;
    badgesCount: number;
    showToast: (message: string, type?: "success" | "error" | "info") => void;
}

const allCategories = [
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
];

const allLanguages = [
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
];

const allCities = [
    "Mumbai", "Delhi", "Bangalore", "Hyderabad", "Ahmedabad", "Chennai", "Kolkata", "Surat", "Pune", "Jaipur", "Lucknow", "Kanpur", "Nagpur", "Indore", "Thane", "Bhopal", "Visakhapatnam", "Pimpri-Chinchwad", "Patna", "Vadodara", "Ghaziabad", "Ludhiana", "Agra", "Nashik", "Faridabad", "Meerut", "Rajkot", "Kalyan-Dombivli", "Vasai-Virar", "Varanasi", "Srinagar", "Aurangabad", "Dhanbad", "Amritsar", "Navi Mumbai", "Allahabad", "Howrah", "Ranchi", "Gwalior", "Jabalpur", "Coimbatore", "Vijayawada", "Jodhpur", "Madurai", "Raipur", "Kota", "Guwahati", "Chandigarh", "Solapur", "Hubballi-Dharwad", "Mysore", "Tiruchirappalli", "Bareilly", "Aligarh", "Tiruppur", "Gurgaon", "Moradabad", "Jalandhar", "Bhubaneswar", "Salem", "Warangal", "Mira-Bhayandar", "Jalgaon", "Guntur", "Thiruvananthapuram", "Bhiwandi", "Saharanpur", "Gorakhpur", "Bikaner", "Amravati", "Noida", "Jamshedpur", "Bhilai", "Cuttack", "Firozabad", "Kochi", "Nellore", "Bhavnagar", "Dehradun", "Durgapur", "Asansol", "Rourkela", "Nanded", "Kolhapur", "Ajmer", "Akola", "Gulbarga", "Jamnagar", "Ujjain", "Loni", "Siliguri", "Jhansi", "Ulhasnagar", "Jammu", "Sangli-Miraj & Kupwad", "Mangalore", "Erode", "Belgaum", "Ambattur", "Tirunelveli", "Malegaon", "Gaya", "Udaipur", "Maheshtala"
];

const allStates = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
    "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Lakshadweep", "Delhi", "Puducherry", "Ladakh", "Jammu and Kashmir"
];

export default function ProfileTab({
    profile,
    setProfile,
    user,
    referralCode,
    badgesCount,
    showToast,
}: ProfileTabProps) {
    const { update } = useSession();
    const [isUploading, setIsUploading] = useState(false);
    const profileImageInputRef = useRef<HTMLInputElement>(null);

    const [localCategories, setLocalCategories] = useState<string[]>(() => {
        return Array.from(new Set([...allCategories, ...(profile.categories || [])]));
    });
    const [localLanguages, setLocalLanguages] = useState<string[]>(() => {
        return Array.from(new Set([...allLanguages, ...(profile.languages || [])]));
    });
    const [customCategory, setCustomCategory] = useState("");
    const [customLanguage, setCustomLanguage] = useState("");

    const handleProfileImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Optimistic update: instantly render the selected image on the client side
        // using a temporary local Object URL to avoid visual lag while uploading.
        const objectUrl = URL.createObjectURL(file);
        setProfile((prev) => (prev ? { ...prev, profileImage: objectUrl } : null));
        setIsUploading(true);

        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", user?.userType === "BRAND" ? "logos" : "avatars");

        try {
            const res = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            });
            const data = await res.json();
            if (data.success) {
                setProfile((prev) =>
                    prev ? { ...prev, profileImage: data.url } : null,
                );
                // Auto-save only the updated profile image field (prevents redundant/noop write of all other profile fields)
                const saveRes = await fetch("/api/settings", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ profileImage: data.url }),
                });
                if (saveRes.ok) {
                    await update(); // Sync session to reflect new image URL on front-end
                    showToast("Profile picture updated!", "success");
                } else {
                    showToast("Failed to save profile picture to settings", "error");
                }
            } else {
                showToast("Upload failed: " + (data.error || "Unknown error"), "error");
            }
        } catch (error) {
            console.error("[profile-tab] Failed to upload avatar:", error);
            showToast("Upload failed", "error");
        } finally {
            setIsUploading(false);
            if (profileImageInputRef.current) profileImageInputRef.current.value = "";
        }
    };

    const toggleCategory = (category: string) => {
        if (profile.categories.includes(category)) {
            setProfile({
                ...profile,
                categories: profile.categories.filter((c: string) => c !== category),
            });
        } else if (profile.categories.length < 5) {
            setProfile({
                ...profile,
                categories: [...profile.categories, category],
            });
        }
    };

    const toggleLanguage = (language: string) => {
        if (profile.languages.includes(language)) {
            setProfile({
                ...profile,
                languages: profile.languages.filter((l: string) => l !== language),
            });
        } else {
            setProfile({
                ...profile,
                languages: [...profile.languages, language],
            });
        }
    };

    return (
        <div className="grid-2">
            <div className="card">
                <div
                    style={{
                        display: "inline-block",
                        padding: "4px 12px",
                        borderRadius: "20px",
                        background:
                            user.userType === "INFLUENCER"
                                ? "var(--color-primary)"
                                : user.userType === "BRAND"
                                    ? "#ec4899"
                                    : "#14b8a6",
                        color: "white",
                        fontSize: "11px",
                        fontWeight: "800",
                        marginBottom: "16px",
                        letterSpacing: "1px",
                    }}
                >
                    {user.userType} PROFILE
                </div>

                <div
                    style={{
                        display: "flex",
                        justifyContent: "center",
                        marginBottom: "24px",
                    }}
                >
                    <div
                        style={{ position: "relative", cursor: "pointer" }}
                        onClick={() => profileImageInputRef.current?.click()}
                    >
                        <div
                            style={{
                                width: "100px",
                                height: "100px",
                                borderRadius: "50%",
                                overflow: "hidden",
                                border: "4px solid var(--color-bg-tertiary)",
                                background: "#f0f0f0",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                position: "relative",
                            }}
                        >
                            {profile.profileImage ? (
                                <img
                                    src={profile.profileImage}
                                    alt="Profile"
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "cover",
                                    }}
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = "none";
                                        (
                                            e.target as HTMLImageElement
                                        ).parentElement!.innerText =
                                            user.userType === "BRAND" ? "🏢" : "👤";
                                    }}
                                />
                            ) : (
                                <div style={{ fontSize: "40px" }}>
                                    {user.userType === "BRAND" ? "🏢" : "👤"}
                                </div>
                            )}

                            {isUploading && (
                                <div
                                    style={{
                                        position: "absolute",
                                        inset: 0,
                                        background: "rgba(0,0,0,0.5)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                    }}
                                >
                                    <span
                                        className="loading"
                                        style={{ width: "20px", height: "20px" }}
                                    ></span>
                                </div>
                            )}
                        </div>
                        <div
                            style={{
                                position: "absolute",
                                bottom: "0",
                                right: "0",
                                background: "var(--color-primary)",
                                color: "white",
                                borderRadius: "50%",
                                width: "32px",
                                height: "32px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "14px",
                                border: "2px solid var(--color-bg-primary)",
                            }}
                        >
                            📸
                        </div>
                    </div>
                    <input
                        type="file"
                        ref={profileImageInputRef}
                        style={{ display: "none" }}
                        accept="image/*"
                        onChange={handleProfileImageUpload}
                    />
                </div>

                <h3
                    style={{
                        fontSize: "16px",
                        fontWeight: 700,
                        marginBottom: "20px",
                    }}
                >
                    Basic Information
                </h3>

                <div
                    style={{
                        padding: "16px",
                        background: "var(--color-bg-tertiary)",
                        borderRadius: "var(--radius-md)",
                        marginBottom: "24px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
                    <div>
                        <div
                            style={{
                                fontSize: "12px",
                                color: "var(--color-text-secondary)",
                                textTransform: "uppercase",
                                letterSpacing: "1px",
                            }}
                        >
                            Your Referral Code
                        </div>
                        <div
                            style={{
                                fontSize: "20px",
                                fontWeight: 800,
                                fontFamily: "monospace",
                            }}
                        >
                            {referralCode || "..."}
                        </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                        <div
                            style={{
                                fontSize: "12px",
                                color: "var(--color-text-secondary)",
                                textTransform: "uppercase",
                                letterSpacing: "1px",
                            }}
                        >
                            Badges Earned
                        </div>
                        <div style={{ fontSize: "20px", fontWeight: 800 }}>
                            {badgesCount} 🎖️
                        </div>
                        <div style={{ fontSize: "11px" }}>
                            <Link
                                href="/dashboard/badges"
                                style={{ color: "var(--color-primary)" }}
                            >
                                View All
                            </Link>
                        </div>
                    </div>
                </div>

                <div style={{ marginBottom: "20px" }}>
                    <label className="label">
                        {user.userType === "BRAND" ? "Company Name" : "Display Name"}
                    </label>
                    <input
                        type="text"
                        className="input"
                        value={profile.displayName}
                        onChange={(e) =>
                            setProfile({ ...profile, displayName: e.target.value })
                        }
                    />
                </div>

                <div style={{ marginBottom: "20px" }}>
                    <label className="label">
                        {user.userType === "BRAND" ? "Description" : "Bio"}
                    </label>
                    <textarea
                        className="input"
                        rows={4}
                        placeholder={
                            user.userType === "BRAND"
                                ? "Tell influencers about your brand..."
                                : "Tell brands about yourself..."
                        }
                        value={profile.bio}
                        onChange={(e) =>
                            setProfile({ ...profile, bio: e.target.value })
                        }
                        style={{ resize: "vertical" }}
                    />
                    <p
                        style={{
                            fontSize: "12px",
                            color: "var(--color-text-muted)",
                            marginTop: "4px",
                        }}
                    >
                        {profile.bio.length}/{user.userType === "BRAND" ? 1000 : 300}{" "}
                        characters
                    </p>
                </div>

                {user.userType === "BRAND" && (
                    <div
                        className="grid-2"
                        style={{ gap: "16px", marginBottom: "20px" }}
                    >
                        <div>
                            <label className="label">Website</label>
                            <input
                                type="url"
                                className="input"
                                placeholder="https://example.com"
                                value={profile.website || ""}
                                onChange={(e) =>
                                    setProfile({ ...profile, website: e.target.value })
                                }
                            />
                        </div>
                        <div>
                            <label className="label">Industry</label>
                            <input
                                type="text"
                                className="input"
                                placeholder="e.g. Fashion, Tech"
                                value={profile.industry || ""}
                                onChange={(e) =>
                                    setProfile({ ...profile, industry: e.target.value })
                                }
                            />
                        </div>
                    </div>
                )}

                <div className="grid-2" style={{ gap: "16px" }}>
                    <div>
                        <label className="label">City</label>
                        <input
                            type="text"
                            className="input"
                            list="city-options"
                            placeholder="Enter or select city"
                            value={profile.city || ""}
                            onChange={(e) =>
                                setProfile({ ...profile, city: e.target.value })
                            }
                        />
                        <datalist id="city-options">
                            {allCities.map((city) => (
                                <option key={city} value={city} />
                            ))}
                        </datalist>
                    </div>
                    <div>
                        <label className="label">State</label>
                        <select
                            className="input"
                            value={profile.state || ""}
                            onChange={(e) =>
                                setProfile({ ...profile, state: e.target.value })
                            }
                        >
                            <option value="">Select state</option>
                            {allStates.map((state) => (
                                <option key={state} value={state}>
                                    {state}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div
                    className="grid-2"
                    style={{ gap: "16px", marginTop: "16px" }}
                >
                    <div>
                        <label className="label">Address</label>
                        <input
                            type="text"
                            className="input"
                            placeholder="Street Address or Area"
                            value={profile.address || ""}
                            onChange={(e) =>
                                setProfile({ ...profile, address: e.target.value })
                            }
                        />
                    </div>
                    <div>
                        <label className="label">Pin Code</label>
                        <input
                            type="text"
                            className="input"
                            placeholder="e.g. 400001"
                            value={profile.pinCode || ""}
                            onChange={(e) =>
                                setProfile({ ...profile, pinCode: e.target.value })
                            }
                        />
                    </div>
                </div>

                {user.userType === "INFLUENCER" && (
                    <div className="grid-2" style={{ gap: "16px", marginTop: "16px" }}>
                        <div>
                            <label className="label">Gender</label>
                            <select
                                className="input"
                                value={profile.gender || ""}
                                onChange={(e) =>
                                    setProfile({ ...profile, gender: e.target.value })
                                }
                            >
                                <option value="">Select Gender</option>
                                <option value="MALE">Male</option>
                                <option value="FEMALE">Female</option>
                                <option value="OTHER">Other</option>
                            </select>
                        </div>
                        <div>
                            <label className="label">Age</label>
                            <input
                                type="number"
                                className="input"
                                placeholder="e.g. 25"
                                value={profile.age ?? ""}
                                onChange={(e) =>
                                    setProfile({ ...profile, age: e.target.value ? parseInt(e.target.value) : null })
                                }
                            />
                        </div>
                    </div>
                )}
            </div>

            {user.userType === "INFLUENCER" && (
                <div className="card">
                    <h3
                        style={{
                            fontSize: "16px",
                            fontWeight: 700,
                            marginBottom: "20px",
                        }}
                    >
                        Categories & Languages
                    </h3>

                    <div style={{ marginBottom: "20px" }}>
                        <label className="label">Categories (Select up to 5)</label>
                        <div
                            style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "8px",
                            }}
                        >
                            {localCategories.map((category) => (
                                <button
                                    key={category}
                                    type="button"
                                    onClick={() => toggleCategory(category)}
                                    className="badge"
                                    style={{
                                        cursor: "pointer",
                                        background: profile.categories.includes(category)
                                            ? "var(--color-primary)"
                                            : "var(--color-bg-tertiary)",
                                        color: profile.categories.includes(category)
                                            ? "white"
                                            : "var(--color-text-secondary)",
                                        border: "none",
                                        padding: "8px 12px",
                                    }}
                                >
                                    {category}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ marginBottom: "20px", display: "flex", gap: "8px", alignItems: "center" }}>
                        <input
                            type="text"
                            className="input"
                            placeholder="Add custom category..."
                            value={customCategory}
                            onChange={(e) => setCustomCategory(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (customCategory.trim() && !localCategories.includes(customCategory.trim())) {
                                        setLocalCategories(prev => [...prev, customCategory.trim()]);
                                        toggleCategory(customCategory.trim());
                                        setCustomCategory("");
                                    }
                                }
                            }}
                            style={{ maxWidth: "200px" }}
                        />
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                                if (customCategory.trim() && !localCategories.includes(customCategory.trim())) {
                                    setLocalCategories(prev => [...prev, customCategory.trim()]);
                                    toggleCategory(customCategory.trim());
                                    setCustomCategory("");
                                }
                            }}
                        >
                            Add
                        </button>
                    </div>

                    <div>
                        <label className="label">Languages</label>
                        <div
                            style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "8px",
                            }}
                        >
                            {localLanguages.map((language) => (
                                <button
                                    key={language}
                                    type="button"
                                    onClick={() => toggleLanguage(language)}
                                    className="badge"
                                    style={{
                                        cursor: "pointer",
                                        background: profile.languages.includes(language)
                                            ? "var(--color-primary)"
                                            : "var(--color-bg-tertiary)",
                                        color: profile.languages.includes(language)
                                            ? "white"
                                            : "var(--color-text-secondary)",
                                        border: "none",
                                        padding: "8px 12px",
                                    }}
                                >
                                    {language}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ marginTop: "12px", display: "flex", gap: "8px", alignItems: "center" }}>
                        <input
                            type="text"
                            className="input"
                            placeholder="Add custom language..."
                            value={customLanguage}
                            onChange={(e) => setCustomLanguage(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (customLanguage.trim() && !localLanguages.includes(customLanguage.trim())) {
                                        setLocalLanguages(prev => [...prev, customLanguage.trim()]);
                                        toggleLanguage(customLanguage.trim());
                                        setCustomLanguage("");
                                    }
                                }
                            }}
                            style={{ maxWidth: "200px" }}
                        />
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                                if (customLanguage.trim() && !localLanguages.includes(customLanguage.trim())) {
                                    setLocalLanguages(prev => [...prev, customLanguage.trim()]);
                                    toggleLanguage(customLanguage.trim());
                                    setCustomLanguage("");
                                }
                            }}
                        >
                            Add
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
