"use client";

import { Button } from "@/components/ui/Button";

/** Lock icon used for the locked payout step */
function LockIcon() {
  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-2.5 h-2.5"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function InfluencerMockup() {
  return (
    <div className="flex flex-col gap-5">
      {/* Top Stats Row */}
      <div className="grid gap-4 grid-auto-140">
        <div className="mockup-stat bg-glass rounded-lg px-4 py-3">
          <span className="text-muted block text-xs">Wallet Balance</span>
          <span className="text-xl font-extrabold text-white">42,850</span>
        </div>
        <div className="mockup-stat bg-glass rounded-lg px-4 py-3">
          <span className="text-muted block text-xs">Trust Score</span>
          <span className="text-xl font-extrabold text-emerald">
            98% <span className="text-xs font-normal">(Excellent)</span>
          </span>
        </div>
        <div className="mockup-stat bg-glass rounded-lg px-4 py-3">
          <span className="text-muted block text-xs">Gamification Tier</span>
          <span className="text-xl font-extrabold text-amber">Gold IV </span>
        </div>
      </div>

      {/* Active Deal Status */}
      <div className="mockup-section p-4 bg-glass rounded-lg">
        <div className="flex justify-between mb-3">
          <div>
            <h4 className="text-sm font-bold mb-1 text-white">
              Nike India: Air Max Launch
            </h4>
            <span className="text-xs text-secondary">
              Deliverable: 1 Instagram Reel + 1 Story
            </span>
          </div>
          <div className="fit-content inline-flex text-xs font-semibold bg-emerald-subtle text-emerald rounded-sm px-2 py-1">
            25,000 in Escrow
          </div>
        </div>

        {/* Status Stepper */}
        <div className="flex items-center justify-between relative mt-5">
          <div className="mockup-step-line absolute z-0" />
          <div className="mockup-step-line-active absolute bg-color-primary z-0" />

          <div className="flex flex-col items-center relative gap-1.5 z-1">
            <div className="flex items-center justify-center text-xs font-bold rounded-full text-white w-24 h-24 bg-color-primary">
              ✓
            </div>
            <span className="font-semibold text-2xs text-white">Signed</span>
          </div>

          <div className="flex flex-col items-center relative gap-1.5 z-1">
            <div className="flex items-center justify-center text-xs font-bold rounded-full text-white w-24 h-24 bg-color-primary">
              ✓
            </div>
            <span className="font-semibold text-2xs text-white">Escrowed</span>
          </div>

          <div className="flex flex-col items-center relative gap-1.5 z-1">
            <div className="mockup-step-current flex items-center justify-center text-xs rounded-full bg-tertiary text-white w-24 h-24">
              ●
            </div>
            <span className="font-semibold text-2xs text-white">Reviewing</span>
          </div>

          <div className="flex flex-col items-center relative gap-1.5 z-1">
            <div className="mockup-step-locked flex items-center justify-center text-muted rounded-full bg-tertiary text-2xs w-24 h-24">
              <LockIcon />
            </div>
            <span className="text-muted text-2xs">Payout</span>
          </div>
        </div>
      </div>
    </div>
  );
}
