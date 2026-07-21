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
            style={{ fontSize: "12px", padding: "4px 10px" }}
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
                border: getDocRowBorder(doc?.status),
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
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: "200px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                        <span style={{ fontSize: "22px" }}>🏛️</span>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: "15px" }}>Instant Verification via DigiLocker</div>
                            <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "2px" }}>Government of India</div>
                        </div>
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
                        Connect your DigiLocker account to automatically verify your Aadhaar and PAN — no uploads needed. Documents are fetched directly from the government database.
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "6px" }}>
                        🔒 Your data is accessed read-only and encrypted at rest. Alternatively, upload documents manually below.
                    </div>
                </div>
                <Button
                    variant="primary"
                    aria-label="Connect to DigiLocker for instant government ID verification"
                    aria-busy={isConnectingDigiLocker}
                    onClick={handleDigiLockerConnect}
                    disabled={isConnectingDigiLocker}
                    style={{
                        background: "linear-gradient(135deg, #16a34a, #22c55e)",
                        border: "none",
                        whiteSpace: "nowrap",
                        minWidth: "180px",
                    }}
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
                        ✅ {isBrand ? "Unlocked" : "Unlimited — All campaigns"}
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
                        {getTierUpgradeActionText(tier, isBrand)}
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
                            Upload <strong>any one</strong> business document to unlock unlimited campaigns
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
                💡 You only need <strong>one</strong> of the documents below to unlock the unlimited tier.
            </div>
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                }}
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
            style={{
                display: "flex",
                flexDirection: "column",
                gap: "24px",
                maxWidth: "900px",
            }}
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
                🛡️ <strong>Security:</strong> All documents are encrypted and reviewed by our compliance team within 1–2 business days. They are never shared with third parties without your consent.
            </div>

            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: "none" }}
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
                            {getTierIcon(tier)}
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
                        {getMonthlyLimitText(isUnlimited, tier, tierLimit)}
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
                        {trustScore}
                        /900
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
                            width: `${Math.min(100, Math.max(0, (trustScore / 900) * 100))}%`,
                            height: "100%",
                            background: `linear-gradient(90deg, ${tierColors[tier]}, #10b981)`,
                            borderRadius: "999px",
                            transition: "width 0.6s",
                        }}
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
                ].map((item) => (
                    <div
                        key={item.label}
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
    );
}
