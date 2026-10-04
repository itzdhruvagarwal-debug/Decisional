"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import { Modal } from "@/components/ui";
import { Button } from "@/components/ui";
import { copyToClipboard } from "@/lib/clipboard";
import {
  Download,
  Share2,
  Copy,
  CheckCheck,
  Sparkles,
  ShieldCheck,
  QrCode,
  Smartphone,
  ExternalLink,
  Camera,
  ArrowRight,
  Layers,
  Award,
} from "lucide-react";

export interface StoryShareModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly defaultTab?: "profile" | "referral" | undefined;
  readonly profile?: {
    readonly displayName: string;
    readonly username?: string | undefined;
    readonly avatar?: string | null | undefined;
    readonly trustScore?: number | undefined;
    readonly categories?: string[] | undefined;
    readonly city?: string | null | undefined;
    readonly completedDealsCount?: number | undefined;
    readonly isKycVerified?: boolean | undefined;
  } | undefined;
  readonly referralCode?: string | undefined;
}

export default function StoryShareModal({
  open,
  onClose,
  defaultTab = "profile",
  profile,
  referralCode,
}: Readonly<StoryShareModalProps>) {
  // Determine available tabs
  const hasProfile = Boolean(profile?.displayName);
  const hasReferral = Boolean(referralCode);

  const initialTab =
    defaultTab === "referral" && hasReferral
      ? "referral"
      : hasProfile
      ? "profile"
      : "referral";

  const [activeTab, setActiveTab] = useState<"profile" | "referral">(initialTab);
  const [profileQr, setProfileQr] = useState<string>("");
  const [referralQr, setReferralQr] = useState<string>("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Compute URLs
  const origin = typeof window !== "undefined" ? window.location.origin : "https://vyaparmedia.com";
  const profileUsername = profile?.username || "creator";
  const profileUrl = `${origin}/creator/${encodeURIComponent(profileUsername)}`;
  const referralUrl = referralCode ? `${origin}/register?ref=${encodeURIComponent(referralCode)}` : "";

  const activeUrl = activeTab === "profile" ? profileUrl : referralUrl;

  // Generate QR codes on mount or when URLs change
  useEffect(() => {
    let isMounted = true;

    async function generateQRs() {
      try {
        if (profileUrl) {
          const pQr = await QRCode.toDataURL(profileUrl, {
            margin: 1,
            width: 320,
            color: {
              dark: "#0F172A",
              light: "#FFFFFF",
            },
          });
          if (isMounted) setProfileQr(pQr);
        }

        if (referralUrl) {
          const rQr = await QRCode.toDataURL(referralUrl, {
            margin: 1,
            width: 320,
            color: {
              dark: "#0F172A",
              light: "#FFFFFF",
            },
          });
          if (isMounted) setReferralQr(rQr);
        }
      } catch (err) {
        console.error("Failed to generate QR code", err);
      }
    }

    if (open) {
      generateQRs();
    }

    return () => {
      isMounted = false;
    };
  }, [open, profileUrl, referralUrl]);

  // Handle Copy Link
  const handleCopyLink = useCallback(async () => {
    if (!activeUrl) return;
    await copyToClipboard(activeUrl);
    setCopiedLink(true);
    setFeedbackMessage("Link copied! Paste in Instagram's 'Link' sticker.");
    setTimeout(() => {
      setCopiedLink(false);
      setFeedbackMessage(null);
    }, 3500);
  }, [activeUrl]);

  // Render Story onto high-res 1080x1920 HTML5 Canvas
  const drawStoryCanvas = useCallback(async (): Promise<HTMLCanvasElement | null> => {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // 1. Background gradient (Deep OLED Slate with subtle indigo vibe)
    const bgGradient = ctx.createLinearGradient(0, 0, 1080, 1920);
    bgGradient.addColorStop(0, "#080B11");
    bgGradient.addColorStop(0.35, "#0E1322");
    bgGradient.addColorStop(0.7, "#11172A");
    bgGradient.addColorStop(1, "#07090F");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, 1080, 1920);

    // 2. Ambient Glow orbs for rich depth
    const glow1 = ctx.createRadialGradient(200, 300, 10, 200, 300, 600);
    glow1.addColorStop(0, "rgba(59, 130, 246, 0.22)");
    glow1.addColorStop(1, "rgba(59, 130, 246, 0)");
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, 1080, 1000);

    const glow2 = ctx.createRadialGradient(880, 1600, 10, 880, 1600, 650);
    glow2.addColorStop(0, activeTab === "profile" ? "rgba(34, 197, 94, 0.18)" : "rgba(168, 85, 247, 0.20)");
    glow2.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 1000, 1080, 920);

    // 3. Platform Brand Header
    ctx.textAlign = "center";
    ctx.fillStyle = "#38BDF8";
    ctx.font = "bold 32px sans-serif";
    ctx.letterSpacing = "6px";
    ctx.fillText("VYAPARMEDIA", 540, 160);

    // Header sub-pill
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    roundRect(ctx, 330, 190, 420, 52, 26);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "#E2E8F0";
    ctx.font = "600 22px sans-serif";
    ctx.letterSpacing = "1px";
    ctx.fillText(
      activeTab === "profile" ? "🛡️ 100% ESCROW PROTECTED" : "🎁 EXCLUSIVE PARTNER INVITE",
      540,
      224
    );

    // 4. Central Hero Card
    ctx.fillStyle = "rgba(18, 24, 38, 0.85)";
    roundRect(ctx, 90, 290, 900, 1340, 48);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 2;
    ctx.stroke();

    if (activeTab === "profile") {
      // ── PROFILE STORY CARD ──
      // Avatar placeholder or image
      const avatarSize = 220;
      const avatarX = 540;
      const avatarY = 460;

      // Draw avatar ring
      const ringGrad = ctx.createLinearGradient(avatarX - 120, avatarY - 120, avatarX + 120, avatarY + 120);
      ringGrad.addColorStop(0, "#3B82F6");
      ringGrad.addColorStop(0.5, "#8B5CF6");
      ringGrad.addColorStop(1, "#10B981");
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, avatarSize / 2 + 8, 0, Math.PI * 2);
      ctx.strokeStyle = ringGrad;
      ctx.lineWidth = 6;
      ctx.stroke();

      // Draw avatar base
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = "#1E293B";
      ctx.fill();

      // Monogram initials
      const initials = (profile?.displayName || "Creator")
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
      ctx.fillStyle = "#F8FAFC";
      ctx.font = "bold 80px sans-serif";
      ctx.letterSpacing = "0px";
      ctx.fillText(initials, avatarX, avatarY + 30);

      // Creator Name
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 64px sans-serif";
      const name = profile?.displayName || "Verified Creator";
      ctx.fillText(name.length > 20 ? name.slice(0, 19) + "…" : name, 540, 640);

      // Handle
      ctx.fillStyle = "#94A3B8";
      ctx.font = "500 36px sans-serif";
      ctx.fillText(`@${profileUsername}`, 540, 695);

      // Trust Score Badge Pill
      ctx.fillStyle = "rgba(34, 197, 94, 0.15)";
      roundRect(ctx, 240, 735, 600, 72, 36);
      ctx.fill();
      ctx.strokeStyle = "rgba(34, 197, 94, 0.4)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#4ADE80";
      ctx.font = "bold 30px sans-serif";
      const trustScore = profile?.trustScore || 850;
      ctx.fillText(`⭐️ ${trustScore}/900 DRS Trust Score`, 540, 782);

      // Categories Pill
      if (profile?.categories && profile.categories.length > 0) {
        ctx.fillStyle = "#CBD5E1";
        ctx.font = "500 28px sans-serif";
        ctx.fillText(profile.categories.slice(0, 3).join(" • "), 540, 850);
      }

      // Separator line
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(180, 890);
      ctx.lineTo(900, 890);
      ctx.stroke();

      // QR Code Box
      if (profileQr) {
        const qrImg = await loadImage(profileQr);
        if (qrImg) {
          ctx.fillStyle = "#FFFFFF";
          roundRect(ctx, 360, 940, 360, 360, 32);
          ctx.fill();
          ctx.drawImage(qrImg, 380, 960, 320, 320);
        }
      }

      // QR CTA Text
      ctx.fillStyle = "#F8FAFC";
      ctx.font = "bold 36px sans-serif";
      ctx.fillText("Scan to View Rate Card & Media Kit", 540, 1370);

      ctx.fillStyle = "#94A3B8";
      ctx.font = "400 28px sans-serif";
      ctx.fillText("Direct brand collaborations • Zero broker fees", 540, 1420);

      // Guaranteed badge
      ctx.fillStyle = "#38BDF8";
      ctx.font = "600 26px sans-serif";
      ctx.fillText("🔒 100% Escrow Guaranteed Payments", 540, 1530);
    } else {
      // ── REFERRAL STORY CARD ──
      // Hero Header
      ctx.fillStyle = "#F8FAFC";
      ctx.font = "bold 56px sans-serif";
      ctx.fillText("Join My Creator Network", 540, 430);

      ctx.fillStyle = "#94A3B8";
      ctx.font = "400 32px sans-serif";
      ctx.fillText("Get exclusive brand deal access on VyaparMedia", 540, 485);

      // Referral Code Prominent Box
      ctx.fillStyle = "rgba(37, 99, 235, 0.15)";
      roundRect(ctx, 190, 540, 700, 200, 36);
      ctx.fill();
      ctx.strokeStyle = "rgba(59, 130, 246, 0.5)";
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = "#93C5FD";
      ctx.font = "bold 26px sans-serif";
      ctx.letterSpacing = "2px";
      ctx.fillText("USE INVITE CODE AT SIGNUP", 540, 600);

      ctx.fillStyle = "#FFFFFF";
      ctx.font = "900 76px monospace";
      ctx.letterSpacing = "6px";
      ctx.fillText(referralCode || "VYAPAR", 540, 685);

      // Value Perks List
      const perks = [
        "✦  0% Platform Fee on your first 3 deals",
        "✦  Instant Verified Creator Badge & Priority KYC",
        "✦  100% Escrow-Secured Advance Payouts",
      ];
      ctx.textAlign = "left";
      ctx.font = "600 30px sans-serif";
      ctx.fillStyle = "#E2E8F0";
      perks.forEach((p, idx) => {
        ctx.fillText(p, 230, 810 + idx * 56);
      });
      ctx.textAlign = "center";

      // Separator
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(180, 990);
      ctx.lineTo(900, 990);
      ctx.stroke();

      // QR Code Box
      if (referralQr) {
        const qrImg = await loadImage(referralQr);
        if (qrImg) {
          ctx.fillStyle = "#FFFFFF";
          roundRect(ctx, 360, 1030, 360, 360, 32);
          ctx.fill();
          ctx.drawImage(qrImg, 380, 1050, 320, 320);
        }
      }

      // QR CTA Text
      ctx.fillStyle = "#F8FAFC";
      ctx.font = "bold 36px sans-serif";
      ctx.fillText("Scan to Claim Joining Bonus", 540, 1460);

      ctx.fillStyle = "#94A3B8";
      ctx.font = "400 28px sans-serif";
      ctx.fillText("Or tap the Link Sticker below to get started", 540, 1510);
    }

    // 5. Instagram Link Sticker Simulation (at bottom)
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, 220, 1710, 640, 84, 42);
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#0F172A";
    ctx.font = "bold 32px sans-serif";
    ctx.letterSpacing = "0px";
    const stickerText =
      activeTab === "profile"
        ? `🔗 vyaparmedia.com/creator/${profileUsername}`
        : `🔗 vyaparmedia.com/register?ref=${referralCode || ""}`;
    ctx.fillText(
      stickerText.length > 36 ? stickerText.slice(0, 35) + "…" : stickerText,
      540,
      1762
    );

    ctx.fillStyle = "#94A3B8";
    ctx.font = "500 24px sans-serif";
    ctx.fillText("👆 Add Instagram 'Link' sticker here", 540, 1835);

    return canvas;
  }, [activeTab, profile, profileUsername, referralCode, profileQr, referralQr]);

  // Helper to load image
  function loadImage(src: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // Rounded rectangle helper for 2D Canvas
  function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Handle Download Story Image
  const handleDownloadStory = async () => {
    try {
      setIsGeneratingImage(true);
      const canvas = await drawStoryCanvas();
      if (!canvas) return;

      const dataUrl = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      const filename =
        activeTab === "profile"
          ? `vyaparmedia-profile-${profileUsername}-story.png`
          : `vyaparmedia-referral-${referralCode || "invite"}-story.png`;

      downloadLink.href = dataUrl;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      // Also copy link automatically for convenience
      if (activeUrl) {
        await copyToClipboard(activeUrl);
        setFeedbackMessage("Story Card downloaded! Link also copied to clipboard for your story sticker.");
        setTimeout(() => setFeedbackMessage(null), 4000);
      }
    } catch (err) {
      console.error("Story download failed", err);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Handle Native Share (Web Share API with image file if supported)
  const handleNativeShare = async () => {
    try {
      setIsGeneratingImage(true);
      const canvas = await drawStoryCanvas();
      if (!canvas) return;

      const title =
        activeTab === "profile"
          ? `${profile?.displayName || "Creator"} on VyaparMedia`
          : "Join VyaparMedia with my invite";

      const text =
        activeTab === "profile"
          ? `Check out my verified creator portfolio, rates & trust score on VyaparMedia! All deals protected with 100% Escrow: ${activeUrl}`
          : `Join India's top brand-influencer deal platform! Use my code ${referralCode} to get 0% platform fees on your first 3 deals: ${activeUrl}`;

      // Try file sharing if supported
      if (canvas.toBlob && navigator.canShare) {
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          const file = new File(
            [blob],
            activeTab === "profile" ? "vyaparmedia-profile-story.png" : "vyaparmedia-referral-story.png",
            { type: "image/png" }
          );

          if (navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({
                files: [file],
                title,
                text,
              });
              return;
            } catch {
              // User cancelled share
            }
          }

          // Fallback to text & url share
          if (navigator.share) {
            try {
              await navigator.share({ title, text, url: activeUrl });
            } catch {
              // cancelled
            }
          }
        }, "image/png");
      } else if (navigator.share) {
        await navigator.share({ title, text, url: activeUrl });
      }
    } catch (err) {
      console.error("Native share error", err);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Multi-platform Story & Social Share URLs
  const platformShareText =
    activeTab === "profile"
      ? `Check out my verified creator portfolio, rates & trust score on VyaparMedia! (100% Escrow Protected):`
      : `Join India's top brand-influencer deal platform! Use my invite code ${referralCode || ""} to claim 0% platform fees on your first 3 deals:`;

  const whatsAppStatusText =
    activeTab === "profile"
      ? `Check out my verified creator portfolio, rate card & DRS trust score on VyaparMedia:\n\n${activeUrl}\n\n(100% Escrow Protected Collaborations)`
      : `Join India's leading creator & brand deal network!\n\nUse my invite code ${referralCode || ""} to unlock 0% platform fees on your first 3 deals:\n\n${activeUrl}`;

  const whatsAppUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsAppStatusText)}`;
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(activeUrl)}&quote=${encodeURIComponent(platformShareText)}`;
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(activeUrl)}&text=${encodeURIComponent(platformShareText)}`;
  const twitterUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(platformShareText)}&url=${encodeURIComponent(activeUrl)}`;
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(activeUrl)}`;
  const threadsUrl = `https://www.threads.net/intent/post?text=${encodeURIComponent(platformShareText + " " + activeUrl)}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-foreground">Post to Instagram, Facebook &amp; WhatsApp Story</h2>
            <p className="text-[11px] text-muted-foreground font-normal">
              Share your 9:16 vertical card with verified QR &amp; link sticker
            </p>
          </div>
        </div>
      }
      maxWidth="780px"
    >
      <div className="space-y-5 pt-1">
        {/* Tab Switcher (if both profile & referral are accessible) */}
        {hasProfile && hasReferral && (
          <div className="flex items-center p-1 rounded-xl bg-muted/60 border border-border">
            <button
              type="button"
              onClick={() => setActiveTab("profile")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === "profile"
                  ? "bg-card text-foreground shadow-xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Award className="w-3.5 h-3.5 text-verified" />
              <span>Public Profile Story</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("referral")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === "referral"
                  ? "bg-card text-foreground shadow-xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>Referral &amp; Invite Story</span>
            </button>
          </div>
        )}

        {/* Feedback message banner */}
        {feedbackMessage && (
          <div className="p-3 rounded-xl bg-verified-muted border border-verified-border text-verified text-xs font-semibold flex items-center gap-2 animate-in fade-in">
            <CheckCheck className="w-4 h-4 shrink-0" />
            <span>{feedbackMessage}</span>
          </div>
        )}

        {/* Main Grid: 9:16 Story Card Preview (Left) + Actions & Instructions (Right) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
          {/* Story Card Phone Mockup Preview */}
          <div className="md:col-span-5 flex justify-center">
            <div className="relative w-full max-w-[270px] aspect-[9/16] rounded-3xl p-3.5 bg-gradient-to-b from-[#090C14] via-[#0F1424] to-[#080B12] border-2 border-border shadow-2xl flex flex-col justify-between overflow-hidden text-center select-none">
              {/* Ambient Glow in preview */}
              <div className="absolute -top-10 -left-10 w-32 h-32 bg-primary/25 rounded-full blur-2xl pointer-events-none" />
              <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-verified/20 rounded-full blur-2xl pointer-events-none" />

              {/* Story Top Bar */}
              <div className="relative z-10 pt-1 space-y-1">
                <div className="text-[10px] font-extrabold tracking-widest text-primary uppercase">
                  VYAPARMEDIA
                </div>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-card/40 border border-border text-[9px] font-medium text-foreground shrink-0 whitespace-nowrap">
                  {activeTab === "profile" ? "🛡️ Escrow Verified" : "🎁 Partner Invite"}
                </div>
              </div>

              {/* Center Card Content */}
              <div className="relative z-10 py-2 space-y-2">
                {activeTab === "profile" ? (
                  <>
                    <div className="mx-auto w-14 h-14 rounded-full p-0.5 bg-gradient-to-tr from-primary via-purple-500 to-verified flex items-center justify-center">
                      <div className="w-full h-full rounded-full bg-muted flex items-center justify-center text-foreground text-base font-bold">
                        {(profile?.displayName || "C")[0]?.toUpperCase()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-foreground truncate px-2">
                        {profile?.displayName || "Creator Profile"}
                      </div>
                      <div className="text-[10px] text-muted-foreground">@{profileUsername}</div>
                    </div>

                    <div className="inline-block px-2.5 py-1 rounded-full bg-verified/15 border border-verified/30 text-[9px] font-bold text-verified shrink-0 whitespace-nowrap">
                      ⭐️ {profile?.trustScore || 850} DRS Score
                    </div>

                    {/* QR Preview */}
                    {profileQr && (
                      <div className="mx-auto w-24 h-24 p-1.5 bg-card border border-border rounded-xl shadow-md">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={profileQr} alt="Profile QR" className="w-full h-full object-contain" />
                      </div>
                    )}
                    <div className="text-[9px] font-semibold text-muted-foreground">
                      Scan to view rate card &amp; portfolio
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-xs font-extrabold text-foreground">Join My Creator Network</div>
                    <div className="text-[9px] text-muted-foreground">Brand collabs with 100% Escrow</div>

                    {/* Code Badge */}
                    <div className="p-2 rounded-xl bg-primary/20 border border-primary/40 space-y-0.5">
                      <div className="text-[8px] font-bold tracking-wider text-primary uppercase">
                        INVITE CODE
                      </div>
                      <div className="font-mono text-sm font-black text-foreground tracking-wider">
                        {referralCode || "VYAPAR"}
                      </div>
                    </div>

                    {/* QR Preview */}
                    {referralQr && (
                      <div className="mx-auto w-24 h-24 p-1.5 bg-card border border-border rounded-xl shadow-md">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={referralQr} alt="Referral QR" className="w-full h-full object-contain" />
                      </div>
                    )}
                    <div className="text-[9px] font-semibold text-muted-foreground">
                      Scan to claim 0% fee perks
                    </div>
                  </>
                )}
              </div>

              {/* Bottom Link Sticker Preview */}
              <div className="relative z-10 pb-1">
                <div className="mx-auto max-w-[200px] py-1.5 px-3 rounded-full bg-card text-foreground border border-border shadow-lg text-[9px] font-bold flex items-center justify-center gap-1 shrink-0 whitespace-nowrap truncate">
                  <span>🔗</span>
                  <span className="truncate">
                    {activeTab === "profile" ? `creator/${profileUsername}` : `register?ref=${referralCode}`}
                  </span>
                </div>
                <div className="text-[8px] text-muted-foreground mt-1">Tap to open directly</div>
              </div>
            </div>
          </div>

          {/* Action Tools & Posting Instructions (Right Side) */}
          <div className="md:col-span-7 space-y-4">
            {/* Story Link Sticker Box */}
            <div className="p-3.5 rounded-2xl bg-muted/40 border border-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Story Link Sticker URL
                </span>
                <span className="text-[10px] text-primary font-semibold">For Instagram &apos;Link&apos; Sticker</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 p-2 rounded-xl bg-card border border-border text-xs font-mono text-foreground truncate">
                  {activeUrl}
                </div>
                <Button
                  variant={copiedLink ? "secondary" : "primary"}
                  size="sm"
                  onClick={handleCopyLink}
                  aria-label="Copy story sticker link"
                  className="shrink-0 gap-1.5 text-xs font-bold"
                >
                  {copiedLink ? (
                    <>
                      <CheckCheck className="w-3.5 h-3.5 text-verified" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy Link
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Main Action Buttons */}
            <div className="space-y-3">
              <Button
                variant="primary"
                onClick={handleDownloadStory}
                disabled={isGeneratingImage}
                aria-label="Download high-resolution 9:16 story card"
                className="w-full justify-center gap-2 py-2.5 text-sm font-bold shadow-md shadow-primary/20"
              >
                <Download className="w-4 h-4" />
                <span>{isGeneratingImage ? "Generating High-Res Card..." : "Download 9:16 Story Card (PNG)"}</span>
              </Button>

              {/* Direct Social & Story Channels Grid */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Share Directly to Socials &amp; Stories
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {/* WhatsApp Status Button */}
                  <a
                    href={whatsAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border border-verified-border bg-verified-muted text-verified hover:bg-verified/20 font-bold text-xs transition-all text-center"
                  >
                    <span className="text-sm leading-none">💬</span>
                    <span className="truncate">WhatsApp Status</span>
                  </a>

                  {/* Facebook Story / Share */}
                  <a
                    href={facebookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border border-escrow-border bg-escrow-muted text-escrow hover:bg-escrow/20 font-bold text-xs transition-all text-center"
                  >
                    <span className="text-sm leading-none font-black">f</span>
                    <span className="truncate">Facebook Story</span>
                  </a>

                  {/* Telegram */}
                  <a
                    href={telegramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border border-border bg-card hover:bg-muted text-foreground font-bold text-xs transition-all text-center"
                  >
                    <span className="text-sm leading-none">✈️</span>
                    <span className="truncate">Telegram</span>
                  </a>

                  {/* Threads */}
                  <a
                    href={threadsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border border-border bg-card hover:bg-muted text-foreground font-bold text-xs transition-all text-center"
                  >
                    <span className="text-sm leading-none">🧵</span>
                    <span className="truncate">Threads</span>
                  </a>

                  {/* X (Twitter) */}
                  <a
                    href={twitterUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border border-border bg-card hover:bg-muted text-foreground font-bold text-xs transition-all text-center"
                  >
                    <span className="text-sm leading-none font-bold">✕</span>
                    <span className="truncate">X (Twitter)</span>
                  </a>

                  {/* LinkedIn */}
                  <a
                    href={linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border border-border bg-card hover:bg-muted text-foreground font-bold text-xs transition-all text-center"
                  >
                    <span className="text-sm leading-none font-bold">in</span>
                    <span className="truncate">LinkedIn</span>
                  </a>
                </div>
              </div>

              {/* Device Native Share (Instagram, Snapchat, More) */}
              <button
                type="button"
                onClick={handleNativeShare}
                disabled={isGeneratingImage}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-border bg-card hover:bg-muted text-foreground font-bold text-xs transition-all shadow-xs"
              >
                <Share2 className="w-4 h-4 text-primary" />
                <span>Share via System (Snapchat, Instagram, More apps)</span>
              </button>
            </div>

            {/* Quick 3-Step How-To Guide */}
            <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
              <div className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-primary" />
                <span>How to post this on Instagram, Facebook &amp; WhatsApp Story:</span>
              </div>
              <ol className="text-xs text-muted-foreground space-y-2 pl-4 list-decimal leading-relaxed">
                <li>
                  Click <strong>&quot;Download 9:16 Story Card&quot;</strong> (saves directly to your camera roll).
                </li>
                <li>
                  Open <strong>Instagram, Facebook, or WhatsApp</strong> &gt; create a new <strong>Story / Status</strong> &gt; select your downloaded card.
                </li>
                <li>
                  Tap the <strong>Stickers icon (😊)</strong> &gt; select the <strong>&quot;LINK&quot;</strong> sticker (or paste in caption) &gt; paste your copied link!
                </li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
