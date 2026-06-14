"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type TaxComplianceData = {
  userType: "BRAND" | "INFLUENCER" | "ADMIN";
  verifiedPanDocument: boolean;
  compliance: {
    panNumberMasked: string | null;
    gstinMasked: string | null;
    gstStateCode: string | null;
    gstRegistrationType: string;
    gstTurnoverSlab: string | null;
    itrAcknowledgementMasked: string | null;
    itrAssessmentYear: string | null;
    tdsSection: string | null;
    eInvoiceApplicable: boolean;
    status: string;
    updatedAt: string;
  } | null;
  summary: {
    status: string;
    blocking: string[];
    advisories: string[];
  };
};

type Draft = {
  panNumber: string;
  gstin: string;
  gstRegistrationType: string;
  gstTurnoverSlab: string;
  itrAcknowledgementNumber: string;
  itrAssessmentYear: string;
};

const gstRegistrationOptions = [
  { value: "UNREGISTERED", label: "Unregistered / below threshold" },
  { value: "REGISTERED", label: "Registered GST taxpayer" },
  { value: "COMPOSITION", label: "Composition scheme" },
  { value: "EXEMPT", label: "Exempt supplies only" },
];

const gstTurnoverOptions = [
  { value: "", label: "Select turnover slab" },
  { value: "BELOW_20L", label: "Below INR 20 lakh" },
  { value: "BETWEEN_20L_AND_5CR", label: "INR 20 lakh to 5 crore" },
  { value: "FIVE_CR_PLUS", label: "INR 5 crore or more" },
  { value: "TEN_CR_PLUS", label: "INR 10 crore or more" },
];

function emptyDraft(): Draft {
  return {
    panNumber: "",
    gstin: "",
    gstRegistrationType: "UNREGISTERED",
    gstTurnoverSlab: "",
    itrAcknowledgementNumber: "",
    itrAssessmentYear: "",
  };
}

function StatusPill({ status }: { status: string }) {
  const ready = status === "READY";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "999px",
        padding: "6px 10px",
        fontSize: "12px",
        fontWeight: 800,
        color: ready ? "var(--color-accent-emerald)" : "var(--color-accent-rose)",
        background: ready ? "rgba(16, 185, 129, 0.12)" : "rgba(244, 63, 94, 0.12)",
        border: `1px solid ${ready ? "rgba(16, 185, 129, 0.25)" : "rgba(244, 63, 94, 0.25)"}`,
      }}
    >
      {ready ? "Ready" : "Action required"}
    </span>
  );
}

