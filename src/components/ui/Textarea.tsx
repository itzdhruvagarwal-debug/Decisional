import React from "react";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly label?: string | undefined;
  readonly error?: string | undefined;
  readonly fullWidth?: boolean | undefined;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = "", label, error, fullWidth = false, id, style, ...props }, ref) => {
    const textareaId =
      id ?? (label ? `textarea-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

    return (
      <div
        className="input-wrapper flex flex-col gap-2" style={{ width: fullWidth ? "100%" : "auto", ...style }}
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
            className="input-error-message text-xs mt-1" style={{ color: "var(--color-accent-rose, #f43f5e)" }}
          >
            {error}
          </span>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
