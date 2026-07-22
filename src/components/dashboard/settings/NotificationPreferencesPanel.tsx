"use client";

import { Button } from "@/components/ui";

export interface NotificationPreferences {
  email: {
    marketing: boolean;
    updates: boolean;
    security: boolean;
  };
  push: {
    marketing: boolean;
    updates: boolean;
    security: boolean;
  };
}

export type NotificationCategory = "marketing" | "updates" | "security";

interface NotificationPreferencesPanelProps {
  preferences: NotificationPreferences;
  isSaving: boolean;
  onToggle: (
    type: "email" | "push",
    category: NotificationCategory,
  ) => void;
  onSave: () => void;
}

const notificationLabels: Record<NotificationCategory, string> = {
  marketing: "Marketing",
  updates: "Product updates",
  security: "Security alerts",
};

export default function NotificationPreferencesPanel({
  preferences,
  isSaving,
  onToggle,
  onSave,
}: Readonly<NotificationPreferencesPanelProps>) {
  return (
    <div className="card max-w-800">
      <h3
        className="text-xl font-bold mb-6"
      >
        Notification Preferences
      </h3>

      <PreferenceGroup
        title="Email notifications"
        type="email"
        values={preferences.email}
        onToggle={onToggle}
      />


      <div className="flex justify-end">
        <Button
          type="button"
          variant="primary"
          onClick={onSave}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Save Preferences"}
        </Button>
      </div>
    </div>
  );
}

function PreferenceGroup({
  title,
  type,
  values,
  onToggle,
}: Readonly<{
  title: string;
  type: "email" | "push";
  values: NotificationPreferences["email"];
  onToggle: NotificationPreferencesPanelProps["onToggle"];
}>) {
  return (
    <section className="mb-8">
      <h4
        className="text-base font-semibold mb-4"
      >
        {title}
      </h4>
      <div
        className="flex flex-col gap-4"
      >
        {Object.entries(values).map(([key, value]) => {
          const category = key as NotificationCategory;
          return (
            <div
              key={key}
              className="flex items-center justify-between gap-4 p-3 bg-tertiary rounded-sm"
            >
              <div>
                <div className="font-semibold">
                  {notificationLabels[category]}
                </div>
                <div
                  className="text-sm text-secondary"
                >
                  Receive {notificationLabels[category].toLowerCase()} by{" "}
                  {type === "email" ? "email" : "push notification"}.
                </div>
              </div>
              <Toggle
                checked={value}
                label={`${title}: ${notificationLabels[category]}`}
                onChange={() => onToggle(type, category)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Toggle({
  checked,
  label,
  onChange,
}: Readonly<{
  checked: boolean;
  label: string;
  onChange: () => void;
}>) {
  return (
    <label
      aria-label={label}
      className="relative inline-block h-24 w-11" style={{ flex: "0 0 auto" }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ opacity: 0, width: 0, height: 0 }}
      />
      <span
        aria-hidden="true"
        className="absolute cursor-pointer" style={{ top: 0, left: 0, right: 0, bottom: 0, backgroundColor: checked ? "var(--color-primary)" : "#2f2f46", transition: ".2s", borderRadius: "34px" }}
      />
      <span
        aria-hidden="true"
        className="absolute rounded-full" style={{ height: "18px", width: "18px", left: checked ? "23px" : "3px", bottom: "3px", backgroundColor: "white", transition: ".2s" }}
      />
    </label>
  );
}
