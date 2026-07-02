"use client";

import { useState, useRef } from "react";
import type { User } from "./ProfileTab";

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

export default function VerificationTab({
    user,
    verificationData,
    setVerificationData,
    showToast,
}: VerificationTabProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
                showToast("Document uploaded! Verification pending.", "success");
                // Refresh data
                const refresh = await fetch("/api/verification");
                const newData = await refresh.json();
                setVerificationData(newData);
            } else {
                showToast(data.error || "Upload failed", "error");
            }
        } catch (error) {
            console.error("[verification-tab] Failed to upload document:", error);
            showToast("An error occurred", "error");
        } finally {
            setIsUploading(false);
            setUploadingDocType(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

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
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                gap: "24px",
                maxWidth: "900px",
            }}
        >
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
                            {verificationData.trustScore || 600}
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
                                width: `${Math.min(100, Math.max(0, ((verificationData.trustScore || 600) / 900) * 100))}%`,
                                height: "100%",
                                background: `linear-gradient(90deg, ${tierColors[tier]}, #10b981)`,
                                borderRadius: "999px",
                                transition: "width 0.6s",
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Step 1: Email + Phone — MANDATORY */}
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
