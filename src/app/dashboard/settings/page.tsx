"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import IndiaTaxCompliancePanel from "@/components/dashboard/settings/IndiaTaxCompliancePanel";
import NotificationPreferencesPanel, {
    type NotificationPreferences,
} from "@/components/dashboard/settings/NotificationPreferencesPanel";

interface Profile {
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
    instagramHandle?: string;
    instagramFollowers: number;
    instagramEngagementRate: number;
    youtubeHandle?: string;
    youtubeSubscribers?: number;
    youtubeEngagementRate?: number;
    categories: string[];
    languages: string[];
}

interface User {
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

interface VerificationData {
    verificationLevel?: string;
    trustScore?: number;
    documents?: {
        id: string;
        type: string;
        status: string;
        rejectionReason?: string;
    }[];
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

export default function SettingsPage() {
    const { data: session, update } = useSession();
    const [activeTab, setActiveTab] = useState<string>("profile");
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [referralCode, setReferralCode] = useState("");
    const [badgesCount, setBadgesCount] = useState(0);
    const [user, setUser] = useState<User | null>(null);
    const [notificationPreferences, setNotificationPreferences] =
        useState<NotificationPreferences>({
            email: { marketing: true, updates: true, security: true },
            push: { marketing: true, updates: true, security: true },
        });

    useEffect(() => {
        fetch("/api/settings")
            .then((res) => res.json())
            .then((data) => {
                if (data.profile) {
                    // Set local arrays to ensure custom tags are visible
                    if (data.profile.categories) {
                        setLocalCategories(prev => Array.from(new Set([...prev, ...data.profile.categories])));
                    }
                    if (data.profile.languages) {
                        setLocalLanguages(prev => Array.from(new Set([...prev, ...data.profile.languages])));
                    }
                    setProfile({
                        ...data.profile,
                        // Ensure arrays are set for UI
                        categories: data.profile.categories || [],
                        languages: data.profile.languages || [],
                    });
                    setReferralCode(data.user?.referralCode || "");
                    setBadgesCount(data.badges?.length || 0);
                    setUser(data.user);
                    if (data.user?.notificationPreferences) {
                        setNotificationPreferences(data.user.notificationPreferences);
                    }
                }
                setLoading(false);
            })
            .catch((err) => {
                console.error(err);
                setLoading(false);
            });
    }, []);
    const [isSaving, setIsSaving] = useState(false);
    const [verificationData, setVerificationData] =
        useState<VerificationData | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const profileImageInputRef = useRef<HTMLInputElement>(null);
    const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);

