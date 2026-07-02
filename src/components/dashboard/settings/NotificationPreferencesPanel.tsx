"use client";

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

interface NotificationPreferencesPanelProps {
  preferences: NotificationPreferences;
  isSaving: boolean;
  onToggle: (
    type: "email" | "push",
    category: "marketing" | "updates" | "security",
  ) => void;
  onSave: () => void;
}

const notificationLabels: Record<"marketing" | "updates" | "security", string> = {
  marketing: "Marketing",
  updates: "Product updates",
  security: "Security alerts",
};

export default function NotificationPreferencesPanel({
  preferences,
  isSaving,
  onToggle,
  onSave,
}: NotificationPreferencesPanelProps) {
  return (
    <div className="card" style={{ maxWidth: "800px" }}>
      <h3
        style={{
          fontSize: "20px",
          fontWeight: 700,
          marginBottom: "24px",
        }}
      >
        Notification Preferences
      </h3>

      <PreferenceGroup
        title="Email notifications"
        type="email"
        values={preferences.email}
        onToggle={onToggle}
      />

      <PreferenceGroup
        title="Push notifications"
        type="push"
        values={preferences.push}
        onToggle={onToggle}
      />

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="btn btn-primary"
          style={{
            opacity: isSaving ? 0.7 : 1,
            cursor: isSaving ? "not-allowed" : "pointer",
          }}
        >
          {isSaving ? "Saving..." : "Save Preferences"}
        </button>
      </div>
    </div>
  );
}

function PreferenceGroup({
  title,
  type,
  values,
  onToggle,
}: {
  title: string;
  type: "email" | "push";
  values: NotificationPreferences["email"];
  onToggle: NotificationPreferencesPanelProps["onToggle"];
}) {
  return (
    <section style={{ marginBottom: "32px" }}>
      <h4
        style={{
          fontSize: "16px",
          fontWeight: 600,
          marginBottom: "16px",
        }}
      >
        {title}
      </h4>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {Object.entries(values).map(([key, value]) => {
          const category = key as "marketing" | "updates" | "security";
          return (
            <div
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
                padding: "12px",
                background: "var(--color-bg-tertiary)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>
                  {notificationLabels[category]}
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: "var(--color-text-secondary)",
                  }}
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
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label
      aria-label={label}
      style={{
        position: "relative",
        display: "inline-block",
        width: "44px",
        height: "24px",
        flex: "0 0 auto",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ opacity: 0, width: 0, height: 0 }}
      />
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          cursor: "pointer",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: checked ? "var(--color-primary)" : "#2f2f46",
          transition: ".2s",
          borderRadius: "34px",
        }}
      />
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          height: "18px",
          width: "18px",
          left: checked ? "23px" : "3px",
          bottom: "3px",
          backgroundColor: "white",
          transition: ".2s",
          borderRadius: "50%",
        }}
      />
    </label>
  );
}
