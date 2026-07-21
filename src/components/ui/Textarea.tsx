import React from "react";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly label?: string;
  readonly error?: string;
  readonly fullWidth?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = "", label, error, fullWidth = false, id, style, ...props }, ref) => {
    const textareaId =
      id ?? (label ? `textarea-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

    return (
      <div
        className="input-wrapper"
        style={{
          width: fullWidth ? "100%" : "auto",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          ...style,
        }}
      >
        {label && (
          <label className="label" htmlFor={textareaId} style={{ marginBottom: 0 }}>
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          className={`input ${error ? "input-error" : ""} ${className}`}
          style={{ resize: "vertical", minHeight: "100px" }}
          ref={ref}
          {...props}
        />
        {error && (
          <span
            className="input-error-message"
            style={{
              fontSize: "12px",
              color: "var(--color-accent-rose, #f43f5e)",
              marginTop: "2px",
            }}
          >
            {error}
          </span>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
