"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button, Input, Select } from "@/components/ui";
import { taxComplianceSchema } from "@/lib/validations/auth";

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

function StatusPill({ status }: Readonly<{ status: string }>) {
  const ready = status === "READY";
  return (
    <span
      className="inline-flex items-center text-xs font-extrabold" style={{ borderRadius: "999px", padding: "6px 10px", color: ready ? "var(--color-accent-emerald)" : "var(--color-accent-rose)", background: ready ? "rgba(16, 185, 129, 0.12)" : "rgba(244, 63, 94, 0.12)", border: `1px solid ${ready ? "rgba(16, 185, 129, 0.25)" : "rgba(244, 63, 94, 0.25)"}` }}
    >
      {ready ? "Ready" : "Action required"}
    </span>
  );
}

function validateComplianceDraft(draft: Draft) {
  const errors: Record<string, string> = {};
  const result = taxComplianceSchema.safeParse({
    pan: draft.panNumber.trim(),
    gstin: draft.gstin.trim(),
  });
  if (!result.success) {
    for (const issue of result.error.issues) {
      if (issue.path[0] === "pan") {
        errors.panNumber = issue.message;
      }
      if (issue.path[0] === "gstin") {
        errors.gstin = issue.message;
      }
    }
  }
  return errors;
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
  const _PAN_REGEX = /^[A-Z]{5}\d{4}[A-Z]$/;
  const _GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

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

    const pan = draft.panNumber.trim();
    const gstin = draft.gstin.trim();

    const newFieldErrors = validateComplianceDraft(draft);

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
      <div className="card text-center" style={{ padding: "40px" }}>
        Loading India tax compliance...
      </div>
    );
  }

  const compliance = data?.compliance;
  const summary = data?.summary;
  const status = summary?.status || "ACTION_REQUIRED";

  return (
    <div className="grid gap-5" style={{ maxWidth: "960px" }}>
      <section className="card" style={{ padding: "20px" }}>
        <div className="flex justify-between gap-4 flex-wrap mb-4">
          <div>
            <h2 className="text-xl" style={{ fontWeight: 900, marginBottom: "6px" }}>
              India Tax Compliance
            </h2>
            <p className="text-secondary text-sm">
              PAN, GST, ITR, TDS, and invoice readiness for India operations.
            </p>
          </div>
          <StatusPill status={status} />
        </div>

        <div className="grid-2 gap-3 mb-4">
          <div style={{ padding: "14px", background: "var(--color-bg-tertiary)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
            <div className="text-xs text-muted mb-1">PAN</div>
            <div className="font-extrabold">
              {compliance?.panNumberMasked || (data?.verifiedPanDocument ? "Document verified, number needed" : "Missing")}
            </div>
          </div>
          <div style={{ padding: "14px", background: "var(--color-bg-tertiary)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
            <div className="text-xs text-muted mb-1">GSTIN</div>
            <div className="font-extrabold">
              {compliance?.gstinMasked || compliance?.gstRegistrationType || "Not declared"}
            </div>
          </div>
          <div style={{ padding: "14px", background: "var(--color-bg-tertiary)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
            <div className="text-xs text-muted mb-1">ITR acknowledgement</div>
            <div className="font-extrabold">
              {compliance?.itrAcknowledgementMasked || "Not provided"}
            </div>
          </div>
          <div style={{ padding: "14px", background: "var(--color-bg-tertiary)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
            <div className="text-xs text-muted mb-1">E-invoice</div>
            <div className="font-extrabold">
              {compliance?.eInvoiceApplicable ? "Applicable" : "Not marked"}
            </div>
          </div>
        </div>

        {(summary?.blocking.length || summary?.advisories.length) ? (
          <div className="grid gap-2 mb-1">
            {summary.blocking.map((item) => (
              <div key={item} className="text-sm font-bold" style={{ color: "var(--color-accent-rose)" }}>
                {item}
              </div>
            ))}
            {summary.advisories.map((item) => (
              <div key={item} className="text-secondary text-sm">
                {item}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <form className="card" style={{ padding: "20px" }} onSubmit={handleSubmit}>
        <h3 className="text-lg mb-4" style={{ fontWeight: 900 }}>
          Update Tax Details
        </h3>

        {error && (
          <div role="alert" aria-live="assertive" className="text-sm font-bold" style={{ color: "var(--color-accent-rose)", marginBottom: "14px" }}>
            {error}
          </div>
        )}
        {success && (
          <div role="status" aria-live="polite" className="text-sm font-bold" style={{ color: "var(--color-accent-emerald)", marginBottom: "14px" }}>
            {success}
          </div>
        )}

        <div className="grid-2 gap-4">
          <Input
            id="tax-pan"
            label="PAN number"
            error={fieldErrors.panNumber}
            value={draft.panNumber}
            placeholder={compliance?.panNumberMasked || "ABCDE1234F"}
            maxLength={10}
            onChange={(event) =>
              setDraft({ ...draft, panNumber: event.target.value.toUpperCase() })
            }
            fullWidth
          />

          <Select
            id="tax-gst-type"
            label="GST registration"
            value={draft.gstRegistrationType}
            onChange={(event) =>
              setDraft({ ...draft, gstRegistrationType: event.target.value })
            }
            options={gstRegistrationOptions}
            fullWidth
          />

          <Input
            id="tax-gstin"
            label="GSTIN"
            error={fieldErrors.gstin}
            value={draft.gstin}
            placeholder={compliance?.gstinMasked || "27ABCDE1234F1Z5"}
            maxLength={15}
            disabled={!registeredForGst}
            onChange={(event) =>
              setDraft({ ...draft, gstin: event.target.value.toUpperCase() })
            }
            fullWidth
          />

          <Select
            id="tax-turnover"
            label="GST turnover slab"
            value={draft.gstTurnoverSlab}
            onChange={(event) =>
              setDraft({ ...draft, gstTurnoverSlab: event.target.value })
            }
            options={gstTurnoverOptions}
            fullWidth
          />

          <Input
            id="tax-itr-ay"
            label="ITR assessment year"
            value={draft.itrAssessmentYear}
            placeholder="2025-26"
            onChange={(event) =>
              setDraft({ ...draft, itrAssessmentYear: event.target.value })
            }
            fullWidth
          />

          <Input
            id="tax-itr-ack"
            label="ITR acknowledgement number"
            value={draft.itrAcknowledgementNumber}
            placeholder={compliance?.itrAcknowledgementMasked || "15 digit acknowledgement"}
            inputMode="numeric"
            onChange={(event) =>
              setDraft({
                ...draft,
                itrAcknowledgementNumber: event.target.value.replace(/\D/g, ""),
              })
            }
            fullWidth
          />
        </div>

        <div className="flex justify-end" style={{ marginTop: "18px" }}>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save tax details"}
          </Button>
        </div>
      </form>
    </div>
  );
}
