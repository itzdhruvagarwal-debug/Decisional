"use client";

import { Button } from "@/components/ui";
import {
    getTierIcon,
    getMonthlyLimitText,
    getTierUpgradeActionText,
} from "./VerificationHelpers";

interface DigiLockerCardProps {
    readonly isConnectingDigiLocker: boolean;
    readonly handleDigiLockerConnect: () => void;
}

export function DigiLockerCardComponent({
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
                <div className="flex-1 min-w-200">
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
                    className="border-none whitespace-nowrap min-w-180 bg-gradient-green"
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

export function Tier1CardComponent({ tier, renderDocRow }: Omit<TierCardProps, "isBrand">) {
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
                        className="flex items-center justify-center rounded-full w-30 h-30 bg-indigo-12"
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
                        className="font-bold text-xs rounded-2xl px-2-py-1 text-indigo bg-indigo-10"
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

export function Tier2CardComponent({ tier, isBrand, renderDocRow }: TierCardProps) {
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
                        className="flex items-center justify-center rounded-full w-30 h-30 bg-amber-12"
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
                        className="font-bold text-xs text-amber rounded-2xl px-2-py-1 bg-amber-subtle"
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

export function Tier3CardComponent({ tier, renderDocRow }: Omit<TierCardProps, "isBrand">) {
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
                        className="flex items-center justify-center rounded-full w-30 h-30" style={{ background: "rgba(16, 185, 129, 0.12)" }}
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
                className="text-xs text-secondary mb-3 rounded-sm px-3-py-2 bg-emerald-06"
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

interface TierStatusCardProps {
    readonly tier: number;
    readonly tierColors: string[];
    readonly isUnlimited: boolean;
    readonly tierLimit: number | null;
    readonly tierDesc: string;
    readonly trustScore: number;
}

export function TierStatusCardComponent({
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
                    className="flex justify-between mb-1"
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
                    className="overflow-hidden bg-tertiary rounded-full h-6"
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

export function Step1MandatoryCardComponent({
    emailVerified,
    phoneVerified,
}: Step1MandatoryCardProps) {
    return (
        <div className="card">
            <div
                className="flex items-center gap-2-5 mb-3"
            >
                <div
                    className="flex items-center justify-center rounded-full w-30 h-30 bg-indigo-12"
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
                                className="text-xs font-semibold text-amber rounded-2xl px-2-py-1 bg-amber-subtle"
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
