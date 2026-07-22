"use client";
import React, { useState } from "react";
import Modal from "@/components/ui/Modal";
import { Button, Input, Select } from "@/components/ui";

export type PeriodType = "transactions" | "report";

export interface PeriodValue {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  fy?: string;       // e.g. "2025-26" — for FY-based reports
  label: string;
}

interface Props {
  readonly type: PeriodType;
  readonly title: string;
  readonly icon: string;
  readonly isLoading?: boolean;
  readonly onConfirm: (period: PeriodValue) => void;
  readonly onClose: () => void;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function pad(n: number) { return String(n).padStart(2, "0"); }
function toIso(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

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
  const y   = Number.parseInt(cur.split("-")[0]!, 10);
  return [
    `${y}-${String(y + 1).slice(-2)}`,
    `${y - 1}-${String(y).slice(-2)}`,
    `${y - 2}-${String(y - 1).slice(-2)}`,
  ];
}

interface Preset { label: string; start: Date; end: Date; }
function buildPresets(): Preset[] {
  const now  = new Date();
  const cfy  = fyBounds(currentFY());
  const lfy  = fyBounds(prevFY(currentFY()));
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const ago3 = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  return [
    { label: "This Month",                       start: startOfMonth(now),  end: endOfMonth(now) },
    { label: "Last Month",                        start: startOfMonth(last), end: endOfMonth(last) },
    { label: "Last 3 Months",                     start: ago3,               end: now },
    { label: `This FY (${currentFY()})`,          start: cfy.start,          end: cfy.end },
    { label: `Last FY (${prevFY(currentFY())})`,  start: lfy.start,          end: lfy.end },
    { label: "Custom",                            start: now,                end: now },
  ];
}

// ── component ────────────────────────────────────────────────────────────────
export default function PeriodPickerModal({ type, title, icon, isLoading, onConfirm, onClose }: Props) {
  const presets = buildPresets();
  const fys     = availableFYs();
  const now     = new Date();

  const [selected, setSelected] = useState(presets[0]!.label);
  const [custom,   setCustom]   = useState({ start: "", end: "" });
  const [fy,       setFy]       = useState(currentFY());

  const isCustom = selected === "Custom";

  function resolve(): PeriodValue {
    if (type === "report") {
      const b = fyBounds(fy);
      return { startDate: toIso(b.start), endDate: toIso(b.end), fy, label: `FY ${fy}` };
    }
    if (isCustom) {
      return { startDate: custom.start, endDate: custom.end, label: `${custom.start} → ${custom.end}` };
    }
    const p = presets.find(p => p.label === selected)!;
    return { startDate: toIso(p.start), endDate: toIso(p.end), label: p.label };
  }

  const valid = type === "report" || (isCustom ? !!custom.start && !!custom.end && custom.start <= custom.end : true);

  const selectedPreset = presets.find(p => p.label === selected);

  // ── styles ───────────────────────────────────────────────────────────────
  const css = {
    overlay: {
      position: "fixed" as const, inset: 0, zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center", padding: "16px",
    },
    modal: {
      position: "relative" as const,
      background: "var(--color-surface, #14142b)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "20px", width: "100%", maxWidth: "480px",
      boxShadow: "0 40px 120px rgba(0,0,0,0.7)",
      overflow: "hidden",
      zIndex: 1001,
    },
    header: {
      padding: "24px 28px 20px",
      borderBottom: "1px solid rgba(255,255,255,0.07)",
      display: "flex", alignItems: "center", gap: "14px",
    },
    iconBox: {
      width: 46, height: 46, borderRadius: "12px",
      background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: "22px", flexShrink: 0,
    },
    sectionLabel: {
      display: "block", fontSize: "10px", fontWeight: 700,
      letterSpacing: "0.08em", textTransform: "uppercase" as const,
      color: "var(--color-text-secondary,#9ca3af)", marginBottom: "10px",
    },
    presetGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "20px" },
    infoBox: {
      padding: "12px 16px", borderRadius: "12px",
      background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)",
      fontSize: "13px", color: "var(--color-text-secondary,#9ca3af)",
    },
    select: {
      width: "100%", padding: "11px 14px", borderRadius: "12px",
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.12)",
      color: "var(--color-text-primary,#fff)", fontSize: "14px",
      outline: "none", marginBottom: "20px", cursor: "pointer",
    },
    dateInput: {
      width: "100%", padding: "11px 14px", borderRadius: "12px",
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.12)",
      color: "var(--color-text-primary,#fff)", fontSize: "14px",
      outline: "none",
    },
  };

  return (
    <Modal open={true} onClose={onClose} maxWidth="480px">
      {/* ── Custom Header ── */}
      <div className="flex items-center mb-5" style={{ padding: "0 0 20px 0", borderBottom: "1px solid rgba(255,255,255,0.07)", gap: "14px" }}>
        <div style={css.iconBox}>{icon}</div>
        <div className="flex-1" style={{ minWidth: 0 }}>
          <div className="text-base font-bold" style={{ color: "var(--color-text-primary,#fff)" }}>{title}</div>
          <div className="text-xs" style={{ color: "var(--color-text-secondary,#9ca3af)", marginTop: "3px" }}>
            Select the period for this {type === "report" ? "report" : "export"}
          </div>
        </div>
        <Button
          variant="ghost"
          onClick={onClose}
          aria-label="Close period picker"
          className="cursor-pointer flex-shrink-0 border-none leading-none p-1 bg-none text-2xl" style={{ color: "var(--color-text-secondary,#9ca3af)" }}
        >✕</Button>
      </div>

      {/* ── Body ── */}
      {type === "report" ? (
        <>
          <span style={css.sectionLabel}>Financial Year</span>
          <Select
            style={css.select}
            aria-label="Financial year"
            value={fy}
            onChange={e => setFy(e.target.value)}
            fullWidth
          >
            {fys.map(f => <option key={f} value={f}>FY {f}</option>)}
          </Select>
          <div style={css.infoBox}>
            📅 Report period:{" "}
            <strong style={{ color: "var(--color-text-primary,#fff)" }}>
              1 Apr {fy.split("-")[0]} – 31 Mar 20{fy.split("-")[1]}
            </strong>
          </div>
        </>
      ) : (
        <>
          {/* Quick-select presets */}
          <span style={css.sectionLabel}>Quick Select</span>
          <div style={css.presetGrid}>
            {presets.map(p => {
              const active = selected === p.label;
              return (
                <Button
                  key={p.label}
                  onClick={() => setSelected(p.label)}
                  aria-pressed={active}
                  className="cursor-pointer text-sm font-semibold rounded-lg" style={{ padding: "11px 12px", textAlign: "left" as const, transition: "all .15s ease", background: active ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "rgba(255,255,255,0.04)", color: active ? "#fff" : "var(--color-text-secondary,#9ca3af)", border: active ? "1px solid transparent" : "1px solid rgba(255,255,255,0.08)" }}
                >
                  {p.label}
                </Button>
              );
            })}
          </div>

          {/* Custom date range */}
          {isCustom ? (
            <>
              <span style={css.sectionLabel}>Custom Range</span>
              <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div>
                  <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary,#9ca3af)" }}>From</div>
                  <Input
                    type="date" style={css.dateInput}
                    aria-label="Start date"
                    value={custom.start}
                    max={custom.end || toIso(now)}
                    onChange={e => setCustom(c => ({ ...c, start: e.target.value }))}
                    fullWidth
                  />
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: "var(--color-text-secondary,#9ca3af)" }}>To</div>
                  <Input
                    type="date" style={css.dateInput}
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
                  ⚠ End date must be after start date
                </div>
              )}
            </>
          ) : (
            /* Period summary pill */
            selectedPreset && (
              <div style={css.infoBox}>
                📅{" "}
                <strong style={{ color: "var(--color-text-primary,#fff)" }}>{toIso(selectedPreset.start)}</strong>
                {" → "}
                <strong style={{ color: "var(--color-text-primary,#fff)" }}>{toIso(selectedPreset.end)}</strong>
              </div>
            )
          )}
        </>
      )}

      {/* ── Footer ── */}
      <div className="mt-6 flex justify-end gap-2-5">
        <Button
          onClick={onClose}
          variant="secondary"
          className="text-sm font-semibold cursor-pointer rounded-lg bg-none" style={{ padding: "11px 22px", border: "1px solid rgba(255,255,255,0.12)", color: "var(--color-text-secondary,#9ca3af)" }}
        >
          Cancel
        </Button>
        <Button
          disabled={!valid || !!isLoading}
          aria-busy={!!isLoading}
          onClick={() => valid && onConfirm(resolve())}
          className="text-sm font-bold flex items-center gap-2 rounded-lg border-none text-white" style={{ padding: "11px 28px", background: valid && !isLoading ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "rgba(99,102,241,0.4)", cursor: valid && !isLoading ? "pointer" : "not-allowed", transition: "all .2s" }}
        >
          {isLoading ? <>⏳ Generating…</> : <>{icon} Download</>}
        </Button>
      </div>
    </Modal>
  );
}
