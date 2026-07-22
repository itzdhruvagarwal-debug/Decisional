"use client";


import { logger } from "@/lib/logger-client";
import { useState, useRef } from "react";
import type { User } from "./ProfileTab";
import { Button } from "@/components/ui";

export interface VerificationData {
    verificationLevel?: string;
    trustScore?: number;
    tier?: number;
    tierLimit?: number | null;
    tierDescription?: string;
    emailVerified?: boolean;
    phoneVerified?: boolean;
    userType?: string;
    documents?: {
        id: string;
        type: string;
        status: string;
        rejectionReason?: string;
    }[];
}

interface VerificationTabProps {
    user: User;
    verificationData: VerificationData | null;
    setVerificationData: React.Dispatch<React.SetStateAction<VerificationData | null>>;
    showToast: (message: string, type?: "success" | "error" | "info") => void;
}

interface StatusBadgeProps {
    doc?: { status: string; rejectionReason?: string | null } | null | undefined;
}

function StatusBadge({ doc }: Readonly<StatusBadgeProps>) {
    if (!doc)
        return (
            <span
                className="text-muted text-xs bg-tertiary rounded-2xl px-2-py-05"
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
            className="font-semibold text-xs rounded-2xl px-2-py-05" style={{ color: colors[doc.status] || "#999", background: `${colors[doc.status]}18` }}
        >
            {icons[doc.status]} {doc.status}
        </span>
    );
}

interface UploadBtnProps {
    doc?: { status: string; rejectionReason?: string | null } | null | undefined;
    type: string;
    isUploading: boolean;
    uploadingDocType: string | null;
    onUpload: (type: string) => void;
}

function getUploadButtonText(isUploading: boolean, uploadingDocType: string | null, type: string, hasDoc: boolean) {
    if (isUploading && uploadingDocType === type) return "⏳";
    if (hasDoc) return "↑ Re-upload";
    return "↑ Upload";
}

function UploadBtn({
    doc,
    type,
    isUploading,
    uploadingDocType,
    onUpload,
}: Readonly<UploadBtnProps>) {
    if (doc?.status === "VERIFIED") return null;
    return (
        <Button
            variant="secondary"
            aria-label={`${doc ? "Re-upload" : "Upload"} ${type.replace(/_/g, " ").toLowerCase()}`}
            aria-busy={isUploading && uploadingDocType === type}
            onClick={() => onUpload(type)}
            disabled={isUploading}
            className="text-xs px-2-py-1"
        >
            {getUploadButtonText(isUploading, uploadingDocType, type, !!doc)}
        </Button>
    );
}

interface DocRowProps {
    type: string;
    label: string;
    icon: string;
    desc: string;
    doc?: { status: string; rejectionReason?: string | null } | null | undefined;
    isUploading: boolean;
    uploadingDocType: string | null;
    onUpload: (type: string) => void;
}

function getDocRowBorder(status?: string) {
    if (status === "REJECTED") return "1px solid rgba(239,68,68,0.3)";
    if (status === "VERIFIED") return "1px solid rgba(16,185,129,0.3)";
    return "1px solid var(--color-border)";
}

function DocRow({
    type,
    label,
    icon,
    desc,
    doc,
    isUploading,
    uploadingDocType,
    onUpload,
}: Readonly<DocRowProps>) {
    return (
        <div
            className="flex items-center justify-between rounded-md px-4-py-3" style={{ background:
                    doc?.status === "VERIFIED"
                        ? "rgba(16,185,129,0.07)"
                        : "var(--color-bg-tertiary)", border: getDocRowBorder(doc?.status) }}
        >
            <div
                className="flex items-center gap-2-5"
            >
                <span className="text-lg">{icon}</span>
                <div>
                    <div className="font-semibold text-sm">
                        {label}
                    </div>
                    <div
                        className="text-muted text-xs"
                    >
                        {desc}
                    </div>
                    {doc?.status === "REJECTED" &&
                        doc.rejectionReason && (
                            <div
                                className="mt-1 text-xs text-rose"
                            >
                                ❌ Rejected: {doc.rejectionReason}
                            </div>
                        )}
                </div>
            </div>
            <div
                className="flex flex-col items-end gap-1-5"
            >
                <StatusBadge doc={doc} />
                <UploadBtn
                    doc={doc}
                    type={type}
                    isUploading={isUploading}
                    uploadingDocType={uploadingDocType}
                    onUpload={onUpload}
                />
            </div>
        </div>
    );
}

