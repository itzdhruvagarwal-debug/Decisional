"use client";

import { Button } from "@/components/ui";

interface StatusBadgeProps {
    doc?: { status: string; rejectionReason?: string | null } | null | undefined;
}

export function StatusBadge({ doc }: Readonly<StatusBadgeProps>) {
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

export function UploadBtn({
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

export function DocRow({
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

export function getTierIcon(tier: number) {
    if (tier === 0) return "🔒";
    if (tier === 1) return "🥉";
    if (tier === 2) return "🥈";
    return "🥇";
}

export function getMonthlyLimitText(isUnlimited: boolean, tier: number, tierLimit: number | null) {
    if (isUnlimited) return "∞ Unlimited";
    if (tier === 0) return "Locked";
    if (tierLimit) return `₹${(tierLimit / 100).toLocaleString("en-IN")}`;
    return "—";
}

export function getTierUpgradeActionText(tier: number, isBrand: boolean) {
    if (tier < 1) return "🔒 Complete Tier 1 first";
    if (isBrand) return "📋 Upload to unlock ₹1L limit";
    return "🚀 Upload to unlock unlimited campaigns";
}
