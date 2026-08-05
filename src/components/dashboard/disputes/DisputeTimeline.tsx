"use client";

import React from "react";
import { Card } from "@/components/ui";
import { DisputeDetail } from "./DisputeHelpers";

interface DisputeTimelineProps {
readonly dispute: DisputeDetail;
}

export function DisputeTimeline({ dispute }: Readonly<DisputeTimelineProps>) {
return (
<Card className="mb-6">
<h2 className="section-title text-lg font-bold mb-4">
Dispute Timeline
</h2>
<div className="flex flex-col gap-3">
<div className="flex items-center gap-3 py-2 border-bottom">
<div className="flex-shrink-0 rounded-full dispute-timeline-dot" data-tone="primary" />
<div className="flex-1">
<div className="text-sm font-semibold">Dispute Filed</div>
<div className="text-xs text-secondary">
{new Date(dispute.createdAt).toLocaleString()}
</div>
</div>
</div>
{dispute.tier >= 1 && (
<div className="flex items-center gap-3 py-2 border-bottom">
<div className="flex-shrink-0 rounded-full dispute-timeline-dot" data-tone="cyan" />
<div className="flex-1">
<div className="text-sm font-semibold">AI Mediator Analyzed</div>
<div className="text-xs text-secondary">Auto-resolution engine processed</div>
</div>
</div>
)}
{dispute.tier >= 2 && (
<div className="flex items-center gap-3 py-2 border-bottom">
<div className="flex-shrink-0 rounded-full dispute-timeline-dot" data-tone="warning" />
<div className="flex-1">
<div className="text-sm font-semibold">Escalated to Human Mediation</div>
<div className="text-xs text-secondary">Tier 2 review in progress</div>
</div>
</div>
)}
{dispute.tier >= 3 && (
<div className="flex items-center gap-3 border-b-card dispute-timeline-row">
<div className="flex-shrink-0 rounded-full dispute-timeline-dot" data-tone="danger" />
<div className="flex-1">
<div className="text-sm font-semibold">Arbitration</div>
<div className="text-xs text-secondary">Final review by admin</div>
</div>
</div>
)}
{dispute.status === "RESOLVED" && (
<div className="flex items-center gap-3 py-2">
<div className="flex-shrink-0 rounded-full dispute-timeline-dot" data-tone="success" />
<div className="flex-1">
<div className="text-sm font-semibold">Resolved</div>
<div className="text-xs text-secondary">
{dispute.resolvedAt ? new Date(dispute.resolvedAt).toLocaleString() : "Recently"}
</div>
</div>
</div>
)}
</div>
</Card>
);
}
