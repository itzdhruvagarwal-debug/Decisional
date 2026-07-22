import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  readonly label?: string | undefined;
  readonly error?: string | undefined;
  readonly fullWidth?: boolean | undefined;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", label, error, fullWidth = false, id, style, ...props }, ref) => {
    const inputId = id ?? (label ? `input-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);
    
    return (
      <div 
        className="input-wrapper flex flex-col gap-2" style={{ width: fullWidth ? "100%" : "auto", ...style }}
      >
        {label && (
          <label className="label" htmlFor={inputId} style={{ marginBottom: 0 }}>
            {label}
          </label>
        )}
        <input
          id={inputId}
          className={`input ${error ? "input-error" : ""} ${className}`}
          ref={ref}
          {...props}
        />
        {error && (
          <span 
            className="input-error-message text-xs" style={{ color: "var(--color-accent-rose, #f43f5e)", marginTop: "2px" }}
          >
            {error}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
