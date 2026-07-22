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
          <label className="label mb-0" htmlFor={textareaId}>
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          className={`input resize-y ${error ? "input-error" : ""} ${className}`}
          style={{ minHeight: "100px" }}
          ref={ref}
          {...props}
        />
        {error && (
          <span
            className="input-error-message text-xs mt-1 text-rose"
          >
            {error}
          </span>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
