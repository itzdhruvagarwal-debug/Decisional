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
      options,
      children,
      ...props
    },
    ref
  ) => {
    const selectId =
      id ?? (label ? `select-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);
    const wrapperClasses = `input-wrapper flex flex-col gap-2 ${fullWidth ? "w-full" : "w-auto"}`;

    return (
      <div
        className={wrapperClasses}
      >
        {label && (
          <label className="label mb-0" htmlFor={selectId}>
            {label}
          </label>
        )}
        <select
          id={selectId}
          className={`input cursor-pointer ${error ? "input-error" : ""} ${className}`}
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
            className="input-error-message text-xs mt-1 text-rose"
          >
            {error}
          </span>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";
