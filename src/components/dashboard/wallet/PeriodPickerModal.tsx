"use client";
import React, { useState } from "react";
import Modal from "@/components/ui/Modal";
import { Button, Input, Select } from "@/components/ui";

export type PeriodType = "transactions" | "report";

export interface PeriodValue {
startDate: string; // YYYY-MM-DD
endDate: string; // YYYY-MM-DD
fy?: string; // e.g. "2025-26" for FY-based reports
label: string;
}

interface Props {
readonly type: PeriodType;
readonly title: string;
readonly icon: React.ReactNode;
readonly isLoading?: boolean;
readonly onConfirm: (period: PeriodValue) => void;
readonly onClose: () => void;
}

function pad(n: number) { return String(n).padStart(2, "0"); }
function toIso(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

function currentFY() {
const now = new Date();
const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
return `${y}-${String(y + 1).slice(-2)}`;
}

function fyBounds(fy: string) {
const y = Number.parseInt(fy.split("-")[0]!, 10);
return { start: new Date(y, 3, 1), end: new Date(y + 1, 2, 31) };
}

function prevFY(fy: string) {
const y = Number.parseInt(fy.split("-")[0]!, 10);
return `${y - 1}-${String(y).slice(-2)}`;
}

function availableFYs() {
const cur = currentFY();
const y = Number.parseInt(cur.split("-")[0]!, 10);
return [
`${y}-${String(y + 1).slice(-2)}`,
`${y - 1}-${String(y).slice(-2)}`,
`${y - 2}-${String(y - 1).slice(-2)}`,
];
}

interface Preset { label: string; start: Date; end: Date; }
function buildPresets(): Preset[] {
const now = new Date();
const cfy = fyBounds(currentFY());
const lfy = fyBounds(prevFY(currentFY()));
const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const ago3 = new Date(now.getFullYear(), now.getMonth() - 3, 1);
return [
{ label: "This Month", start: startOfMonth(now), end: endOfMonth(now) },
{ label: "Last Month", start: startOfMonth(last), end: endOfMonth(last) },
{ label: "Last 3 Months", start: ago3, end: now },
{ label: `This FY (${currentFY()})`, start: cfy.start, end: cfy.end },
{ label: `Last FY (${prevFY(currentFY())})`, start: lfy.start, end: lfy.end },
{ label: "Custom", start: now, end: now },
];
}

export default function PeriodPickerModal({ type, title, icon, isLoading, onConfirm, onClose }: Props) {
const presets = buildPresets();
const fys = availableFYs();
const now = new Date();

const [selected, setSelected] = useState(presets[0]!.label);
const [custom, setCustom] = useState({ start: "", end: "" });
const [fy, setFy] = useState(currentFY());

const isCustom = selected === "Custom";

function resolve(): PeriodValue {
if (type === "report") {
const b = fyBounds(fy);
return { startDate: toIso(b.start), endDate: toIso(b.end), fy, label: `FY ${fy}` };
}
if (isCustom) {
return { startDate: custom.start, endDate: custom.end, label: `${custom.start} -> ${custom.end}` };
}
const p = presets.find(preset => preset.label === selected)!;
return { startDate: toIso(p.start), endDate: toIso(p.end), label: p.label };
}

const valid = type === "report" || (isCustom ? !!custom.start && !!custom.end && custom.start <= custom.end : true);
const selectedPreset = presets.find(preset => preset.label === selected);

return (
<Modal open={true} onClose={onClose} maxWidth="480px">
{/* Custom Header */}
<div className="flex items-center mb-5 period-picker-header">
<div className="period-picker-icon">{icon}</div>
<div className="flex-1 min-w-0">
<div className="text-base font-bold text-text-primary">{title}</div>
<div className="text-xs text-secondary-muted period-picker-subtitle">
Select the period for this {type === "report" ? "report" : "export"}
</div>
</div>
<Button
variant="ghost"
onClick={onClose}
aria-label="Close period picker"
className="cursor-pointer flex-shrink-0 border-none leading-none p-1 bg-none text-2xl text-secondary-muted"
>&times;</Button>
</div>

{/* Body */}
{type === "report" ? (
<>
<span className="period-picker-label">Financial Year</span>
<Select
className="period-picker-select"
aria-label="Financial year"
value={fy}
onChange={e => setFy(e.target.value)}
fullWidth
>
{fys.map(f => <option key={f} value={f}>FY {f}</option>)}
</Select>
<div className="period-picker-info">
Report period:{" "}
<strong className="text-text-primary">
1 Apr {fy.split("-")[0]} - 31 Mar 20{fy.split("-")[1]}
</strong>
</div>
</>
) : (
<>
{/* Quick-select presets */}
<span className="period-picker-label">Quick Select</span>
<div className="period-picker-preset-grid">
{presets.map(p => {
const active = selected === p.label;
return (
<Button
key={p.label}
onClick={() => setSelected(p.label)}
aria-pressed={active}
className="cursor-pointer text-sm font-semibold rounded-lg period-picker-preset"
data-active={active ? "true" : "false"}
>
{p.label}
</Button>
);
})}
</div>

{/* Custom date range */}
{isCustom ? (
<>
<span className="period-picker-label">Custom Range</span>
<div className="grid gap-3 mb-4 period-picker-date-grid">
<div>
<div className="text-xs mb-1 text-secondary-muted">From</div>
<Input
type="date"
className="period-picker-date-input"
aria-label="Start date"
value={custom.start}
max={custom.end || toIso(now)}
onChange={e => setCustom(c => ({ ...c, start: e.target.value }))}
fullWidth
/>
</div>
<div>
<div className="text-xs mb-1 text-secondary-muted">To</div>
<Input
type="date"
className="period-picker-date-input"
aria-label="End date"
value={custom.end}
min={custom.start}
max={toIso(now)}
onChange={e => setCustom(c => ({ ...c, end: e.target.value }))}
fullWidth
/>
</div>
</div>
{custom.start && custom.end && custom.start > custom.end && (
<div role="alert" className="text-xs mb-3 text-rose">
End date must be after start date
</div>
)}
</>
) : (
/* Period summary pill */
selectedPreset && (
<div className="period-picker-info flex items-center gap-1.5">
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0">
    <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
  <strong className="text-text-primary">{toIso(selectedPreset.start)}</strong>
  <span className="text-secondary-muted font-medium">to</span>
  <strong className="text-text-primary">{toIso(selectedPreset.end)}</strong>
</div>
)
)}
</>
)}

{/* Footer */}
<div className="mt-6 flex justify-end gap-2-5">
<Button
onClick={onClose}
variant="secondary"
className="text-sm font-semibold cursor-pointer rounded-lg bg-none text-secondary-muted period-picker-cancel"
>
Cancel
</Button>
<Button
disabled={!valid || !!isLoading}
aria-busy={!!isLoading}
onClick={() => valid && onConfirm(resolve())}
className="text-sm font-bold flex items-center gap-2 rounded-lg border-none text-white period-picker-confirm"
data-valid={valid && !isLoading ? "true" : "false"}
>
{isLoading ? <>Generating...</> : <>{icon} Download</>}
</Button>
</div>
</Modal>
);
}