function getTierIcon(tier: number) {
    if (tier === 0) return "🔒";
    if (tier === 1) return "🥉";
    if (tier === 2) return "🥈";
    return "🥇";
}

function getMonthlyLimitText(isUnlimited: boolean, tier: number, tierLimit: number | null) {
    if (isUnlimited) return "∞ Unlimited";
    if (tier === 0) return "Locked";
    if (tierLimit) return `₹${(tierLimit / 100).toLocaleString("en-IN")}`;
    return "—";
}

function getTierUpgradeActionText(tier: number, isBrand: boolean) {
    if (tier < 1) return "🔒 Complete Tier 1 first";
    if (isBrand) return "📋 Upload to unlock ₹1L limit";
    return "🚀 Upload to unlock unlimited campaigns";
}

function useDocUpload(
    showToast: (msg: string, type: "success" | "error") => void,
    setVerificationData: (data: VerificationData | null) => void
) {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);
    const [isConnectingDigiLocker, setIsConnectingDigiLocker] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleUpload = (type: string) => {
        setUploadingDocType(type);
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleDigiLockerConnect = async () => {
        setIsConnectingDigiLocker(true);
        try {
            const res = await fetch("/api/auth/digilocker/authorize");
            const data = await res.json();
            if (!res.ok || !data.url) {
                showToast(data.error || "Failed to initiate DigiLocker connection", "error");
                return;
            }
            window.location.href = data.url;
        } catch {
            showToast("An error occurred while connecting to DigiLocker", "error");
        } finally {
            setIsConnectingDigiLocker(false);
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
                showToast("Document uploaded! Verification pending.", "success");
                // Refresh data
                const refresh = await fetch("/api/verification");
                const newData = await refresh.json();
                setVerificationData(newData);
            } else {
                showToast(data.error || "Upload failed", "error");
            }
        } catch (error) {
            logger.error("[verification-tab] Failed to upload document:", error);
            showToast("An error occurred", "error");
        } finally {
            setIsUploading(false);
            setUploadingDocType(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    return {
        isUploading,
        uploadingDocType,
        isConnectingDigiLocker,
        fileInputRef,
        handleUpload,
        handleDigiLockerConnect,
        handleFileChange,
    };
}

interface DigiLockerCardProps {
    readonly isConnectingDigiLocker: boolean;
    readonly handleDigiLockerConnect: () => void;
}

function DigiLockerCardComponent({
    isConnectingDigiLocker,
    handleDigiLockerConnect,
}: DigiLockerCardProps) {
    return (
        <div
            className="card"
            style={{
                border: "1px solid rgba(34,197,94,0.3)",
                background: "linear-gradient(135deg, rgba(34,197,94,0.06), rgba(59,130,246,0.04))",
            }}
        >
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1" style={{ minWidth: "200px" }}>
                    <div className="flex items-center mb-2 gap-2-5">
                        <span className="text-2xl">🏛️</span>
                        <div>
                            <div className="font-bold text-sm">Instant Verification via DigiLocker</div>
                            <div className="text-xs text-muted mt-1">Government of India</div>
                        </div>
                    </div>
                    <div className="text-sm text-secondary leading-relaxed">
                        Connect your DigiLocker account to automatically verify your Aadhaar and PAN — no uploads needed. Documents are fetched directly from the government database.
                    </div>
                    <div className="text-muted text-xs mt-1">
                        🔒 Your data is accessed read-only and encrypted at rest. Alternatively, upload documents manually below.
                    </div>
                </div>
                <Button
                    variant="primary"
                    aria-label="Connect to DigiLocker for instant government ID verification"
                    aria-busy={isConnectingDigiLocker}
                    onClick={handleDigiLockerConnect}
                    disabled={isConnectingDigiLocker}
                    className="border-none whitespace-nowrap" style={{ background: "linear-gradient(135deg, #16a34a, #22c55e)", minWidth: "180px" }}
                >
                    {isConnectingDigiLocker ? "Connecting..." : "🔗 Connect DigiLocker"}
                </Button>
            </div>
        </div>
    );
}

interface TierCardProps {
    readonly tier: number;
    readonly isBrand: boolean;
    readonly renderDocRow: (type: string, label: string, icon: string, desc: string) => React.ReactNode;
}

function Tier1CardComponent({ tier, renderDocRow }: Omit<TierCardProps, "isBrand">) {
    return (
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
                className="flex items-center justify-between flex-wrap mb-3 gap-2-5"
            >
                <div
                    className="flex items-center gap-2-5"
                >
                    <div
                        className="flex items-center justify-center rounded-full" style={{ width: "30px", height: "30px", background: "rgba(99,102,241,0.12)" }}
                    >
                        🪪
                    </div>
                    <div>
                        <div className="font-bold">
                            Tier 1 — Basic Identity{" "}
                            <span
                                className="font-normal text-secondary"
                            >
                                (up to ₹50,000/month)
                            </span>
                        </div>
                        <div
                            className="text-xs text-secondary"
                        >
                            Aadhaar + Selfie verification
                        </div>
                    </div>
                </div>
                {tier >= 1 ? (
                    <span
                        className="font-bold text-xs text-emerald rounded-2xl px-2-py-1 bg-emerald-subtle"
                    >
                        ✅ Unlocked
                    </span>
                ) : (
                    <span
                        className="font-bold text-xs rounded-2xl px-2-py-1" style={{ color: "#6366f1", background: "rgba(99,102,241,0.1)" }}
                    >
                        🔒 Required to start
                    </span>
                )}
            </div>
            <div
                className="flex flex-col gap-2-5"
            >
                {renderDocRow("AADHAAR", "Aadhaar Card", "🪪", "Front & back photo of your Aadhaar (address proof)")}
                {renderDocRow("SELFIE", "Selfie with Aadhaar", "🤳", "Clear selfie holding your Aadhaar card (liveness check)")}
            </div>
        </div>
    );
}

function Tier2CardComponent({ tier, isBrand, renderDocRow }: TierCardProps) {
    return (
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
                className="flex items-center justify-between flex-wrap mb-3 gap-2-5"
            >
                <div
                    className="flex items-center gap-2-5"
                >
                    <div
                        className="flex items-center justify-center rounded-full" style={{ width: "30px", height: "30px", background: "rgba(245,158,11,0.12)" }}
                    >
                        🏦
                    </div>
                    <div>
                        <div className="font-bold">
                            Tier 2 — Financial Identity{" "}
                            <span
                                className="font-normal text-secondary"
                            >
                                {isBrand
                                    ? "(up to ₹1,00,000/month)"
                                    : "(Unlimited — for Influencers)"}
                            </span>
                        </div>
                        <div
                            className="text-xs text-secondary"
                        >
                            PAN Card + Bank Statement
                            {!isBrand ? " — unlocks unlimited campaigns" : ""}
                        </div>
                    </div>
                </div>
                {tier >= 2 ? (
                    <span
                        className="font-bold text-xs text-emerald rounded-2xl px-2-py-1 bg-emerald-subtle"
                    >
                        ✅ {isBrand ? "Unlocked" : "Unlimited — All campaigns"}
                    </span>
                ) : (
                    <span
                        className="font-bold text-xs text-amber rounded-2xl px-2-py-1" style={{ background: "rgba(245,158,11,0.1)" }}
                    >
                        {getTierUpgradeActionText(tier, isBrand)}
                    </span>
                )}
            </div>
            <div
                className="flex flex-col gap-2-5"
            >
                {renderDocRow("PAN_CARD", "PAN Card", "🪪", "Clear photo of your PAN card — required for transactions above ₹50,000")}
                {renderDocRow("BANK_STATEMENT", "Bank Statement", "📄", "Latest 3-month bank statement (PDF or scanned image)")}
            </div>
        </div>
    );
}

function Tier3CardComponent({ tier, renderDocRow }: Omit<TierCardProps, "isBrand">) {
    return (
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
                className="flex items-center justify-between flex-wrap mb-3 gap-2-5"
            >
                <div
                    className="flex items-center gap-2-5"
                >
                    <div
                        className="flex items-center justify-center rounded-full" style={{ width: "30px", height: "30px", background: "rgba(16,185,129,0.12)" }}
                    >
                        🏢
                    </div>
                    <div>
                        <div className="font-bold">
                            Tier 3 — Business Verification{" "}
                            <span
                                className="font-normal text-secondary"
                            >
                                (Unlimited)
                            </span>
                        </div>
                        <div
                            className="text-xs text-secondary"
                        >
                            Upload <strong>any one</strong> business document to unlock unlimited campaigns
                        </div>
                    </div>
                </div>
                {tier >= 3 ? (
                    <span
                        className="font-bold text-xs text-emerald rounded-2xl px-2-py-1 bg-emerald-subtle"
                    >
                        ✅ Unlimited
                    </span>
                ) : (
                    <span
                        className="font-bold text-xs text-emerald rounded-2xl px-2-py-1 bg-emerald-subtle"
                    >
                        {tier < 2
                            ? "🔒 Complete Tier 2 first"
                            : "🚀 Upload any one below"}
                    </span>
                )}
            </div>
            <div
                className="text-xs text-secondary mb-3 rounded-sm px-3-py-2" style={{ background: "rgba(16,185,129,0.06)" }}
            >
                💡 You only need <strong>one</strong> of the documents below to unlock the unlimited tier.
            </div>
            <div
                className="flex flex-col gap-2-5"
            >
                {renderDocRow("GST_CERTIFICATE", "GST Registration Certificate", "📜", "GST certificate for your business entity")}
                {renderDocRow("MSME_CERTIFICATE", "MSME / Udyam Certificate", "🏭", "Udyam/MSME registration certificate from Government portal")}
                {renderDocRow("STARTUP_CERTIFICATE", "Startup India Certificate", "🚀", "DPIIT recognition letter or Startup India certificate")}
                {renderDocRow("CIN_CERTIFICATE", "Company Incorporation (CIN)", "🏛️", "Ministry of Corporate Affairs certificate of incorporation")}
            </div>
        </div>
    );
}

export default function VerificationTab({
    user,
    verificationData,
    setVerificationData,
    showToast,
}: Readonly<VerificationTabProps>) {
    const {
        isUploading,
        uploadingDocType,
        isConnectingDigiLocker,
        fileInputRef,
        handleUpload,
        handleDigiLockerConnect,
        handleFileChange,
    } = useDocUpload(showToast, setVerificationData);

    if (!verificationData) {
        return (
            <div
                className="flex justify-center p-10"
            >
                <span
                    className="loading"
                    style={{ width: "32px", height: "32px" }}
                />
            </div>
        );
    }

    const docs = verificationData.documents || [];
    const tier: number = verificationData.tier ?? 0;
    const tierLimit: number | null = verificationData.tierLimit ?? null;
    const tierDesc: string = verificationData.tierDescription || "";
    const emailVerified: boolean = !!verificationData.emailVerified;
    const phoneVerified: boolean = !!verificationData.phoneVerified;
    const roleType: string = verificationData.userType || user?.userType || "INFLUENCER";
    const isBrand = roleType === "BRAND";

    // Helper to extract a document's verification status by document type
    const getDocStatus = (type: string) => docs.find((d) => d.type === type);
    const tierColors = ["#6b7280", "#6366f1", "#f59e0b", "#10b981"];
    const isUnlimited = tierLimit === null;

    const renderDocRow = (type: string, label: string, icon: string, desc: string) => {
        return (
            <DocRow
                type={type}
                label={label}
                icon={icon}
                desc={desc}
                doc={getDocStatus(type)}
                isUploading={isUploading}
                uploadingDocType={uploadingDocType}
                onUpload={handleUpload}
            />
        );
    };

    return (
        <div
            className="flex flex-col gap-6 max-w-900"
        >
            <TierStatusCardComponent
                tier={tier}
                tierColors={tierColors}
                isUnlimited={isUnlimited}
                tierLimit={tierLimit}
                tierDesc={tierDesc}
                trustScore={verificationData.trustScore || 600}
            />

            <Step1MandatoryCardComponent
                emailVerified={emailVerified}
                phoneVerified={phoneVerified}
            />

            {/* DigiLocker Instant Verification */}
            <DigiLockerCardComponent
                isConnectingDigiLocker={isConnectingDigiLocker}
                handleDigiLockerConnect={handleDigiLockerConnect}
            />

            <Tier1CardComponent
                tier={tier}
                renderDocRow={renderDocRow}
            />

            {/* Tier 2 */}
            <Tier2CardComponent
                tier={tier}
                isBrand={isBrand}
                renderDocRow={renderDocRow}
            />

            {/* Tier 3 — Business docs (Brand only) */}
            {isBrand && (
                <Tier3CardComponent
                    tier={tier}
                    renderDocRow={renderDocRow}
                />
            )}

            {/* Security note */}
            <div
                className="text-xs text-muted bg-secondary rounded-md border-card leading-relaxed px-4-py-3"
            >
                🛡️ <strong>Security:</strong> All documents are encrypted and reviewed by our compliance team within 1–2 business days. They are never shared with third parties without your consent.
            </div>

            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="image/*,application/pdf"
            />
        </div>
    );
}

interface TierStatusCardProps {
    readonly tier: number;
    readonly tierColors: string[];
    readonly isUnlimited: boolean;
    readonly tierLimit: number | null;
    readonly tierDesc: string;
    readonly trustScore: number;
}

function TierStatusCardComponent({
    tier,
    tierColors,
    isUnlimited,
    tierLimit,
    tierDesc,
    trustScore,
}: TierStatusCardProps) {
    return (
        <div
            className="card"
            style={{
                background: `linear-gradient(135deg, ${tierColors[tier]}12, var(--color-bg-secondary))`,
                border: `1px solid ${tierColors[tier]}30`,
            }}
        >
            <div
                className="flex justify-between items-start flex-wrap gap-4"
            >
                <div>
                    <div
                        className="font-bold text-xs mb-1 uppercase tracking-wider" style={{ color: tierColors[tier] }}
                    >
                        Your Verification Tier
                    </div>
                    <div
                        className="flex items-center gap-3"
                    >
                        <div
                            className="flex items-center justify-center rounded-full text-2xl text-white" style={{ width: "52px", height: "52px", background: `linear-gradient(135deg, ${tierColors[tier]}, ${tierColors[tier]}88)` }}
                        >
                            {getTierIcon(tier)}
                        </div>
                        <div>
                            <div
                                className="text-xl font-extrabold" style={{ color: tierColors[tier] }}
                            >
                                Tier {tier} —{" "}
                                {
                                    ["Locked", "Basic", "Standard", "Premium"][
                                    tier
                                    ]
                                }
                            </div>
                            <div
                                className="text-sm text-secondary mt-1"
                            >
                                {tierDesc}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="text-right">
                    <div
                        className="text-muted mb-1 text-xs uppercase tracking-wider"
                    >
                        Monthly Limit
                    </div>
                    <div
                        className="font-extrabold text-2xl" style={{ color: isUnlimited
                                ? "#10b981"
                                : "var(--color-text-primary)" }}
                    >
                        {getMonthlyLimitText(isUnlimited, tier, tierLimit)}
                    </div>
                    <div
                        className="text-muted text-xs mt-1"
                    >
                        per month
                    </div>
                </div>
            </div>
            <div className="mt-4">
                <div
                    className="flex justify-between" style={{ marginBottom: "5px" }}
                >
                    <span
                        className="text-xs text-secondary"
                    >
                        Trust Score
                    </span>
                    <span className="text-xs font-bold">
                        {trustScore}
                        /900
                    </span>
                </div>
                <div
                    className="overflow-hidden bg-tertiary rounded-full" style={{ height: "6px" }}
                >
                    <div
                        className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, (trustScore / 900) * 100))}%`, background: `linear-gradient(90deg, ${tierColors[tier]}, #10b981)`, transition: "width 0.6s" }}
                    />
                </div>
            </div>
        </div>
    );
}