export default function IndiaTaxCompliancePanel() {
  const [data, setData] = useState<TaxComplianceData | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Regex validators
  const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
  const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

  async function loadCompliance() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/compliance/india-tax", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.message || "Failed to load tax compliance");

      const next = payload.data as TaxComplianceData;
      setData(next);
      setDraft({
        ...emptyDraft(),
        gstRegistrationType:
          next.compliance?.gstRegistrationType || "UNREGISTERED",
        gstTurnoverSlab: next.compliance?.gstTurnoverSlab || "",
        itrAssessmentYear: next.compliance?.itrAssessmentYear || "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tax compliance");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCompliance();
  }, []);

  const registeredForGst = useMemo(
    () =>
      draft.gstRegistrationType === "REGISTERED" ||
      draft.gstRegistrationType === "COMPOSITION",
    [draft.gstRegistrationType],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    setFieldErrors({});

    // Client-side format validation
    const newFieldErrors: Record<string, string> = {};
    const pan = draft.panNumber.trim();
    const gstin = draft.gstin.trim();

    if (pan && !PAN_REGEX.test(pan)) {
      newFieldErrors.panNumber = "Invalid PAN format. Expected: ABCDE1234F (5 letters, 4 digits, 1 letter)";
    }
    if (gstin && !GSTIN_REGEX.test(gstin)) {
      newFieldErrors.gstin = "Invalid GSTIN format. Expected 15-char: 27ABCDE1234F1Z5";
    }

    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      setSaving(false);
      return;
    }

    const payload: Record<string, string> = {
      gstRegistrationType: draft.gstRegistrationType,
    };

    if (draft.gstTurnoverSlab) payload.gstTurnoverSlab = draft.gstTurnoverSlab;
    if (draft.itrAssessmentYear.trim()) {
      payload.itrAssessmentYear = draft.itrAssessmentYear.trim();
    }
    if (pan) payload.panNumber = pan;
    if (gstin) payload.gstin = gstin;
    if (draft.itrAcknowledgementNumber.trim()) {
      payload.itrAcknowledgementNumber = draft.itrAcknowledgementNumber.trim();
    }

    try {
      const res = await fetch("/api/compliance/india-tax", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();

      if (!res.ok) {
        const details = result.errors
          ? Object.values(result.errors).flat().filter(Boolean).join(" ")
          : "";
        throw new Error(details || result.message || "Failed to save tax compliance");
      }

      setSuccess("India tax compliance updated.");
      await loadCompliance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save tax compliance");
    } finally {
      setSaving(false);
    }
  }


  if (loading) {
    return (
      <div className="card" style={{ padding: "40px", textAlign: "center" }}>
        Loading India tax compliance...
      </div>
    );
  }

  const compliance = data?.compliance;
  const summary = data?.summary;
  const status = summary?.status || "ACTION_REQUIRED";

  return (
    <div style={{ display: "grid", gap: "20px", maxWidth: "960px" }}>
      <section className="card" style={{ padding: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "16px" }}>
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: 900, marginBottom: "6px" }}>
              India Tax Compliance
            </h2>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
              PAN, GST, ITR, TDS, and invoice readiness for India operations.
            </p>
          </div>
          <StatusPill status={status} />
        </div>

        <div className="grid-2" style={{ gap: "12px", marginBottom: "16px" }}>
          <div style={{ padding: "14px", background: "var(--color-bg-tertiary)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
            <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "4px" }}>PAN</div>
            <div style={{ fontWeight: 800 }}>
              {compliance?.panNumberMasked || (data?.verifiedPanDocument ? "Document verified, number needed" : "Missing")}
            </div>
          </div>
          <div style={{ padding: "14px", background: "var(--color-bg-tertiary)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
            <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "4px" }}>GSTIN</div>
            <div style={{ fontWeight: 800 }}>
              {compliance?.gstinMasked || compliance?.gstRegistrationType || "Not declared"}
            </div>
          </div>
          <div style={{ padding: "14px", background: "var(--color-bg-tertiary)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
            <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "4px" }}>ITR acknowledgement</div>
            <div style={{ fontWeight: 800 }}>
              {compliance?.itrAcknowledgementMasked || "Not provided"}
            </div>
          </div>
          <div style={{ padding: "14px", background: "var(--color-bg-tertiary)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
            <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "4px" }}>E-invoice</div>
            <div style={{ fontWeight: 800 }}>
              {compliance?.eInvoiceApplicable ? "Applicable" : "Not marked"}
            </div>
          </div>
        </div>

        {(summary?.blocking.length || summary?.advisories.length) ? (
          <div style={{ display: "grid", gap: "8px", marginBottom: "4px" }}>
            {summary.blocking.map((item) => (
              <div key={item} style={{ color: "var(--color-accent-rose)", fontSize: "13px", fontWeight: 700 }}>
                {item}
              </div>
            ))}
            {summary.advisories.map((item) => (
              <div key={item} style={{ color: "var(--color-text-secondary)", fontSize: "13px" }}>
                {item}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <form className="card" style={{ padding: "20px" }} onSubmit={handleSubmit}>
        <h3 style={{ fontSize: "18px", fontWeight: 900, marginBottom: "16px" }}>
          Update Tax Details
        </h3>

        {error && (
          <div style={{ color: "var(--color-accent-rose)", marginBottom: "14px", fontSize: "13px", fontWeight: 700 }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ color: "var(--color-accent-emerald)", marginBottom: "14px", fontSize: "13px", fontWeight: 700 }}>
            {success}
          </div>
        )}

        <div className="grid-2" style={{ gap: "16px" }}>
          <div>
            <label className="label" htmlFor="tax-pan">PAN number</label>
            <input
              id="tax-pan"
              className="input"
              value={draft.panNumber}
              placeholder={compliance?.panNumberMasked || "ABCDE1234F"}
              maxLength={10}
              onChange={(event) =>
                setDraft({ ...draft, panNumber: event.target.value.toUpperCase() })
              }
            />
            {fieldErrors.panNumber && (
              <div style={{ color: "var(--color-accent-rose)", fontSize: "12px", marginTop: "4px", fontWeight: 600 }}>
                {fieldErrors.panNumber}
              </div>
            )}
          </div>

          <div>
            <label className="label" htmlFor="tax-gst-type">GST registration</label>
            <select
              id="tax-gst-type"
              className="input"
              value={draft.gstRegistrationType}
              onChange={(event) =>
                setDraft({ ...draft, gstRegistrationType: event.target.value })
              }
            >
              {gstRegistrationOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="tax-gstin">GSTIN</label>
            <input
              id="tax-gstin"
              className="input"
              value={draft.gstin}
              placeholder={compliance?.gstinMasked || "27ABCDE1234F1Z5"}
              maxLength={15}
              disabled={!registeredForGst}
              onChange={(event) =>
                setDraft({ ...draft, gstin: event.target.value.toUpperCase() })
              }
            />
            {fieldErrors.gstin && (
              <div style={{ color: "var(--color-accent-rose)", fontSize: "12px", marginTop: "4px", fontWeight: 600 }}>
                {fieldErrors.gstin}
              </div>
            )}
          </div>

          <div>
            <label className="label" htmlFor="tax-turnover">GST turnover slab</label>
            <select
              id="tax-turnover"
              className="input"
              value={draft.gstTurnoverSlab}
              onChange={(event) =>
                setDraft({ ...draft, gstTurnoverSlab: event.target.value })
              }
            >
              {gstTurnoverOptions.map((option) => (
                <option key={option.value || "empty"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="tax-itr-ay">ITR assessment year</label>
            <input
              id="tax-itr-ay"
              className="input"
              value={draft.itrAssessmentYear}
              placeholder="2025-26"
              onChange={(event) =>
                setDraft({ ...draft, itrAssessmentYear: event.target.value })
              }
            />
          </div>

          <div>
            <label className="label" htmlFor="tax-itr-ack">ITR acknowledgement number</label>
            <input
              id="tax-itr-ack"
              className="input"
              value={draft.itrAcknowledgementNumber}
              placeholder={compliance?.itrAcknowledgementMasked || "15 digit acknowledgement"}
              inputMode="numeric"
              onChange={(event) =>
                setDraft({
                  ...draft,
                  itrAcknowledgementNumber: event.target.value.replace(/\D/g, ""),
                })
              }
            />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "18px" }}>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save tax details"}
          </button>
        </div>
      </form>
    </div>
  );
}
