"use client";

import { Card } from "@/components/ui";

interface DealProgressProps {
  readonly status: string;
}

export function DealProgress({ status }: Readonly<DealProgressProps>) {
  const steps = [
    { s: "PENDING_SIGNATURE", label: "Contract Signing" },
    { s: "ACTIVE", label: "Content Creation" },
    { s: "CONTENT_SUBMITTED", label: "Brand Review" },
    { s: "CONTENT_APPROVED", label: "Approved & Posting" },
    { s: "VERIFIED", label: "Verified & Payment" },
    { s: "COMPLETED", label: "Completed" },
  ];

  return (
    <Card className="deal-progress-card mb-6">
      <h2 className="section-title text-lg font-bold mb-4">
        Deal Progress
      </h2>

      <div
        role="list"
        aria-label="Deal progress stages"
        className="flex flex-col gap-6"
      >
        {steps.map((step, idx, arr) => {
          const stepsMap = arr.map((a) => a.s);
          const currentIndex = stepsMap.indexOf(
            status === "REVISION_REQUESTED"
              ? "CONTENT_SUBMITTED"
              : status,
          );
          const isCompleted = currentIndex > idx;
          const isCurrent = currentIndex === idx;
          const isCancelled = status === "CANCELLED";

          let stepBg = "var(--color-bg-tertiary)";
          if (isCompleted) {
            stepBg = "var(--color-success)";
          } else if (isCurrent && !isCancelled) {
            stepBg = "var(--color-primary)";
          }

          return (
            <div
              key={step.s}
              role="listitem"
              aria-current={isCurrent ? "step" : undefined}
              aria-label={`${idx + 1}. ${step.label} — ${isCompleted ? "Completed" : isCurrent ? "Current step" : "Pending"}`}
              className="flex items-center gap-4"
              style={{
                opacity: isCancelled ? 0.5 : 1,
              }}
            >
              <div
                className="flex items-center justify-center font-bold text-sm rounded-full" style={{ width: "32px", height: "32px", background: stepBg, color:
                    isCompleted || isCurrent
                      ? "white"
                      : "var(--color-text-muted)", boxShadow:
                    isCurrent && !isCancelled
                      ? "0 0 0 4px rgba(99, 102, 241, 0.2)"
                      : "none" }}
              >
                {isCompleted ? "Done" : idx + 1}
              </div>
              <div>
                <div
                  className={isCurrent ? "font-bold text-primary" : "font-semibold text-muted"}
                  style={{
                    color:
                      isCurrent || isCompleted
                        ? "var(--color-text-primary)"
                        : "var(--color-text-muted)",
                  }}
                >
                  {step.label}
                </div>
                {isCurrent && !isCancelled && (
                  <div className="text-xs text-primary">
                    In Progress
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {status === "CANCELLED" && (
          <div
            className="p-3 font-semibold text-center rounded-md text-rose bg-rose-subtle"
          >
            Deal Cancelled
          </div>
        )}
      </div>
    </Card>
  );
}

