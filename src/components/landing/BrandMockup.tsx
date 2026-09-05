"use client";

import { Button } from "@/components/ui/Button";

export function BrandMockup() {
  return (
    <div className="flex flex-col gap-5">
      {/* Top Stats Row */}
      <div className="grid gap-4 grid-auto-140">
        <div className="mockup-stat bg-glass rounded-lg px-4 py-3">
          <span className="text-muted block text-xs">Active Campaigns</span>
          <span className="text-xl font-extrabold text-white">3 Campaigns</span>
        </div>
        <div className="mockup-stat bg-glass rounded-lg px-4 py-3">
          <span className="text-muted block text-xs">Secured Escrow</span>
          <span className="text-xl font-extrabold text-cyan">1,85,000</span>
        </div>
        <div className="mockup-stat bg-glass rounded-lg px-4 py-3">
          <span className="text-muted block text-xs">ROI Index</span>
          <span className="text-xl font-extrabold text-emerald">3.8x Profit</span>
        </div>
      </div>

      {/* Campaign Submissions */}
      <div className="mockup-section p-4 bg-glass rounded-lg">
        <div className="flex justify-between items-center mb-3">
          <h4 className="text-sm font-bold text-white">
            Submissions Awaiting Approval (1)
          </h4>
          <span className="flex items-center gap-1 text-xs text-amber">
            <span className="mockup-timer-dot rounded-full h-6" />{" "}
            48h Review Timer Running
          </span>
        </div>

        {/* Creator Submission list item */}
        <div className="mockup-submission flex items-center justify-between p-3 flex-wrap bg-glass rounded-md gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center font-extrabold text-xs rounded-full text-white w-32 h-32 bg-color-primary">
              AM
            </div>
            <div>
              <span className="text-sm font-semibold block text-white">
                Ananya Mehta
              </span>
              <span className="text-secondary text-xs">
                Instagram post content ready for review
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="mockup-secondary-action text-xs rounded-sm px-3-py-1 bg-none text-white"
            >
              View Draft
            </Button>
            <Button
              type="button"
              variant="primary"
              className="mockup-primary-action font-semibold border-none text-xs rounded-sm px-3-py-1 bg-gradient-primary text-white"
            >
              Approve
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