    // Password Change State
    const [passwordData, setPasswordData] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
    });
    const [showPassword, setShowPassword] = useState({
        current: false,
        new: false,
        confirm: false,
    });
    const [passwordError, setPasswordError] = useState("");
    const [passwordSuccess, setPasswordSuccess] = useState("");

    // Forgot Password State
    const [forgotPasswordState, setForgotPasswordState] = useState<{ active: boolean, step: 'method' | 'otp' | 'new_password', method: 'email' | 'phone' | null, otp: string }>({ active: false, step: 'method', method: null, otp: '' });

    const [is2FAEnabled, setIs2FAEnabled] = useState(false);
    const [qrCodeData, setQrCodeData] = useState<{
        secret: string;
        qrCodeUrl: string;
    } | null>(null);
    const [setupCode, setSetupCode] = useState("");
    const [loginActivity, setLoginActivity] = useState<any[]>([]);
    const [showAllLogins, setShowAllLogins] = useState(false);
    const [is2FASetupVisible, setIs2FASetupVisible] = useState(false);
    const [disable2FAPassword, setDisable2FAPassword] = useState("");

    const [verifyContactState, setVerifyContactState] = useState<{ type: 'email' | 'phone' | null, step: 'idle' | 'input' | 'code' }>({ type: null, step: 'idle' });
    const [contactVerifyCode, setContactVerifyCode] = useState("");
    const [pendingContact, setPendingContact] = useState("");

    // Change Contact State
    const [changeContactState, setChangeContactState] = useState<{
        active: boolean;
        type: 'email' | 'phone' | null;
        step: 'idle' | 'verify-current' | 'enter-new' | 'verify-new';
        currentEmailOtp: string;
        currentPhoneOtp: string;
        newContact: string;
        newOtp: string;
    }>({ active: false, type: null, step: 'idle', currentEmailOtp: '', currentPhoneOtp: '', newContact: '', newOtp: '' });

    // Custom Categories and Languages
    const [localCategories, setLocalCategories] = useState(allCategories);
    const [localLanguages, setLocalLanguages] = useState(allLanguages);
    const [customCategory, setCustomCategory] = useState("");
    const [customLanguage, setCustomLanguage] = useState("");

    useEffect(() => {
        if (!user?.userType) return;

        const requestedTab = new URLSearchParams(window.location.search).get("tab");
        const allowedTabs = [
            "profile",
            "verification",
            "tax",
            "notifications",
            "security",
            ...(user.userType === "INFLUENCER" ? ["social", "rates"] : []),
        ];

        if (requestedTab && allowedTabs.includes(requestedTab)) {
            setActiveTab(requestedTab);
        }
    }, [user?.userType]);

    useEffect(() => {
        if (activeTab === "security") {
            fetch("/api/user/activity")
                .then((res) => res.json())
                .then((data) => {
                    if (data.activity) {
                        // Keep only the most recent login per device type
                        const uniqueDevices = new Map();
                        data.activity.forEach((login: any) => {
                            if (!uniqueDevices.has(login.device)) {
                                uniqueDevices.set(login.device, login);
                            }
                        });
                        setLoginActivity(Array.from(uniqueDevices.values()));
                    }
                })
                .catch(console.error);

            // Fetch user 2fa status via settings endpoint if available, but for now we pull it from session or separate call.
            // Assuming the settings endpoint was updated or we just fetch it via another route if we created it.
            // Wait, we can fetch settings again to ensure we have the latest.
            fetch("/api/settings")
                .then((res) => res.json())
                .then((data) => {
                    if (data.user) {
                        setIs2FAEnabled(!!data.user.isTwoFactorEnabled);
                    }
                });
        }
    }, [activeTab]);

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError("");
        setPasswordSuccess("");

        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setPasswordError("New passwords don't match");
            return;
        }

        if (passwordData.newPassword.length < 8) {
            setPasswordError("Password must be at least 8 characters");
            return;
        }

        setIsSaving(true);

        const body: any = {
            newPassword: passwordData.newPassword,
        };

        if (forgotPasswordState.active) {
            body.otpType = forgotPasswordState.method;
            body.otpCode = forgotPasswordState.otp;
        } else {
            body.oldPassword = passwordData.currentPassword;
        }

        try {
            const res = await fetch("/api/auth/change-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (res.ok) {
                setPasswordSuccess("Password updated successfully!");
                setPasswordData({
                    currentPassword: "",
                    newPassword: "",
                    confirmPassword: "",
                });
            } else {
                setPasswordError(data.error || "Failed to update password");
            }
        } catch (_error) {
            setPasswordError("An error occurred");
        } finally {
            setIsSaving(false);
            if (forgotPasswordState.active) {
                setForgotPasswordState({ active: false, step: 'method', method: null, otp: '' });
            }
        }
    };

    const handleSendForgotPasswordOtp = async (method: 'email' | 'phone') => {
        setIsSaving(true);
        setPasswordError("");
        setPasswordSuccess("");
        setForgotPasswordState(prev => ({ ...prev, method, active: true }));

        const contact = method === 'email' ? user?.email : user?.phone;

        if (!contact) {
            setPasswordError(`No ${method} associated with this account`);
            setIsSaving(false);
            return;
        }

        try {
            const res = await fetch("/api/user/send-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: method,
                    contact: contact
                }),
            });
            const data = await res.json();
            if (res.ok) {
                setForgotPasswordState(prev => ({ ...prev, method, step: 'otp', active: true }));
                setPasswordSuccess(`OTP sent to your ${method}`);
            } else {
                setPasswordError(data.error || "Failed to send OTP");
                setForgotPasswordState({ active: false, step: 'method', method: null, otp: '' });
            }
        } catch (_err) {
            setPasswordError("Network error. Please try again.");
            setForgotPasswordState({ active: false, step: 'method', method: null, otp: '' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleStartContactChange = async (type: 'email' | 'phone') => {
        if (!user?.email && !user?.phone) {
            alert("No available contact method to verify. Please contact support.");
            return;
        }
        setIsSaving(true);
        try {
            const res = await fetch("/api/user/change-contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "init" }),
            });
            const data = await res.json();
            if (res.ok) {
                setChangeContactState(prev => ({ ...prev, active: true, type, step: 'verify-current' }));
            } else {
                alert(data.error || "Failed to initiate contact change");
            }
        } catch (_e) {
            alert("Network error.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleVerifyCurrentContacts = async () => {
        if (user?.email && !changeContactState.currentEmailOtp) {
            alert("Please enter the Email OTP"); return;
        }
        if (user?.phone && !changeContactState.currentPhoneOtp) {
            alert("Please enter the Phone OTP"); return;
        }
        setIsSaving(true);
        try {
            const res = await fetch("/api/user/change-contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "verify-current",
                    currentEmailOtp: changeContactState.currentEmailOtp || undefined,
                    currentPhoneOtp: changeContactState.currentPhoneOtp || undefined
                }),
            });
            const data = await res.json();
            if (res.ok) {
                setChangeContactState(prev => ({ ...prev, step: 'enter-new' }));
            } else {
                alert(data.error || "Invalid OTP(s)");
            }
        } catch (_e) { alert("Network error"); } finally { setIsSaving(false); }
    };

    const handleSendNewContactOtp = async () => {
        if (!changeContactState.newContact) { alert(`Please enter your new ${changeContactState.type}`); return; }
        setIsSaving(true);
        try {
            const res = await fetch("/api/user/change-contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "send-new", type: changeContactState.type, newContact: changeContactState.newContact }),
            });
            const data = await res.json();
            if (res.ok) {
                setChangeContactState(prev => ({ ...prev, step: 'verify-new' }));
                alert(`OTP sent to new ${changeContactState.type}`);
            } else { alert(data.error || "Failed to send OTP"); }
        } catch (_e) { alert("Network error"); } finally { setIsSaving(false); }
    };

    const handleConfirmNewContact = async () => {
        if (!changeContactState.newOtp) { alert("Please enter the OTP"); return; }
        setIsSaving(true);
        try {
            const res = await fetch("/api/user/change-contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "confirm-new", type: changeContactState.type, newContact: changeContactState.newContact, newOtp: changeContactState.newOtp }),
            });
            const data = await res.json();
            if (res.ok) {
                alert(`${changeContactState.type} updated successfully!`);
                setChangeContactState({ active: false, type: null, step: 'idle', currentEmailOtp: '', currentPhoneOtp: '', newContact: '', newOtp: '' });
                window.location.reload(); // Refresh to reflect new session data
            } else { alert(data.error || "Invalid OTP"); }
        } catch (_e) { alert("Network error"); } finally { setIsSaving(false); }
    };

    const handleProfileImageUpload = async (
        e: React.ChangeEvent<HTMLInputElement>,
    ) => {
        if (!user) return;
        const file = e.target.files?.[0];
        if (!file) return;

        // Optimistic update
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
                // Auto-save the profile with the new image
                const saveRes = await fetch("/api/settings", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...profile, profileImage: data.url }),
                });
                if (saveRes.ok) {
                    await update();
                    alert("Profile picture updated!");
                } else {
                    alert("Failed to save profile picture to settings");
                }
            } else {
                alert("Upload failed: " + (data.error || "Unknown error"));
            }
        } catch (error) {
            console.error(error);
            alert("Upload failed");
        } finally {
            setIsUploading(false);
            if (profileImageInputRef.current) profileImageInputRef.current.value = "";
        }
    };

    useEffect(() => {
        if (activeTab === "verification" && !verificationData) {
            fetch("/api/verification")
                .then((res) => res.json())
                .then((data) => setVerificationData(data))
                .catch((err) => console.error(err));
        }
    }, [activeTab, verificationData]);

    const handleUpload = (type: string) => {
        setUploadingDocType(type);
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !uploadingDocType) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", uploadingDocType);

        try {
            const res = await fetch("/api/verification", {
                method: "POST",
                body: formData,
            });
            const data = await res.json();
            if (data.success) {
                alert("Document uploaded! Verification pending.");
                // Refresh data
                const refresh = await fetch("/api/verification");
                const newData = await refresh.json();
                setVerificationData(newData);
            } else {
                alert(data.error || "Upload failed");
            }
        } catch (error) {
            console.error(error);
            alert("An error occurred");
        } finally {
            setIsUploading(false);
            setUploadingDocType(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleNotificationToggle = (
        type: "email" | "push",
        category: "marketing" | "updates" | "security",
    ) => {
        setNotificationPreferences((prev) => ({
            ...prev,
            [type]: {
                ...prev[type],
                [category]: !prev[type][category],
            },
        }));
    };

    const saveNotificationPreferences = async () => {
        setIsSaving(true);
        try {
            const res = await fetch("/api/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ notificationPreferences }),
            });
            if (res.ok) {
                alert("Preferences saved successfully");
            } else {
                alert("Failed to save preferences");
            }
        } catch (error) {
            console.error(error);
            alert("An error occurred");
        } finally {
            setIsSaving(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch("/api/settings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(profile),
            });
            const data = await res.json();
            if (res.ok) {
                await update();
                alert("Profile saved successfully!");
            } else {
                alert(data.error || "Failed to save profile");
            }
        } catch (error) {
            console.error(error);
            alert("Failed to save profile");
        } finally {
            setIsSaving(false);
        }
    };

    const toggleCategory = (category: string) => {
        if (!profile) return;
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
        if (!profile) return;
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

    const verifySocial = async (platform: "instagram" | "youtube") => {
        if (!profile) return;
        const handle =
            platform === "instagram"
                ? profile.instagramHandle
                : profile.youtubeHandle;
        if (!handle) {
            alert(`Please enter your ${platform} handle first.`);
            return;
        }

        setIsSaving(true);
        try {
            const res = await fetch("/api/social/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ platform, handle }),
            });
            const data = await res.json();

            if (res.ok && data.success) {
                setProfile((prev) => {
                    if (!prev) return prev;
                    if (platform === "instagram") {
                        return {
                            ...prev,
                            instagramFollowers: data.followers,
                            instagramEngagementRate: data.engagementRate,
                        };
                    } else {
                        return {
                            ...prev,
                            youtubeSubscribers: data.followers,
                            youtubeEngagementRate: data.engagementRate,
                        };
                    }
                });
                alert(
                    `${platform.toUpperCase()} successfully verified! Stats linked in real.`,
                );
            } else {
                alert(
                    data.error ||
                    "Verification failed. Make sure the handle is public and correctly spelled.",
                );
            }
        } catch (error) {
            console.error(error);
            alert("Failed to verify social account.");
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) {
        return (
            <div
                style={{
                    display: "flex",
                    minHeight: "100vh",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <span className="loading" />
            </div>
        );
    }

    if (!profile || !user)
        return (
            <div style={{ padding: "40px", textAlign: "center" }}>
                Failed to load profile
            </div>
        );

    return (
        <DashboardShell user={session?.user || user}>
            {/* Header */}
            <div
                style={{
                    marginBottom: "24px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                }}
            >
                <div>
                    <h1 style={{ fontSize: "24px", fontWeight: 800 }}>Settings</h1>
                    <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
                        Manage your profile and preferences
                    </p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={handleSave}
                    disabled={isSaving}
                >
                    {isSaving ? <span className="loading" /> : "💾 Save Changes"}
                </button>
            </div>

            <div className="dashboard-settings-content">
                {/* Tabs */}
                <div
                    className="scrollable-tabs"
                    style={{
                        display: "flex",
                        gap: "8px",
                        marginBottom: "24px",
                        borderBottom: "1px solid var(--color-border)",
                        paddingBottom: "16px",
                    }}
                >
                    {[
                        { id: "profile", label: "👤 Profile" },
                        // Only show Social/Rates for Influencer
                        ...(user?.userType === "INFLUENCER"
                            ? [
                                { id: "social", label: "📱 Social Accounts" },
                                { id: "rates", label: "💰 Rates" },
                            ]
                            : []),
                        { id: "verification", label: "🛡️ Verification" },
                        { id: "tax", label: "Tax" },
                        { id: "notifications", label: "🔔 Notifications" },
                        { id: "security", label: "🔐 Security" },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`btn ${activeTab === tab.id ? "btn-primary" : "btn-ghost"}`}
                            style={{ whiteSpace: "nowrap" }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Profile Tab */}
                {activeTab === "profile" && (
                    <>
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
                                                        // Fallback on error
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
                                            value={profile.state}
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

                                {/* Demographics - Influencer Only */}
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
                                                value={profile.age || ""}
                                                onChange={(e) =>
                                                    setProfile({ ...profile, age: e.target.value ? parseInt(e.target.value) : null })
                                                }
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Categories & Languages - Influencer Only */}
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
                    </>
                )}

                {/* Social Tab */}
                {activeTab === "social" && (
                    <div className="grid-2">
                        <div className="card">
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                    marginBottom: "20px",
                                }}
                            >
                                <div
                                    style={{
                                        width: "48px",
                                        height: "48px",
                                        background:
                                            "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)",
                                        borderRadius: "var(--radius-md)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: "24px",
                                    }}
                                >
                                    📸
                                </div>
                                <div>
                                    <h3 style={{ fontSize: "16px", fontWeight: 700 }}>
                                        Instagram
                                    </h3>
                                    <p
                                        style={{
                                            fontSize: "12px",
                                            color: "var(--color-text-muted)",
                                        }}
                                    >
                                        {profile.instagramHandle ? "Connected" : "Not connected"}
                                    </p>
                                </div>
                            </div>

                            <div style={{ marginBottom: "16px" }}>
                                <label className="label">Instagram Handle</label>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="@yourusername"
                                    value={profile.instagramHandle}
                                    onChange={(e) =>
                                        setProfile({ ...profile, instagramHandle: e.target.value })
                                    }
                                />
                            </div>

                            {profile.instagramHandle && (
                                <div
                                    style={{
                                        padding: "16px",
                                        background: "var(--color-bg-tertiary)",
                                        borderRadius: "var(--radius-md)",
                                    }}
                                >
                                    <div
                                        className="grid-2"
                                        style={{ gap: "16px", marginBottom: "16px" }}
                                    >
                                        <div style={{ textAlign: "center" }}>
                                            <div style={{ fontSize: "24px", fontWeight: 800 }}>
                                                {(profile.instagramFollowers / 1000).toFixed(0)}K
                                            </div>
                                            <div
                                                style={{
                                                    fontSize: "12px",
                                                    color: "var(--color-text-muted)",
                                                }}
                                            >
                                                Followers
                                            </div>
                                        </div>
                                        <div style={{ textAlign: "center" }}>
                                            <div style={{ fontSize: "24px", fontWeight: 800 }}>
                                                {profile.instagramEngagementRate}%
                                            </div>
                                            <div
                                                style={{
                                                    fontSize: "12px",
                                                    color: "var(--color-text-muted)",
                                                }}
                                            >
                                                Engagement
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ width: "100%", fontSize: "12px", padding: "8px" }}
                                        onClick={() => verifySocial("instagram")}
                                    >
                                        Verify & Sync Stats
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="card">
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                    marginBottom: "20px",
                                }}
                            >
                                <div
                                    style={{
                                        width: "48px",
                                        height: "48px",
                                        background: "#FF0000",
                                        borderRadius: "var(--radius-md)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: "24px",
                                    }}
                                >
                                    ▶️
                                </div>
                                <div>
                                    <h3 style={{ fontSize: "16px", fontWeight: 700 }}>YouTube</h3>
                                    <p
                                        style={{
                                            fontSize: "12px",
                                            color: "var(--color-text-muted)",
                                        }}
                                    >
                                        {profile.youtubeHandle ? "Connected" : "Not connected"}
                                    </p>
                                </div>
                            </div>

                            <div style={{ marginBottom: "16px" }}>
                                <label className="label">YouTube Channel</label>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder="@yourchannel"
                                    value={profile.youtubeHandle}
                                    onChange={(e) =>
                                        setProfile({ ...profile, youtubeHandle: e.target.value })
                                    }
                                />
                            </div>

                            {profile.youtubeHandle ? (
                                <div
                                    style={{
                                        padding: "16px",
                                        background: "var(--color-bg-tertiary)",
                                        borderRadius: "var(--radius-md)",
                                    }}
                                >
                                    <div
                                        className="grid-2"
                                        style={{ gap: "16px", marginBottom: "16px" }}
                                    >
                                        <div style={{ textAlign: "center" }}>
                                            <div style={{ fontSize: "24px", fontWeight: 800 }}>
                                                {((profile.youtubeSubscribers || 0) / 1000).toFixed(0)}K
                                            </div>
                                            <div
                                                style={{
                                                    fontSize: "12px",
                                                    color: "var(--color-text-muted)",
                                                }}
                                            >
                                                Subscribers
                                            </div>
                                        </div>
                                        <div style={{ textAlign: "center" }}>
                                            <div style={{ fontSize: "24px", fontWeight: 800 }}>
                                                {profile.youtubeEngagementRate || 0}%
                                            </div>
                                            <div
                                                style={{
                                                    fontSize: "12px",
                                                    color: "var(--color-text-muted)",
                                                }}
                                            >
                                                Engagement
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        className="btn btn-secondary"
                                        style={{ width: "100%", fontSize: "12px", padding: "8px" }}
                                        onClick={() => verifySocial("youtube")}
                                    >
                                        Verify & Sync Stats
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    style={{ width: "100%" }}
                                    disabled
                                >
                                    Enter a handle to connect
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Rates Tab */}
                {activeTab === "rates" && (
                    <div className="card" style={{ maxWidth: "600px" }}>
                        <h3
                            style={{
                                fontSize: "16px",
                                fontWeight: 700,
                                marginBottom: "20px",
                            }}
                        >
                            Your Rate Card
                        </h3>
                        <p
                            style={{
                                fontSize: "14px",
                                color: "var(--color-text-secondary)",
                                marginBottom: "24px",
                            }}
                        >
                            Set your expected rates for brand collaborations. This helps match
                            you with the right campaigns.
                        </p>

                        <div
                            className="grid-2"
                            style={{ gap: "16px", marginBottom: "24px" }}
                        >
                            <div>
                                <label className="label">Minimum Rate (₹)</label>
                                <input
                                    type="number"
                                    className="input"
                                    placeholder="10000"
                                    value={profile.minRate / 100}
                                    onChange={(e) =>
                                        setProfile({
                                            ...profile,
                                            minRate: parseInt(e.target.value) * 100,
                                        })
                                    }
                                />
                            </div>
                            <div>
                                <label className="label">Maximum Rate (₹)</label>
                                <input
                                    type="number"
                                    className="input"
                                    placeholder="50000"
                                    value={profile.maxRate / 100}
                                    onChange={(e) =>
                                        setProfile({
                                            ...profile,
                                            maxRate: parseInt(e.target.value) * 100,
                                        })
                                    }
                                />
                            </div>
                        </div>

                        <div
                            style={{
                                padding: "16px",
                                background: "var(--color-bg-tertiary)",
                                borderRadius: "var(--radius-md)",
                            }}
                        >
                            <p
                                style={{
                                    fontSize: "14px",
                                    color: "var(--color-text-secondary)",
                                }}
                            >
                                💡 <strong>Tip:</strong> Based on your followers (
                                {(profile.instagramFollowers / 1000).toFixed(0)}K), similar
                                creators charge ₹8,000 - ₹35,000 per post/reel.
                            </p>
                        </div>
                    </div>
                )}

                {/* Verification Tab - Tiered System */}
                {activeTab === "verification" && (
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "24px",
                            maxWidth: "900px",
                        }}
                    >
                        {!verificationData ? (
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "center",
                                    padding: "60px",
                                }}
                            >
                                <span
                                    className="loading"
                                    style={{ width: "32px", height: "32px" }}
                                />
                            </div>
                        ) : (
                            (() => {
                                const docs = verificationData.documents || [];
                                const tier: number = (verificationData as any).tier ?? 0;
                                const tierLimit: number | null =
                                    (verificationData as any).tierLimit ?? null;
                                const tierDesc: string =
                                    (verificationData as any).tierDescription || "";
                                const emailVerified: boolean = !!(verificationData as any)
                                    .emailVerified;
                                const phoneVerified: boolean = !!(verificationData as any)
                                    .phoneVerified;
                                const roleType: string =
                                    (verificationData as any).userType ||
                                    user?.userType ||
                                    "INFLUENCER";
                                const isBrand = roleType === "BRAND";

                                const getDocStatus = (type: string) =>
                                    docs.find((d: any) => d.type === type) as any;
                                const tierColors = ["#6b7280", "#6366f1", "#f59e0b", "#10b981"];
                                // For influencer: Tier 2 = unlimited (tierLimit null); for brand: Tier 3 = unlimited
                                const isUnlimited = tierLimit === null;

                                const StatusBadge = ({ type }: { type: string }) => {
                                    const doc = getDocStatus(type);
                                    if (!doc)
                                        return (
                                            <span
                                                style={{
                                                    fontSize: "11px",
                                                    color: "var(--color-text-muted)",
                                                    background: "var(--color-bg-tertiary)",
                                                    padding: "2px 8px",
                                                    borderRadius: "20px",
                                                }}
                                            >
                                                Not uploaded
                                            </span>
                                        );
                                    const colors: Record<string, string> = {
                                        VERIFIED: "#10b981",
                                        PENDING: "#f59e0b",
                                        REJECTED: "#ef4444",
                                    };
                                    const icons: Record<string, string> = {
                                        VERIFIED: "✅",
                                        PENDING: "⏳",
                                        REJECTED: "❌",
                                    };
                                    return (
                                        <span
                                            style={{
                                                fontSize: "11px",
                                                color: colors[doc.status] || "#999",
                                                background: `${colors[doc.status]}18`,
                                                padding: "2px 8px",
                                                borderRadius: "20px",
                                                fontWeight: 600,
                                            }}
                                        >
                                            {icons[doc.status]} {doc.status}
                                        </span>
                                    );
                                };

                                const UploadBtn = ({ type }: { type: string }) => {
                                    const doc = getDocStatus(type);
                                    if (doc?.status === "VERIFIED") return null;
                                    return (
                                        <button
                                            className="btn btn-sm btn-secondary"
                                            onClick={() => handleUpload(type)}
                                            disabled={isUploading}
                                            style={{ fontSize: "12px", padding: "4px 10px" }}
                                        >
                                            {isUploading && uploadingDocType === type
                                                ? "⏳"
                                                : doc
                                                    ? "↑ Re-upload"
                                                    : "↑ Upload"}
                                        </button>
                                    );
                                };

                                const DocRow = ({
                                    type,
                                    label,
                                    icon,
                                    desc,
                                }: {
                                    type: string;
                                    label: string;
                                    icon: string;
                                    desc: string;
                                }) => {
                                    const doc = getDocStatus(type);
                                    return (
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                padding: "12px 16px",
                                                background:
                                                    doc?.status === "VERIFIED"
                                                        ? "rgba(16,185,129,0.07)"
                                                        : "var(--color-bg-tertiary)",
                                                borderRadius: "var(--radius-md)",
                                                border: `1px solid ${doc?.status === "REJECTED" ? "rgba(239,68,68,0.3)" : doc?.status === "VERIFIED" ? "rgba(16,185,129,0.3)" : "var(--color-border)"}`,
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "10px",
                                                }}
                                            >
                                                <span style={{ fontSize: "18px" }}>{icon}</span>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: "14px" }}>
                                                        {label}
                                                    </div>
                                                    <div
                                                        style={{
                                                            fontSize: "11px",
                                                            color: "var(--color-text-muted)",
                                                        }}
                                                    >
                                                        {desc}
                                                    </div>
                                                    {doc?.status === "REJECTED" &&
                                                        doc.rejectionReason && (
                                                            <div
                                                                style={{
                                                                    fontSize: "11px",
                                                                    color: "#ef4444",
                                                                    marginTop: "4px",
                                                                }}
                                                            >
                                                                ❌ Rejected: {doc.rejectionReason}
                                                            </div>
                                                        )}
                                                </div>
                                            </div>
                                            <div
                                                style={{
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    alignItems: "flex-end",
                                                    gap: "6px",
                                                }}
                                            >
                                                <StatusBadge type={type} />
                                                <UploadBtn type={type} />
                                            </div>
                                        </div>
                                    );
                                };

                                return (
                                    <>
                                        {/* Current Tier Status Card */}
                                        <div
                                            className="card"
                                            style={{
                                                background: `linear-gradient(135deg, ${tierColors[tier]}12, var(--color-bg-secondary))`,
                                                border: `1px solid ${tierColors[tier]}30`,
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    alignItems: "flex-start",
                                                    flexWrap: "wrap",
                                                    gap: "16px",
                                                }}
                                            >
                                                <div>
                                                    <div
                                                        style={{
                                                            fontSize: "11px",
                                                            fontWeight: 700,
                                                            letterSpacing: "1px",
                                                            color: tierColors[tier],
                                                            marginBottom: "6px",
                                                            textTransform: "uppercase",
                                                        }}
                                                    >
                                                        Your Verification Tier
                                                    </div>
                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: "12px",
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                width: "52px",
                                                                height: "52px",
                                                                borderRadius: "50%",
                                                                background: `linear-gradient(135deg, ${tierColors[tier]}, ${tierColors[tier]}88)`,
                                                                display: "flex",
                                                                alignItems: "center",
                                                                justifyContent: "center",
                                                                fontSize: "22px",
                                                                color: "white",
                                                            }}
                                                        >
                                                            {tier === 0
                                                                ? "🔒"
                                                                : tier === 1
                                                                    ? "🥉"
                                                                    : tier === 2
                                                                        ? "🥈"
                                                                        : "🥇"}
                                                        </div>
                                                        <div>
                                                            <div
                                                                style={{
                                                                    fontSize: "20px",
                                                                    fontWeight: 800,
                                                                    color: tierColors[tier],
                                                                }}
                                                            >
                                                                Tier {tier} —{" "}
                                                                {
                                                                    ["Locked", "Basic", "Standard", "Premium"][
                                                                    tier
                                                                    ]
                                                                }
                                                            </div>
                                                            <div
                                                                style={{
                                                                    fontSize: "13px",
                                                                    color: "var(--color-text-secondary)",
                                                                    marginTop: "2px",
                                                                }}
                                                            >
                                                                {tierDesc}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: "right" }}>
                                                    <div
                                                        style={{
                                                            fontSize: "11px",
                                                            color: "var(--color-text-muted)",
                                                            marginBottom: "4px",
                                                            textTransform: "uppercase",
                                                            letterSpacing: "1px",
                                                        }}
                                                    >
                                                        Monthly Limit
                                                    </div>
                                                    <div
                                                        style={{
                                                            fontSize: "26px",
                                                            fontWeight: 900,
                                                            color: isUnlimited
                                                                ? "#10b981"
                                                                : "var(--color-text-primary)",
                                                        }}
                                                    >
                                                        {isUnlimited
                                                            ? "∞ Unlimited"
                                                            : tier === 0
                                                                ? "Locked"
                                                                : tierLimit
                                                                    ? `₹${(tierLimit / 100).toLocaleString("en-IN")}`
                                                                    : "—"}
                                                    </div>
                                                    <div
                                                        style={{
                                                            fontSize: "11px",
                                                            color: "var(--color-text-muted)",
                                                            marginTop: "2px",
                                                        }}
                                                    >
                                                        per month
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ marginTop: "16px" }}>
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        justifyContent: "space-between",
                                                        marginBottom: "5px",
                                                    }}
                                                >
                                                    <span
                                                        style={{
                                                            fontSize: "12px",
                                                            color: "var(--color-text-secondary)",
                                                        }}
                                                    >
                                                        Trust Score
                                                    </span>
                                                    <span style={{ fontSize: "12px", fontWeight: 700 }}>
                                                        {Math.min(verificationData.trustScore || 50, 100)}
                                                        /100
                                                    </span>
                                                </div>
                                                <div
                                                    style={{
                                                        height: "6px",
                                                        background: "var(--color-bg-tertiary)",
                                                        borderRadius: "999px",
                                                        overflow: "hidden",
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            width: `${Math.min(verificationData.trustScore || 50, 100)}%`,
                                                            height: "100%",
                                                            background: `linear-gradient(90deg, ${tierColors[tier]}, #10b981)`,
                                                            borderRadius: "999px",
                                                            transition: "width 0.6s",
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Step 0: Email + Phone — MANDATORY */}
                                        <div className="card">
                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "10px",
                                                    marginBottom: "14px",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: "30px",
                                                        height: "30px",
                                                        borderRadius: "50%",
                                                        background: "rgba(99,102,241,0.12)",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                    }}
                                                >
                                                    🔑
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 700 }}>
                                                        Step 1 — Mandatory for ALL campaigns
                                                    </div>
                                                    <div
                                                        style={{
                                                            fontSize: "12px",
                                                            color: "var(--color-text-secondary)",
                                                        }}
                                                    >
                                                        Required before creating or applying to any campaign
                                                    </div>
                                                </div>
                                            </div>
                                            <div
                                                style={{
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    gap: "10px",
                                                }}
                                            >
                                                {[
                                                    {
                                                        label: "Email Address",
                                                        icon: "📧",
                                                        verified: emailVerified,
                                                    },
                                                    {
                                                        label: "Phone Number",
                                                        icon: "📱",
                                                        verified: phoneVerified,
                                                    },
                                                ].map((item, i) => (
                                                    <div
                                                        key={i}
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "space-between",
                                                            padding: "12px 16px",
                                                            background: item.verified
                                                                ? "rgba(16,185,129,0.07)"
                                                                : "var(--color-bg-tertiary)",
                                                            borderRadius: "var(--radius-md)",
                                                            border: `1px solid ${item.verified ? "rgba(16,185,129,0.3)" : "var(--color-border)"}`,
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                display: "flex",
                                                                alignItems: "center",
                                                                gap: "10px",
                                                            }}
                                                        >
                                                            <span style={{ fontSize: "18px" }}>
                                                                {item.icon}
                                                            </span>
                                                            <div>
                                                                <div
                                                                    style={{ fontWeight: 600, fontSize: "14px" }}
                                                                >
                                                                    {item.label}
                                                                </div>
                                                                <div
                                                                    style={{
                                                                        fontSize: "11px",
                                                                        color: "var(--color-text-muted)",
                                                                    }}
                                                                >
                                                                    {item.verified
                                                                        ? "Verified ✓"
                                                                        : "Verify via Settings → Security"}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {item.verified ? (
                                                            <span
                                                                style={{
                                                                    color: "#10b981",
                                                                    fontSize: "18px",
                                                                    fontWeight: 700,
                                                                }}
                                                            >
                                                                ✓
                                                            </span>
                                                        ) : (
                                                            <span
                                                                style={{
                                                                    fontSize: "12px",
                                                                    color: "#f59e0b",
                                                                    fontWeight: 600,
                                                                    padding: "4px 10px",
                                                                    background: "rgba(245,158,11,0.1)",
                                                                    borderRadius: "20px",
                                                                }}
                                                            >
                                                                ⚠ Pending
                                                            </span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Tier 1 */}
                                        <div
                                            className="card"
                                            style={{
                                                border:
                                                    tier >= 1
                                                        ? "1px solid rgba(99,102,241,0.35)"
                                                        : "1px solid var(--color-border)",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "space-between",
                                                    marginBottom: "14px",
                                                    flexWrap: "wrap",
                                                    gap: "10px",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: "10px",
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            width: "30px",
                                                            height: "30px",
                                                            borderRadius: "50%",
                                                            background: "rgba(99,102,241,0.12)",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                        }}
                                                    >
                                                        🪪
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 700 }}>
                                                            Tier 1 — Basic Identity{" "}
                                                            <span
                                                                style={{
                                                                    fontWeight: 400,
                                                                    color: "var(--color-text-secondary)",
                                                                }}
                                                            >
                                                                (up to ₹50,000/month)
                                                            </span>
                                                        </div>
                                                        <div
                                                            style={{
                                                                fontSize: "12px",
                                                                color: "var(--color-text-secondary)",
                                                            }}
                                                        >
                                                            Aadhaar + Selfie verification
                                                        </div>
                                                    </div>
                                                </div>
                                                {tier >= 1 ? (
                                                    <span
                                                        style={{
                                                            fontSize: "11px",
                                                            color: "#10b981",
                                                            fontWeight: 700,
                                                            padding: "3px 10px",
                                                            background: "rgba(16,185,129,0.1)",
                                                            borderRadius: "20px",
                                                        }}
                                                    >
                                                        ✅ Unlocked
                                                    </span>
                                                ) : (
                                                    <span
                                                        style={{
                                                            fontSize: "11px",
                                                            color: "#6366f1",
                                                            fontWeight: 700,
                                                            padding: "3px 10px",
                                                            background: "rgba(99,102,241,0.1)",
                                                            borderRadius: "20px",
                                                        }}
                                                    >
                                                        🔒 Required to start
                                                    </span>
                                                )}
                                            </div>
                                            <div
                                                style={{
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    gap: "10px",
                                                }}
                                            >
                                                <DocRow
                                                    type="AADHAAR"
                                                    label="Aadhaar Card"
                                                    icon="🪪"
                                                    desc="Front & back photo of your Aadhaar (address proof)"
                                                />
                                                <DocRow
                                                    type="SELFIE"
                                                    label="Selfie with Aadhaar"
                                                    icon="🤳"
                                                    desc="Clear selfie holding your Aadhaar card (liveness check)"
                                                />
                                            </div>
                                        </div>

                                        {/* Tier 2 */}
                                        <div
                                            className="card"
                                            style={{
                                                border:
                                                    tier >= 2
                                                        ? "1px solid rgba(245,158,11,0.35)"
                                                        : "1px solid var(--color-border)",
                                                opacity: tier < 1 ? 0.55 : 1,
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "space-between",
                                                    marginBottom: "14px",
                                                    flexWrap: "wrap",
                                                    gap: "10px",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: "10px",
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            width: "30px",
                                                            height: "30px",
                                                            borderRadius: "50%",
                                                            background: "rgba(245,158,11,0.12)",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                        }}
                                                    >
                                                        🏦
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 700 }}>
                                                            Tier 2 — Financial Identity{" "}
                                                            <span
                                                                style={{
                                                                    fontWeight: 400,
                                                                    color: "var(--color-text-secondary)",
                                                                }}
                                                            >
                                                                {isBrand
                                                                    ? "(up to ₹1,00,000/month)"
                                                                    : "(Unlimited — for Influencers)"}
                                                            </span>
                                                        </div>
                                                        <div
                                                            style={{
                                                                fontSize: "12px",
                                                                color: "var(--color-text-secondary)",
                                                            }}
                                                        >
                                                            PAN Card + Bank Statement
                                                            {!isBrand ? " — unlocks unlimited campaigns" : ""}
                                                        </div>
                                                    </div>
                                                </div>
                                                {tier >= 2 ? (
                                                    <span
                                                        style={{
                                                            fontSize: "11px",
                                                            color: "#10b981",
                                                            fontWeight: 700,
                                                            padding: "3px 10px",
                                                            background: "rgba(16,185,129,0.1)",
                                                            borderRadius: "20px",
                                                        }}
                                                    >
                                                        ✅{" "}
                                                        {isBrand ? "Unlocked" : "Unlimited — All campaigns"}
                                                    </span>
                                                ) : (
                                                    <span
                                                        style={{
                                                            fontSize: "11px",
                                                            color: "#f59e0b",
                                                            fontWeight: 700,
                                                            padding: "3px 10px",
                                                            background: "rgba(245,158,11,0.1)",
                                                            borderRadius: "20px",
                                                        }}
                                                    >
                                                        {tier < 1
                                                            ? "🔒 Complete Tier 1 first"
                                                            : isBrand
                                                                ? "📋 Upload to unlock ₹1L limit"
                                                                : "🚀 Upload to unlock unlimited campaigns"}
                                                    </span>
                                                )}
                                            </div>
                                            <div
                                                style={{
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    gap: "10px",
                                                }}
                                            >
                                                <DocRow
                                                    type="PAN_CARD"
                                                    label="PAN Card"
                                                    icon="🪪"
                                                    desc="Clear photo of your PAN card — required for transactions above ₹50,000"
                                                />
                                                <DocRow
                                                    type="BANK_STATEMENT"
                                                    label="Bank Statement"
                                                    icon="📄"
                                                    desc="Latest 3-month bank statement (PDF or scanned image)"
                                                />
                                            </div>
                                        </div>

                                        {/* Tier 3 — Business docs (Brand only) */}
                                        {isBrand && (
                                            <div
                                                className="card"
                                                style={{
                                                    border:
                                                        tier >= 3
                                                            ? "1px solid rgba(16,185,129,0.35)"
                                                            : "1px solid var(--color-border)",
                                                    opacity: tier < 2 ? 0.55 : 1,
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "space-between",
                                                        marginBottom: "14px",
                                                        flexWrap: "wrap",
                                                        gap: "10px",
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: "10px",
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                width: "30px",
                                                                height: "30px",
                                                                borderRadius: "50%",
                                                                background: "rgba(16,185,129,0.12)",
                                                                display: "flex",
                                                                alignItems: "center",
                                                                justifyContent: "center",
                                                            }}
                                                        >
                                                            🏢
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: 700 }}>
                                                                Tier 3 — Business Verification{" "}
                                                                <span
                                                                    style={{
                                                                        fontWeight: 400,
                                                                        color: "var(--color-text-secondary)",
                                                                    }}
                                                                >
                                                                    (Unlimited)
                                                                </span>
                                                            </div>
                                                            <div
                                                                style={{
                                                                    fontSize: "12px",
                                                                    color: "var(--color-text-secondary)",
                                                                }}
                                                            >
                                                                Upload <strong>any one</strong> business
                                                                document to unlock unlimited campaigns
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {tier >= 3 ? (
                                                        <span
                                                            style={{
                                                                fontSize: "11px",
                                                                color: "#10b981",
                                                                fontWeight: 700,
                                                                padding: "3px 10px",
                                                                background: "rgba(16,185,129,0.1)",
                                                                borderRadius: "20px",
                                                            }}
                                                        >
                                                            ✅ Unlimited
                                                        </span>
                                                    ) : (
                                                        <span
                                                            style={{
                                                                fontSize: "11px",
                                                                color: "#10b981",
                                                                fontWeight: 700,
                                                                padding: "3px 10px",
                                                                background: "rgba(16,185,129,0.1)",
                                                                borderRadius: "20px",
                                                            }}
                                                        >
                                                            {tier < 2
                                                                ? "🔒 Complete Tier 2 first"
                                                                : "🚀 Upload any one below"}
                                                        </span>
                                                    )}
                                                </div>
                                                <div
                                                    style={{
                                                        fontSize: "12px",
                                                        color: "var(--color-text-secondary)",
                                                        padding: "8px 12px",
                                                        background: "rgba(16,185,129,0.06)",
                                                        borderRadius: "var(--radius-sm)",
                                                        marginBottom: "12px",
                                                    }}
                                                >
                                                    💡 You only need <strong>one</strong> of the documents
                                                    below to unlock the unlimited tier.
                                                </div>
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        flexDirection: "column",
                                                        gap: "10px",
                                                    }}
                                                >
                                                    <DocRow
                                                        type="GST_CERTIFICATE"
                                                        label="GST Registration Certificate"
                                                        icon="📜"
                                                        desc="GST certificate for your business entity"
                                                    />
                                                    <DocRow
                                                        type="MSME_CERTIFICATE"
                                                        label="MSME / Udyam Certificate"
                                                        icon="🏭"
                                                        desc="Udyam/MSME registration certificate from Government portal"
                                                    />
                                                    <DocRow
                                                        type="STARTUP_CERTIFICATE"
                                                        label="Startup India Certificate"
                                                        icon="🚀"
                                                        desc="DPIIT recognition letter or Startup India certificate"
                                                    />
                                                    <DocRow
                                                        type="CIN_CERTIFICATE"
                                                        label="Company Incorporation (CIN)"
                                                        icon="🏛️"
                                                        desc="Ministry of Corporate Affairs certificate of incorporation"
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {/* Security note */}
                                        <div
                                            style={{
                                                padding: "12px 16px",
                                                background: "var(--color-bg-secondary)",
                                                borderRadius: "var(--radius-md)",
                                                border: "1px solid var(--color-border)",
                                                fontSize: "12px",
                                                color: "var(--color-text-muted)",
                                                lineHeight: 1.6,
                                            }}
                                        >
                                            🛡️ <strong>Security:</strong> All documents are encrypted
                                            and reviewed by our compliance team within 1–2 business
                                            days. They are never shared with third parties without
                                            your consent.
                                        </div>
                                    </>
                                );
                            })()
                        )}
                    </div>
                )}

                {activeTab === "tax" && <IndiaTaxCompliancePanel />}

                {activeTab === "notifications" && (
                    <NotificationPreferencesPanel
                        preferences={notificationPreferences}
                        isSaving={isSaving}
                        onToggle={handleNotificationToggle}
                        onSave={saveNotificationPreferences}
                    />
                )}

                {/* Security Tab - Password Change */}
                {activeTab === "security" && (
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                            gap: "24px",
                        }}
                    >
                        {/* Contact Verification Card */}
                        <div className="card">
                            <h3 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "24px" }}>
                                Contact Verification
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {/* Email Verification */}
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px',
                                    background: (user?.emailVerified && user?.email) ? 'rgba(16, 185, 129, 0.06)' : 'var(--color-bg-tertiary)',
                                    borderRadius: 'var(--radius-sm)',
                                    border: (user?.emailVerified && user?.email) ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid transparent',
                                }}>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '14px' }}>📧 Email Address</div>
                                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{user?.email || 'N/A'}</div>
                                    </div>
                                    {(user?.emailVerified && user?.email) ? (
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                fontSize: '12px', fontWeight: 700, color: '#10b981',
                                                background: 'rgba(16, 185, 129, 0.1)', padding: '5px 12px',
                                                borderRadius: '20px',
                                            }}>
                                                ✅ Verified
                                            </span>
                                            <button className="btn btn-secondary btn-sm" disabled={isSaving} style={{ fontSize: '12px', padding: '4px 8px' }} onClick={() => handleStartContactChange('email')}>{isSaving ? '...' : 'Change'}</button>
                                        </div>
                                    ) : verifyContactState.type === 'email' && verifyContactState.step === 'code' ? (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <input type="text" placeholder="OTP" className="input" style={{ width: '80px', padding: '4px 8px', fontSize: '12px' }} value={contactVerifyCode} onChange={(e) => setContactVerifyCode(e.target.value)} />
                                            <button className="btn btn-primary btn-sm" onClick={async () => {
                                                const res = await fetch('/api/user/verify-contact', { method: 'POST', body: JSON.stringify({ type: 'email', code: contactVerifyCode }) });
                                                if (res.ok) { alert('Email Verified!'); setVerifyContactState({ type: null, step: 'idle' }); setContactVerifyCode(''); } else { alert('Invalid code'); }
                                            }} style={{ fontSize: '12px', padding: '4px 8px' }}>Verify</button>
                                        </div>
                                    ) : (
                                        <button className="btn btn-secondary btn-sm" disabled={isSaving} onClick={async () => {
                                            if (!user?.email) return alert('No email found to verify.');
                                            setIsSaving(true);
                                            try {
                                                const res = await fetch('/api/user/send-otp', {
                                                    method: 'POST',
                                                    body: JSON.stringify({ type: 'email', contact: user.email })
                                                });
                                                if (res.ok) {
                                                    alert(`Verification code sent to ${user.email}`);
                                                    setVerifyContactState({ type: 'email', step: 'code' });
                                                } else {
                                                    const errorData = await res.json();
                                                    alert(errorData.error || 'Failed to send OTP to email.');
                                                }
                                            } catch (err: any) {
                                                alert(err.message || 'Error occurred');
                                            } finally {
                                                setIsSaving(false);
                                            }
                                        }} style={{ fontSize: '12px', padding: '6px 12px' }}>
                                            Verify Email
                                        </button>
                                    )}
                                </div>

                                {/* Phone Verification */}
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px',
                                    background: (user?.phoneVerified && user?.phone) ? 'rgba(16, 185, 129, 0.06)' : 'var(--color-bg-tertiary)',
                                    borderRadius: 'var(--radius-sm)',
                                    border: (user?.phoneVerified && user?.phone) ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid transparent',
                                }}>
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '14px' }}>📱 Phone Number</div>
                                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                            {user?.phoneVerified && user?.phone ? `+91-${user.phone}` : 'Required for campaign payout calls'}
                                        </div>
                                    </div>
                                    {(user?.phoneVerified && user?.phone) ? (
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                fontSize: '12px', fontWeight: 700, color: '#10b981',
                                                background: 'rgba(16, 185, 129, 0.1)', padding: '5px 12px',
                                                borderRadius: '20px',
                                            }}>
                                                ✅ Verified
                                            </span>
                                            <button className="btn btn-secondary btn-sm" disabled={isSaving} style={{ fontSize: '12px', padding: '4px 8px' }} onClick={() => handleStartContactChange('phone')}>{isSaving ? '...' : 'Change'}</button>
                                        </div>
                                    ) : verifyContactState.type === 'phone' && verifyContactState.step === 'code' ? (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <input type="text" placeholder="OTP" className="input" style={{ width: '80px', padding: '4px 8px', fontSize: '12px' }} value={contactVerifyCode} onChange={(e) => setContactVerifyCode(e.target.value)} />
                                            <button className="btn btn-primary btn-sm" onClick={async () => {
                                                const res = await fetch('/api/user/verify-contact', { method: 'POST', body: JSON.stringify({ type: 'phone', code: contactVerifyCode }) });
                                                if (res.ok) { alert('Phone Verified!'); setVerifyContactState({ type: null, step: 'idle' }); setContactVerifyCode(''); } else { alert('Invalid code'); }
                                            }} style={{ fontSize: '12px', padding: '4px 8px' }}>Verify</button>
                                        </div>
                                    ) : verifyContactState.type === 'phone' && verifyContactState.step === 'input' ? (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <input type="text" placeholder="e.g. 919876543210" className="input" style={{ width: '130px', padding: '4px 8px', fontSize: '12px' }} value={pendingContact} onChange={(e) => setPendingContact(e.target.value)} />
                                            <button className="btn btn-primary btn-sm" disabled={isSaving} onClick={async () => {
                                                if (pendingContact) {
                                                    setIsSaving(true);
                                                    try {
                                                        const res = await fetch('/api/user/send-otp', {
                                                            method: 'POST',
                                                            body: JSON.stringify({ type: 'phone', contact: pendingContact })
                                                        });
                                                        if (res.ok) {
                                                            alert(`OTP sent to ${pendingContact}`);
                                                            setVerifyContactState({ type: 'phone', step: 'code' });
                                                        } else {
                                                            const errorData = await res.json();
                                                            alert(errorData.error || 'Failed to send OTP to phone. Ensure correct country code is used.');
                                                        }
                                                    } catch (err: any) {
                                                        alert(err.message || 'Error occurred');
                                                    } finally {
                                                        setIsSaving(false);
                                                    }
                                                }
                                            }} style={{ fontSize: '12px', padding: '4px 8px' }}>
                                                {isSaving ? '...' : 'Send OTP'}
                                            </button>
                                        </div>
                                    ) : (
                                        <button className="btn btn-secondary btn-sm" disabled={isSaving} onClick={() => {
                                            setPendingContact('');
                                            setVerifyContactState({ type: 'phone', step: 'input' });
                                        }} style={{ fontSize: '12px', padding: '6px 12px' }}>
                                            Add & Verify
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Change Contact Inline UI */}
                            {changeContactState.active && (
                                <div style={{
                                    marginTop: '20px', padding: '16px', background: 'var(--color-bg-tertiary)',
                                    borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                        <h4 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Change {changeContactState.type === 'email' ? 'Email Address' : 'Phone Number'}</h4>
                                        <button style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }} onClick={() => setChangeContactState({ active: false, type: null, step: 'idle', currentEmailOtp: '', currentPhoneOtp: '', newContact: '', newOtp: '' })}>✕</button>
                                    </div>

                                    {changeContactState.step === 'verify-current' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>To protect your account, we've sent an OTP to your current contact method(s). Please enter the OTP to continue.</div>
                                            {user?.email && (
                                                <div>
                                                    <label className="label">OTP from Email</label>
                                                    <input type="text" className="input" placeholder="e.g. 123456" value={changeContactState.currentEmailOtp} onChange={e => setChangeContactState({ ...changeContactState, currentEmailOtp: e.target.value })} />
                                                </div>
                                            )}
                                            {user?.phone && (
                                                <div>
                                                    <label className="label">OTP from Phone</label>
                                                    <input type="text" className="input" placeholder="e.g. 123456" value={changeContactState.currentPhoneOtp} onChange={e => setChangeContactState({ ...changeContactState, currentPhoneOtp: e.target.value })} />
                                                </div>
                                            )}
                                            <button className="btn btn-primary" onClick={handleVerifyCurrentContacts} disabled={isSaving}>Verify & Continue</button>
                                        </div>
                                    )}

                                    {changeContactState.step === 'enter-new' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            <div>
                                                <label className="label">Enter your new {changeContactState.type}</label>
                                                <input type={changeContactState.type === 'email' ? 'email' : 'text'} className="input" placeholder={`New ${changeContactState.type}`} value={changeContactState.newContact} onChange={e => setChangeContactState({ ...changeContactState, newContact: e.target.value })} />
                                            </div>
                                            <button className="btn btn-primary" onClick={handleSendNewContactOtp} disabled={isSaving}>Send OTP to New {changeContactState.type}</button>
                                        </div>
                                    )}

                                    {changeContactState.step === 'verify-new' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>We've sent an OTP to {changeContactState.newContact}.</div>
                                            <div>
                                                <label className="label">Enter OTP</label>
                                                <input type="text" className="input" placeholder="e.g. 123456" value={changeContactState.newOtp} onChange={e => setChangeContactState({ ...changeContactState, newOtp: e.target.value })} />
                                            </div>
                                            <button className="btn btn-primary" onClick={handleConfirmNewContact} disabled={isSaving}>Confirm & Save</button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Password Card */}
                        <div className="card">
                            <h3
                                style={{
                                    fontSize: "20px",
                                    fontWeight: 700,
                                    marginBottom: "24px",
                                }}
                            >
                                Change Password
                            </h3>

                            {passwordSuccess && (
                                <div
                                    style={{
                                        padding: "12px",
                                        background: "rgba(16, 185, 129, 0.1)",
                                        color: "var(--color-success)",
                                        borderRadius: "var(--radius-sm)",
                                        marginBottom: "16px",
                                        border: "1px solid rgba(16, 185, 129, 0.2)",
                                    }}
                                >
                                    {passwordSuccess}
                                </div>
                            )}

                            {passwordError && (
                                <div
                                    style={{
                                        padding: "12px",
                                        background: "rgba(239, 68, 68, 0.1)",
                                        color: "var(--color-error)",
                                        borderRadius: "var(--radius-sm)",
                                        marginBottom: "16px",
                                        border: "1px solid rgba(239, 68, 68, 0.2)",
                                    }}
                                >
                                    {passwordError}
                                </div>
                            )}

                            <form onSubmit={handlePasswordChange}>
                                {forgotPasswordState.active ? (
                                    <div style={{ marginBottom: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
                                        {forgotPasswordState.step === 'method' && (
                                            <>
                                                <p style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>Choose where to send the OTP:</p>
                                                <div style={{ display: "flex", gap: "12px" }}>
                                                    <button type="button" className="btn btn-secondary" onClick={() => handleSendForgotPasswordOtp('email')} disabled={isSaving || !user?.email} style={{ flex: 1 }}>{user?.email ? "Send to Email" : "No Email Added"}</button>
                                                    <button type="button" className="btn btn-secondary" onClick={() => handleSendForgotPasswordOtp('phone')} disabled={isSaving || !user?.phone} style={{ flex: 1 }}>{user?.phone ? "Send to Phone" : "No Phone Added"}</button>
                                                </div>
                                                <button type="button" style={{ background: "none", border: "none", color: "var(--color-text-muted)", fontSize: "14px", cursor: "pointer", textDecoration: "underline" }} onClick={() => setForgotPasswordState({ active: false, step: 'method', method: null, otp: '' })}>Cancel</button>
                                            </>
                                        )}
                                        {forgotPasswordState.step === 'otp' && (
                                            <>
                                                <label className="label">Enter OTP sent to your {forgotPasswordState.method}</label>
                                                <input
                                                    type="text"
                                                    className="input"
                                                    placeholder="e.g. 123456"
                                                    value={forgotPasswordState.otp}
                                                    onChange={(e) => setForgotPasswordState(prev => ({ ...prev, otp: e.target.value }))}
                                                    required
                                                />
                                                <button type="button" style={{ background: "none", border: "none", color: "var(--color-text-muted)", fontSize: "14px", cursor: "pointer", textDecoration: "underline", alignSelf: "flex-start" }} onClick={() => setForgotPasswordState({ active: false, step: 'method', method: null, otp: '' })}>Cancel Reset</button>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ marginBottom: "20px" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                                            <label className="label" style={{ marginBottom: 0 }}>Current Password</label>
                                            <button
                                                type="button"
                                                onClick={() => setForgotPasswordState({ active: true, step: 'method', method: null, otp: '' })}
                                                style={{
                                                    background: "none",
                                                    border: "none",
                                                    color: "var(--color-primary-light)",
                                                    fontSize: "13px",
                                                    fontWeight: 600,
                                                    cursor: "pointer",
                                                    padding: 0
                                                }}
                                            >
                                                Forgot Password?
                                            </button>
                                        </div>
                                        <div style={{ position: "relative" }}>
                                            <input
                                                type={showPassword.current ? "text" : "password"}
                                                className="input"
                                                value={passwordData.currentPassword}
                                                onChange={(e) =>
                                                    setPasswordData({
                                                        ...passwordData,
                                                        currentPassword: e.target.value,
                                                    })
                                                }
                                                required={!forgotPasswordState.active}
                                            />
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setShowPassword({
                                                        ...showPassword,
                                                        current: !showPassword.current,
                                                    })
                                                }
                                                style={{
                                                    position: "absolute",
                                                    right: "12px",
                                                    top: "50%",
                                                    transform: "translateY(-50%)",
                                                    background: "none",
                                                    border: "none",
                                                    cursor: "pointer",
                                                    fontSize: "16px",
                                                    opacity: 0.7,
                                                }}
                                            >
                                                {showPassword.current ? "👁️" : "🙈"}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {(!forgotPasswordState.active || forgotPasswordState.step === 'otp') && (
                                    <>
                                        <div style={{ marginBottom: "20px" }}>
                                            <label className="label">New Password</label>
                                            <div style={{ position: "relative" }}>
                                                <input
                                                    type={showPassword.new ? "text" : "password"}
                                                    className="input"
                                                    value={passwordData.newPassword}
                                                    onChange={(e) =>
                                                        setPasswordData({
                                                            ...passwordData,
                                                            newPassword: e.target.value,
                                                        })
                                                    }
                                                    required
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setShowPassword({
                                                            ...showPassword,
                                                            new: !showPassword.new,
                                                        })
                                                    }
                                                    style={{
                                                        position: "absolute",
                                                        right: "12px",
                                                        top: "50%",
                                                        transform: "translateY(-50%)",
                                                        background: "none",
                                                        border: "none",
                                                        cursor: "pointer",
                                                        fontSize: "16px",
                                                        opacity: 0.7,
                                                    }}
                                                >
                                                    {showPassword.new ? "👁️" : "🙈"}
                                                </button>
                                            </div>
                                        </div>

                                        <div style={{ marginBottom: "24px" }}>
                                            <label className="label">Confirm New Password</label>
                                            <div style={{ position: "relative" }}>
                                                <input
                                                    type={showPassword.confirm ? "text" : "password"}
                                                    className="input"
                                                    value={passwordData.confirmPassword}
                                                    onChange={(e) =>
                                                        setPasswordData({
                                                            ...passwordData,
                                                            confirmPassword: e.target.value,
                                                        })
                                                    }
                                                    required
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setShowPassword({
                                                            ...showPassword,
                                                            confirm: !showPassword.confirm,
                                                        })
                                                    }
                                                    style={{
                                                        position: "absolute",
                                                        right: "12px",
                                                        top: "50%",
                                                        transform: "translateY(-50%)",
                                                        background: "none",
                                                        border: "none",
                                                        cursor: "pointer",
                                                        fontSize: "16px",
                                                        opacity: 0.7,
                                                    }}
                                                >
                                                    {showPassword.confirm ? "👁️" : "🙈"}
                                                </button>
                                            </div>
                                        </div>

                                        <button
                                            type="submit"
                                            className="btn btn-primary"
                                            disabled={isSaving}
                                            style={{ width: "100%" }}
                                        >
                                            {isSaving ? <span className="loading" /> : "Update Password"}
                                        </button>
                                    </>
                                )}
                            </form>
                        </div>

                        <div
                            style={{ display: "flex", flexDirection: "column", gap: "24px" }}
                        >
                            {/* Two-Factor Authentication */}
                            <div className="card">
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "flex-start",
                                        marginBottom: "16px",
                                    }}
                                >
                                    <div>
                                        <h3
                                            style={{
                                                fontSize: "18px",
                                                fontWeight: 700,
                                                marginBottom: "4px",
                                            }}
                                        >
                                            Two-Factor Authentication
                                        </h3>
                                        <p
                                            style={{
                                                fontSize: "13px",
                                                color: "var(--color-text-secondary)",
                                            }}
                                        >
                                            Add an extra layer of security to your account.
                                        </p>
                                    </div>
                                    {is2FAEnabled ? (
                                        <div className="badge badge-success">Enabled</div>
                                    ) : (
                                        <div className="badge badge-warning">Disabled</div>
                                    )}
                                </div>

                                {!is2FAEnabled && !is2FASetupVisible && (
                                    <button
                                        className="btn btn-secondary"
                                        style={{ width: "100%" }}
                                        onClick={async () => {
                                            setIsSaving(true);
                                            const res = await fetch("/api/user/2fa/setup", {
                                                method: "POST",
                                            });
                                            const data = await res.json();
                                            setIsSaving(false);
                                            if (data.qrCodeUrl) {
                                                setQrCodeData(data);
                                                setIs2FASetupVisible(true);
                                            } else {
                                                alert("Failed to initiate 2FA setup");
                                            }
                                        }}
                                    >
                                        Enable 2FA
                                    </button>
                                )}

                                {is2FASetupVisible && qrCodeData && !is2FAEnabled && (
                                    <div
                                        style={{
                                            marginTop: "16px",
                                            padding: "16px",
                                            background: "var(--color-bg-tertiary)",
                                            borderRadius: "var(--radius-md)",
                                        }}
                                    >
                                        <p style={{ fontSize: "14px", marginBottom: "12px" }}>
                                            1. Scan this QR code with your authenticator app (e.g.
                                            Google Authenticator, Authy):
                                        </p>
                                        <div
                                            style={{
                                                display: "flex",
                                                justifyContent: "center",
                                                marginBottom: "16px",
                                                background: "white",
                                                padding: "16px",
                                                borderRadius: "8px",
                                                width: "fit-content",
                                                margin: "0 auto 16px auto",
                                            }}
                                        >
                                            <img
                                                src={qrCodeData.qrCodeUrl}
                                                alt="2FA QR Code"
                                                width={150}
                                                height={150}
                                            />
                                        </div>
                                        <p
                                            style={{
                                                fontSize: "12px",
                                                color: "var(--color-text-muted)",
                                                textAlign: "center",
                                                marginBottom: "16px",
                                            }}
                                        >
                                            Or enter code manually: {qrCodeData.secret}
                                        </p>
                                        <p style={{ fontSize: "14px", marginBottom: "8px" }}>
                                            2. Enter the 6-digit code from your app to verify setup:
                                        </p>
                                        <div style={{ display: "flex", gap: "8px" }}>
                                            <input
                                                type="text"
                                                className="input"
                                                placeholder="000000"
                                                maxLength={6}
                                                value={setupCode}
                                                onChange={(e) =>
                                                    setSetupCode(e.target.value.replace(/\D/g, ""))
                                                }
                                            />
                                            <button
                                                className="btn btn-primary"
                                                onClick={async () => {
                                                    if (setupCode.length !== 6)
                                                        return alert("Enter 6 digit code");
                                                    setIsSaving(true);
                                                    const res = await fetch("/api/user/2fa/verify", {
                                                        method: "POST",
                                                        headers: { "Content-Type": "application/json" },
                                                        body: JSON.stringify({ code: setupCode }),
                                                    });
                                                    const data = await res.json();
                                                    setIsSaving(false);
                                                    if (data.success) {
                                                        setIs2FAEnabled(true);
                                                        setIs2FASetupVisible(false);
                                                        setSetupCode("");
                                                        alert(
                                                            "Two-Factor Authentication successfully enabled!",
                                                        );
                                                    } else {
                                                        alert(data.error || "Invalid code");
                                                    }
                                                }}
                                            >
                                                Verify & Enable
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {is2FAEnabled && (
                                    <div
                                        style={{
                                            marginTop: "16px",
                                            padding: "16px",
                                            background: "var(--color-bg-tertiary)",
                                            borderRadius: "var(--radius-md)",
                                        }}
                                    >
                                        <p style={{ fontSize: "14px", marginBottom: "12px" }}>
                                            To disable 2FA, please enter your current password:
                                        </p>
                                        <div
                                            style={{
                                                display: "flex",
                                                gap: "8px",
                                                flexDirection: "column",
                                            }}
                                        >
                                            <input
                                                type="password"
                                                className="input"
                                                placeholder="Current Password"
                                                value={disable2FAPassword}
                                                onChange={(e) => setDisable2FAPassword(e.target.value)}
                                            />
                                            <button
                                                className="btn btn-danger"
                                                onClick={async () => {
                                                    if (!disable2FAPassword)
                                                        return alert("Password required");
                                                    setIsSaving(true);
                                                    const res = await fetch("/api/user/2fa/disable", {
                                                        method: "POST",
                                                        headers: { "Content-Type": "application/json" },
                                                        body: JSON.stringify({
                                                            password: disable2FAPassword,
                                                        }),
                                                    });
                                                    const data = await res.json();
                                                    setIsSaving(false);
                                                    if (data.success) {
                                                        setIs2FAEnabled(false);
                                                        setDisable2FAPassword("");
                                                        alert(
                                                            "Two-Factor Authentication successfully disabled.",
                                                        );
                                                    } else {
                                                        alert(data.error || "Failed to disable 2FA");
                                                    }
                                                }}
                                            >
                                                Disable 2FA
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Login History */}
                            <div className="card">
                                <div style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    marginBottom: "16px",
                                }}>
                                    <h3 style={{ fontSize: "18px", fontWeight: 700 }}>
                                        Recent Login Activity
                                    </h3>
                                    {loginActivity.length > 3 && (
                                        <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                                            {loginActivity.length} total sessions
                                        </span>
                                    )}
                                </div>
                                <div
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: "12px",
                                    }}
                                >
                                    {loginActivity.length === 0 ? (
                                        <p
                                            style={{
                                                fontSize: "13px",
                                                color: "var(--color-text-secondary)",
                                            }}
                                        >
                                            No recent activity to display.
                                        </p>
                                    ) : (
                                        (showAllLogins ? loginActivity : loginActivity.slice(0, 3)).map((login, index) => (
                                            <div
                                                key={index}
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    alignItems: "center",
                                                    padding: "12px",
                                                    background: "var(--color-bg-tertiary)",
                                                    borderRadius: "var(--radius-sm)",
                                                    border: login.active
                                                        ? "1px solid var(--color-primary)"
                                                        : "1px solid transparent",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: "12px",
                                                    }}
                                                >
                                                    <div style={{ fontSize: "20px" }}>
                                                        {login.device.includes("Android") ||
                                                            login.device.includes("iPhone")
                                                            ? "📱"
                                                            : "💻"}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: "13px", fontWeight: 600 }}>
                                                            {login.device}{" "}
                                                            <span
                                                                style={{
                                                                    fontWeight: 400,
                                                                    color: "var(--color-text-muted)",
                                                                }}
                                                            >
                                                                • {login.location}
                                                            </span>
                                                        </div>
                                                        <div
                                                            style={{
                                                                fontSize: "11px",
                                                                color: login.success
                                                                    ? "var(--color-text-secondary)"
                                                                    : "var(--color-error)",
                                                            }}
                                                        >
                                                            {new Date(login.time).toLocaleString()}{" "}
                                                            {login.success ? "" : "(Failed Attempt)"}
                                                        </div>
                                                    </div>
                                                </div>
                                                {login.active && (
                                                    <div
                                                        style={{
                                                            fontSize: "10px",
                                                            fontWeight: 700,
                                                            color: "var(--color-accent-emerald)",
                                                            background: "rgba(16, 185, 129, 0.1)",
                                                            padding: "2px 6px",
                                                            borderRadius: "4px",
                                                        }}
                                                    >
                                                        ACTIVE
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                                {loginActivity.length > 3 && (
                                    <button
                                        onClick={() => setShowAllLogins(!showAllLogins)}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            gap: "6px",
                                            width: "100%",
                                            marginTop: "12px",
                                            padding: "10px",
                                            background: "var(--color-bg-tertiary)",
                                            border: "1px solid var(--color-border)",
                                            borderRadius: "var(--radius-sm)",
                                            color: "var(--color-primary-light)",
                                            fontSize: "13px",
                                            fontWeight: 600,
                                            cursor: "pointer",
                                            transition: "all 0.2s ease",
                                        }}
                                        onMouseOver={(e) => e.currentTarget.style.background = "var(--color-bg-primary)"}
                                        onMouseOut={(e) => e.currentTarget.style.background = "var(--color-bg-tertiary)"}
                                    >
                                        {showAllLogins ? "▲ Show Less" : `▼ View All (${loginActivity.length})`}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: "none" }}
                accept="image/*,application/pdf"
            />
        </DashboardShell >
    );
}
