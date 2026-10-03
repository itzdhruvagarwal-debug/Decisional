"use client";

import React, { useMemo } from "react";
import Image from "next/image";
import { type DashboardCampaign as Campaign } from "@/lib/schemas";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils-client";
import {
  ShieldCheck,
  Clock,
  Users,
  ArrowRight,
  Lock,
  Star,
  CheckCircle2,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Badge, Button } from "@/components/ui";

interface CampaignDiscoveryCardProps {
  campaign: Campaign;
  isBrand: boolean;
  isApplied?: boolean;
  listView?: boolean;
  isRecommended?: boolean;
}

const deliverableLabels: Record<string, string> = {
  INSTAGRAM_POST: "IG Post",
  INSTAGRAM_REEL: "IG Reel",
  INSTAGRAM_STORY: "IG Story",
  YOUTUBE_VIDEO: "YT Video",
  YOUTUBE_SHORT: "YT Short",
  TWITTER_POST: "X Post",
  LINKEDIN_POST: "LinkedIn",
};

export function CampaignDiscoveryCard({
  campaign,
  isBrand,
  isApplied,
  listView = false,
  isRecommended = false,
}: Readonly<CampaignDiscoveryCardProps>) {
  const maxInfluencers = campaign.maxInfluencers ?? 0;
  const acceptedCount = campaign.acceptedCount ?? 0;
  const fillPercentage =
    maxInfluencers > 0 ? Math.min(100, Math.round((acceptedCount / maxInfluencers) * 100)) : 0;
  const remainingSlots = maxInfluencers > 0 ? Math.max(0, maxInfluencers - acceptedCount) : null;
  const isSlotsUrgent = fillPercentage >= 80 && remainingSlots !== null && remainingSlots > 0;

  const daysLeft = useMemo(() => {
    if (!campaign.postingDeadline) return null;
    const due = new Date(campaign.postingDeadline).getTime();
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    return Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  }, [campaign.postingDeadline]);

  const isDeadlineUrgent = daysLeft !== null && daysLeft > 0 && daysLeft <= 3;

  if (listView) {
    /* ── LIST VIEW (horizontal compact row) ───────────────────────── */
    return (
      <article
        className={`rounded-2xl border p-4 shadow-sm transition-all flex items-center justify-between gap-4 group ${
          isApplied
            ? "border-verified/50 bg-card hover:border-verified"
            : isRecommended
            ? "border-primary/30 bg-card hover:border-primary/60"
            : "border-border bg-card hover:border-primary/40"
        }`}
      >
        {/* Left: Logo + info */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-muted border border-border shrink-0 flex items-center justify-center text-foreground font-bold text-sm">
            {campaign.brand.logo ? (
              <Image
                src={campaign.brand.logo}
                alt={campaign.brand.companyName}
                fill
                className="object-cover"
              />
            ) : (
              <span>{campaign.brand.companyName.slice(0, 2).toUpperCase()}</span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            {/* Verified brand badge */}
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-xs font-semibold text-foreground/90 truncate max-w-[120px]">
                {campaign.brand.companyName}
              </span>
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-verified bg-verified-muted px-1.5 py-0.5 rounded-md border border-verified-border shrink-0">
                <ShieldCheck className="w-2.5 h-2.5" /> Verified
              </span>
              {campaign.brand.avgRating > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-pending shrink-0">
                  <Star className="w-3 h-3 fill-current" />
                  {campaign.brand.avgRating.toFixed(1)}
                </span>
              )}
            </div>
            <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">
              {campaign.title}
            </h3>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {campaign.deliverables.slice(0, 2).map((item, index) => (
                <Badge
                  key={`${campaign.id}-del-${index}`}
                  variant="primary"
                  className="text-[10px] font-bold py-0.5 px-2"
                >
                  {item.count}× {deliverableLabels[item.type] || item.type.replaceAll("_", " ")}
                </Badge>
              ))}
              {(isSlotsUrgent || isDeadlineUrgent) && (
                <>
                  {isSlotsUrgent && (
                    <span className="text-[10px] font-bold text-pending">🔥 {remainingSlots} slots</span>
                  )}
                  {isDeadlineUrgent && (
                    <span className="text-[10px] font-bold text-disputed">⏰ {daysLeft}d left</span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Budget + deadline + CTA */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="text-right hidden sm:block">
            <div className="text-xs text-muted-foreground">Budget</div>
            <div className="text-base font-extrabold font-mono tabular-nums text-foreground">
              {formatCurrency(campaign.perInfluencerBudget)}
            </div>
          </div>
          <div className="text-right hidden md:block">
            <div className="text-xs text-muted-foreground">Due</div>
            <div className={`text-xs font-semibold ${isDeadlineUrgent ? "text-disputed" : "text-foreground"}`}>
              {formatDate(campaign.postingDeadline)}
            </div>
          </div>
          {isBrand && (
            <Button
              href={`/dashboard/campaigns/${campaign.id}/roi`}
              variant="secondary"
              size="sm"
              className="font-bold text-xs gap-1 shadow-2xs hidden sm:inline-flex"
              aria-label={`View ROI report for ${campaign.title}`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-primary" />
              ROI
            </Button>
          )}
          <Button
            href={`/dashboard/campaigns/${campaign.id}`}
            variant={isApplied ? "secondary" : "primary"}
            size="sm"
            className="font-bold text-xs gap-1 shadow-sm"
            aria-label={`View brief for ${campaign.title}`}
          >
            {isApplied ? "View" : isBrand ? "Manage" : "View Brief"}
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </article>
    );
  }

  /* ── GRID VIEW (default card) ──────────────────────────────────── */
  return (
    <article
      className={`rounded-2xl border p-5 shadow-sm transition-all flex flex-col justify-between group relative overflow-hidden ${
        isApplied
          ? "border-verified/50 bg-card hover:border-verified"
          : isRecommended
          ? "border-primary/25 bg-card hover:border-primary/50"
          : "border-border bg-card hover:border-primary/50"
      }`}
    >
      {/* Recommended glow accent */}
      {isRecommended && !isApplied && (
        <div className="absolute top-0 right-0 flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary text-[10px] font-bold border-b border-l border-primary/20 rounded-bl-xl rounded-tr-2xl">
          <Sparkles className="w-3 h-3" /> Top Match
        </div>
      )}

      <div className="space-y-3.5">
        {/* Top: Brand Info & Budget */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-muted border border-border shrink-0 flex items-center justify-center text-foreground font-bold text-sm">
              {campaign.brand.logo ? (
                <Image
                  src={campaign.brand.logo}
                  alt={campaign.brand.companyName}
                  fill
                  className="object-cover"
                />
              ) : (
                <span>{campaign.brand.companyName.slice(0, 2).toUpperCase()}</span>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground">
                <span className="font-semibold text-foreground/90 truncate max-w-[110px]">
                  {campaign.brand.companyName}
                </span>
                {campaign.brand.avgRating > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-pending">
                    <Star className="w-3 h-3 fill-current" />
                    {campaign.brand.avgRating.toFixed(1)}
                  </span>
                )}
              </div>
              {/* Verified Brand badge */}
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-verified bg-verified-muted px-1.5 py-0.5 rounded-md border border-verified-border mt-0.5">
                <ShieldCheck className="w-2.5 h-2.5" /> Verified Brand
              </span>
            </div>
          </div>

          <div className="text-right shrink-0 flex flex-col items-end gap-1">
            {isApplied && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-verified text-primary-foreground shadow-xs">
                <CheckCircle2 className="w-3 h-3" /> Applied
              </span>
            )}
            <div>
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Budget
              </div>
              <div className="text-base sm:text-lg font-extrabold font-mono tabular-nums text-foreground">
                {formatCurrency(campaign.perInfluencerBudget)}
              </div>
            </div>
          </div>
        </div>

        {/* Campaign Title & Description */}
        <div>
          <h3 className="text-sm sm:text-base font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
            {campaign.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed min-h-[32px]">
            {campaign.description || "Exciting brand collaboration with escrow protected milestone payouts."}
          </p>
        </div>

        {/* Deliverables & Category Tags */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {campaign.deliverables.slice(0, 3).map((item, index) => (
            <Badge
              key={`${campaign.id}-del-${index}`}
              variant="primary"
              className="text-[10px] font-bold py-0.5 px-2"
            >
              {item.count}× {deliverableLabels[item.type] || item.type.replaceAll("_", " ")}
            </Badge>
          ))}
          {campaign.targetCategories.slice(0, 2).map((category) => (
            <span
              key={`${campaign.id}-${category}`}
              className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border/50"
            >
              {category}
            </span>
          ))}
        </div>

        {/* Urgency badges */}
        {(isSlotsUrgent || isDeadlineUrgent) && (
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            {isSlotsUrgent && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-pending-muted text-pending border border-pending-border">
                🔥 {remainingSlots} {remainingSlots === 1 ? "slot" : "slots"} left
              </span>
            )}
            {isDeadlineUrgent && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-disputed-muted text-disputed border border-disputed-border">
                ⏰ {daysLeft === 1 ? "Ends today" : `${daysLeft} days left`}
              </span>
            )}
          </div>
        )}

        {/* Telemetry Metrics & Slot Progress */}
        <div className="rounded-xl border border-border/70 bg-muted/30 p-3 space-y-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[10px] font-medium text-muted-foreground">Followers</div>
              <div className="text-xs font-extrabold text-foreground font-mono tabular-nums">
                {campaign.minFollowers > 0 ? `${formatNumber(campaign.minFollowers)}+` : "Open"}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-medium text-muted-foreground">
                <Users className="w-3 h-3 inline mr-0.5" />
                Applied
              </div>
              <div className="text-xs font-extrabold text-foreground font-mono tabular-nums">
                {campaign.totalApplications}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-medium text-muted-foreground">
                <Lock className="w-3 h-3 inline mr-0.5" />
                Slots
              </div>
              <div className="text-xs font-extrabold text-foreground font-mono tabular-nums">
                {maxInfluencers > 0 ? `${acceptedCount}/${maxInfluencers}` : "Open"}
              </div>
            </div>
          </div>

          {maxInfluencers > 0 && (
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Slots Filled</span>
                <span className={`font-semibold ${isSlotsUrgent ? "text-pending font-bold" : ""}`}>
                  {isSlotsUrgent ? `🔥 Only ${remainingSlots} left (${fillPercentage}%)` : `${fillPercentage}%`}
                </span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isSlotsUrgent ? "bg-pending" : "bg-primary"
                  }`}
                  style={{ width: `${fillPercentage}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer: Deadline & CTA */}
      <div className="pt-4 border-t border-border mt-4 flex items-center justify-between gap-3">
        <div className={`flex items-center gap-1.5 text-xs ${isDeadlineUrgent ? "text-disputed font-semibold" : "text-muted-foreground"}`}>
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>
            {isDeadlineUrgent
              ? `Due ${formatDate(campaign.postingDeadline)} (Closing Soon)`
              : `Due ${formatDate(campaign.postingDeadline)}`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isBrand && (
            <Button
              href={`/dashboard/campaigns/${campaign.id}/roi`}
              variant="secondary"
              size="sm"
              className="font-bold text-xs gap-1 shadow-2xs"
              aria-label={`View ROI report for ${campaign.title}`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-primary" />
              ROI
            </Button>
          )}
          <Button
            href={`/dashboard/campaigns/${campaign.id}`}
            variant={isApplied ? "secondary" : "primary"}
            size="sm"
            className="font-bold text-xs gap-1 shadow-sm"
            aria-label={`View brief for ${campaign.title}`}
          >
            {isApplied ? "View Application" : isBrand ? "Manage Brief" : "View Brief"}
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </article>
  );
}