interface Step1MandatoryCardProps {
    readonly emailVerified: boolean;
    readonly phoneVerified: boolean;
}

function Step1MandatoryCardComponent({
    emailVerified,
    phoneVerified,
}: Step1MandatoryCardProps) {
    return (
        <div className="card">
            <div
                className="flex items-center gap-2-5 mb-3"
            >
                <div
                    className="flex items-center justify-center rounded-full" style={{ width: "30px", height: "30px", background: "rgba(99,102,241,0.12)" }}
                >
                    🔑
                </div>
                <div>
                    <div className="font-bold">
                        Step 1 — Mandatory for ALL campaigns
                    </div>
                    <div
                        className="text-xs text-secondary"
                    >
                        Required before creating or applying to any campaign
                    </div>
                </div>
            </div>
            <div
                className="flex flex-col gap-2-5"
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
                ].map((item) => (
                    <div
                        key={item.label}
                        className="flex items-center justify-between rounded-md px-4-py-3" style={{ background: item.verified
                                ? "rgba(16,185,129,0.07)"
                                : "var(--color-bg-tertiary)", border: `1px solid ${item.verified ? "rgba(16,185,129,0.3)" : "var(--color-border)"}` }}
                    >
                        <div
                            className="flex items-center gap-2-5"
                        >
                            <span className="text-lg">
                                {item.icon}
                            </span>
                            <div>
                                <div
                                    className="font-semibold text-sm"
                                >
                                    {item.label}
                                </div>
                                <div
                                    className="text-muted text-xs"
                                >
                                    {item.verified
                                        ? "Verified ✓"
                                        : "Verify via Settings → Security"}
                                </div>
                            </div>
                        </div>
                        {item.verified ? (
                            <span
                                className="text-lg font-bold text-emerald"
                            >
                                ✓
                            </span>
                        ) : (
                            <span
                                className="text-xs font-semibold text-amber rounded-2xl px-2-py-1" style={{ background: "rgba(245,158,11,0.1)" }}
                            >
                                ⚠ Pending
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
