import React from "react";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  readonly label?: string;
  readonly error?: string;
  readonly fullWidth?: boolean;
  readonly options?: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className = "",
      label,
      error,
      fullWidth = false,
      id,
      style,
      options,
      children,
      ...props
    },
    ref
  ) => {
    const selectId =
      id ?? (label ? `select-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

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
          <label className="label" htmlFor={selectId} style={{ marginBottom: 0 }}>
            {label}
          </label>
        )}
        <select
          id={selectId}
          className={`input ${error ? "input-error" : ""} ${className}`}
          style={{ cursor: "pointer" }}
          ref={ref}
          {...props}
        >
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
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

Select.displayName = "Select";
