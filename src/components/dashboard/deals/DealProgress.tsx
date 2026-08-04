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

  const stepsMap = steps.map((a) => a.s);
  const currentIndex = stepsMap.indexOf(
    status === "REVISION_REQUESTED" ? "CONTENT_SUBMITTED" : status,
  );
  const isCancelled = status === "CANCELLED";

  return (
    <Card className="deal-progress-card mb-6">
      <h2 className="section-title text-lg font-bold mb-4">
        Deal Progress
      </h2>

      <ul
        aria-label="Deal progress stages"
        className="deal-progress-list flex flex-col gap-6"
      >
        {steps.map((step, idx) => {
          const isCompleted = currentIndex > idx;
          const isCurrent = currentIndex === idx;

          const circleStatus = isCompleted
            ? "completed"
            : isCurrent && !isCancelled
            ? "current"
            : "pending";

          const labelStatus = isCompleted || isCurrent ? "current" : "pending";
          const liOpacity = isCancelled ? "opacity-50" : "";

          return (
            <li
              key={step.s}
              aria-current={isCurrent ? "step" : undefined}
              aria-label={`${idx + 1}. ${step.label} — ${isCompleted ? "Completed" : isCurrent ? "Current step" : "Pending"}`}
              className={`flex items-center gap-4 ${liOpacity}`}
            >
              <div
                className={`deal-progress-step-circle flex items-center justify-center font-bold text-sm rounded-full ${circleStatus}`}
              >
                {isCompleted ? "✓" : idx + 1}
              </div>
              <div>
                <div
                  className={`deal-progress-step-label ${isCurrent ? "font-bold text-primary" : "font-semibold text-muted"} ${labelStatus}`}
                >
                  {step.label}
                </div>
                {isCurrent && !isCancelled && (
                  <div className="text-xs text-primary">In Progress</div>
                )}
              </div>
            </li>
          );
        })}
        {isCancelled && (
          <li
            className="p-3 font-semibold text-center rounded-md text-rose bg-rose-subtle"
          >
            Deal Cancelled
          </li>
        )}
      </ul>
    </Card>
  );
}
