"use client";


import { logger } from "@/lib/logger-client";
import Link from "next/link";
import { useState, useRef } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { type NotificationPreferences } from "./NotificationPreferencesPanel";
import { isBrand, isInfluencer } from "@/lib/rbac";
import { Button, Input, Select, Textarea } from "@/components/ui";


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

function getUserTypeColor(userType?: string): string {
    if (isInfluencer(userType)) return "var(--color-primary)";
    if (isBrand(userType)) return "#ec4899";
    return "#14b8a6";
}

export default function ProfileTab({
    profile,
    setProfile,
    user,
    referralCode,
    badgesCount,
    showToast,
}: Readonly<ProfileTabProps>) {
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
        formData.append("folder", isBrand(user?.userType) ? "logos" : "avatars");

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
            logger.error("[profile-tab] Failed to upload avatar:", error);
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
                    className="mb-4 rounded-2xl text-xs" style={{ display: "inline-block", padding: "4px 12px", background: getUserTypeColor(user.userType), color: "white", fontWeight: "800", letterSpacing: "1px" }}
                >
                    {user.userType} PROFILE
                </div>

                <div
                    className="flex justify-center mb-6"
                >
                    <button
                        type="button"
                        onClick={() => profileImageInputRef.current?.click()}
                        aria-label="Change profile image"
                        className="relative cursor-pointer border-none p-0" style={{ background: "none" }}
                    >
                        <div
                            className="overflow-hidden flex items-center justify-center relative rounded-full" style={{ width: "100px", height: "100px", border: "4px solid var(--color-bg-tertiary)", background: "#f0f0f0" }}
                        >
                            {profile.profileImage ? (
                                <Image
                                    src={profile.profileImage}
                                    alt="Profile"
                                    fill
                                    unoptimized
                                    className="object-cover"
                                />
                            ) : (
                                <div className="text-3xl">
                                    {isBrand(user.userType) ? "🏢" : "👤"}
                                </div>
                            )}

                            {isUploading && (
                                <div
                                    className="absolute flex items-center justify-center" style={{ inset: 0, background: "rgba(0,0,0,0.5)" }}
                                >
                                    <span
                                        className="loading"
                                        style={{ width: "20px", height: "20px" }}
                                    ></span>
                                </div>
                            )}
                        </div>
                        <div
                            className="absolute flex items-center justify-center text-sm rounded-full" style={{ bottom: "0", right: "0", background: "var(--color-primary)", color: "white", width: "32px", height: "32px", border: "2px solid var(--color-bg-primary)" }}
                        >
                            📸
                        </div>
                    </button>
                    <input
                        type="file"
                        ref={profileImageInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={handleProfileImageUpload}
                    />
                </div>

                <h3
                    className="text-base font-bold mb-5"
                >
                    Basic Information
                </h3>

                <div
                    className="p-4 mb-6 flex justify-between items-center bg-tertiary rounded-md"
                >
                    <div>
                        <div
                            className="text-xs text-secondary uppercase" style={{ letterSpacing: "1px" }}
                        >
                            Your Referral Code
                        </div>
                        <div
                            className="text-xl font-extrabold" style={{ fontFamily: "monospace" }}
                        >
                            {referralCode || "..."}
                        </div>
                    </div>
                    <div className="text-right">
                        <div
                            className="text-xs text-secondary uppercase" style={{ letterSpacing: "1px" }}
                        >
                            Badges Earned
                        </div>
                        <div className="text-xl font-extrabold">
                            {badgesCount} 🎖️
                        </div>
                        <div className="text-xs">
                            <Link
                                href="/dashboard/badges"
                                className="text-primary"
                            >
                                View All
                            </Link>
                        </div>
                    </div>
                </div>

                <div className="mb-5">
                    <Input
                        label={isBrand(user.userType) ? "Company Name" : "Display Name"}
                        type="text"
                        value={profile.displayName}
                        onChange={(e) =>
                            setProfile({ ...profile, displayName: e.target.value })
                        }
                        fullWidth
                    />
                </div>

                <div className="mb-5">
                    <Textarea
                        label={isBrand(user.userType) ? "Description" : "Bio"}
                        rows={4}
                        placeholder={
                            isBrand(user.userType)
                                ? "Tell influencers about your brand..."
                                : "Tell brands about yourself..."
                        }
                        value={profile.bio}
                        onChange={(e) =>
                            setProfile({ ...profile, bio: e.target.value })
                        }
                        style={{ resize: "vertical" }}
                        fullWidth
                    />
                    <p
                        className="text-xs text-muted mt-1"
                    >
                        {profile.bio.length}/{isBrand(user.userType) ? 1000 : 300}{" "}
                        characters
                    </p>
                </div>

                {isBrand(user.userType) && (
                    <div
                        className="grid-2 gap-4 mb-5"
                    >
                        <Input
                            id="profile-website-input"
                            label="Website"
                            type="url"
                            placeholder="https://example.com"
                            value={profile.website || ""}
                            onChange={(e) =>
                                setProfile({ ...profile, website: e.target.value })
                            }
                            fullWidth
                        />
                        <Input
                            id="profile-industry-input"
                            label="Industry"
                            type="text"
                            placeholder="e.g. Fashion, Tech"
                            value={profile.industry || ""}
                            onChange={(e) =>
                                setProfile({ ...profile, industry: e.target.value })
                            }
                            fullWidth
                        />
                    </div>
                )}

                <div className="grid-2 gap-4">
                    <div>
                        <Input
                            id="profile-city-input"
                            label="City"
                            type="text"
                            list="city-options"
                            placeholder="Enter or select city"
                            value={profile.city || ""}
                            onChange={(e) =>
                                setProfile({ ...profile, city: e.target.value })
                            }
                            fullWidth
                        />
                        <datalist id="city-options">
                            {allCities.map((city) => (
                                <option key={city} value={city} />
                            ))}
                        </datalist>
                    </div>
                    <Select
                        id="profile-state-select"
                        label="State"
                        value={profile.state || ""}
                        onChange={(e) =>
                            setProfile({ ...profile, state: e.target.value })
                        }
                        fullWidth
                    >
                        <option value="">Select state</option>
                        {allStates.map((state) => (
                            <option key={state} value={state}>
                                {state}
                            </option>
                        ))}
                    </Select>
                </div>

                <div
                    className="grid-2 gap-4 mt-4"
                >
                    <Input
                        id="profile-address-input"
                        label="Address"
                        type="text"
                        placeholder="Street Address or Area"
                        value={profile.address || ""}
                        onChange={(e) =>
                            setProfile({ ...profile, address: e.target.value })
                        }
                        fullWidth
                    />
                    <Input
                        id="profile-pincode-input"
                        label="Pin Code"
                        type="text"
                        placeholder="e.g. 400001"
                        value={profile.pinCode || ""}
                        onChange={(e) =>
                            setProfile({ ...profile, pinCode: e.target.value })
                        }
                        fullWidth
                    />
                </div>

                {isInfluencer(user.userType) && (
                    <div className="grid-2 gap-4 mt-4">
                        <Select
                            id="profile-gender-select"
                            label="Gender"
                            value={profile.gender || ""}
                            onChange={(e) =>
                                setProfile({ ...profile, gender: e.target.value })
                            }
                            fullWidth
                        >
                            <option value="">Select Gender</option>
                            <option value="MALE">Male</option>
                            <option value="FEMALE">Female</option>
                            <option value="OTHER">Other</option>
                        </Select>
                        <Input
                            id="profile-age-input"
                            label="Age"
                            type="number"
                            placeholder="e.g. 25"
                            value={profile.age ?? ""}
                            onChange={(e) =>
                                setProfile({ ...profile, age: e.target.value ? Number.parseInt(e.target.value, 10) : null })
                            }
                            fullWidth
                        />
                    </div>
                )}
            </div>

            {isInfluencer(user.userType) && (
                <div className="card">
                    <h3
                        className="text-base font-bold mb-5"
                    >
                        Categories & Languages
                    </h3>

                    <div className="mb-5">
                        <div className="label">Categories (Select up to 5)</div>
                        <div
                            className="flex flex-wrap gap-2"
                        >
                            {localCategories.map((category) => (
                                <Button
                                    key={category}
                                    type="button"
                                    variant="ghost"
                                    onClick={() => toggleCategory(category)}
                                    className="badge cursor-pointer border-none" style={{ background: profile.categories.includes(category)
                                            ? "var(--color-primary)"
                                            : "var(--color-bg-tertiary)", color: profile.categories.includes(category)
                                            ? "white"
                                            : "var(--color-text-secondary)", padding: "8px 12px" }}
                                >
                                    {category}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <div className="mb-5 flex gap-2 items-center">
                        <Input
                            type="text"
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
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                                if (customCategory.trim() && !localCategories.includes(customCategory.trim())) {
                                    setLocalCategories(prev => [...prev, customCategory.trim()]);
                                    toggleCategory(customCategory.trim());
                                    setCustomCategory("");
                                }
                            }}
                        >
                            Add
                        </Button>
                    </div>

                    <div>
                        <div className="label">Languages</div>
                        <div
                            className="flex flex-wrap gap-2"
                        >
                            {localLanguages.map((language) => (
                                <Button
                                    key={language}
                                    type="button"
                                    variant="ghost"
                                    onClick={() => toggleLanguage(language)}
                                    className="badge cursor-pointer border-none" style={{ background: profile.languages.includes(language)
                                            ? "var(--color-primary)"
                                            : "var(--color-bg-tertiary)", color: profile.languages.includes(language)
                                            ? "white"
                                            : "var(--color-text-secondary)", padding: "8px 12px" }}
                                >
                                    {language}
                                </Button>
                            ))}
                        </div>
                    </div>

                    <div className="mt-3 flex gap-2 items-center">
                        <Input
                            type="text"
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
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                                if (customLanguage.trim() && !localLanguages.includes(customLanguage.trim())) {
                                    setLocalLanguages(prev => [...prev, customLanguage.trim()]);
                                    toggleLanguage(customLanguage.trim());
                                    setCustomLanguage("");
                                }
                            }}
                        >
                            Add
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
