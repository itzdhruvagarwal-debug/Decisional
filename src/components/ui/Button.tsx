import React from "react";
import Link from "next/link";

type AriaExpandedType = boolean | "true" | "false";
type AriaHasPopupType = boolean | "true" | "false" | "menu" | "listbox" | "tree" | "grid" | "dialog";
type AriaPressedType = boolean | "true" | "false" | "mixed";

export interface ButtonProps {
readonly children?: React.ReactNode;
readonly className?: string | undefined;
readonly variant?: "primary" | "secondary" | "ghost" | "success" | "danger" | "warning";
readonly size?: "sm" | "md" | "lg";
readonly loading?: boolean;
readonly leftIcon?: React.ReactNode;
readonly rightIcon?: React.ReactNode;
readonly fullWidth?: boolean;
readonly disabled?: boolean;
readonly style?: React.CSSProperties | undefined;
// Button-specific
readonly type?: "button" | "submit" | "reset";
readonly autoFocus?: boolean;
readonly onClick?: React.MouseEventHandler<HTMLButtonElement>;
readonly form?: string;
readonly name?: string;
readonly value?: string;
readonly id?: string;
readonly "aria-label"?: string;
readonly "aria-expanded"?: AriaExpandedType;
readonly "aria-haspopup"?: AriaHasPopupType;
readonly "aria-controls"?: string;
readonly "aria-pressed"?: AriaPressedType;
readonly tabIndex?: number;
// Link-specific (only used when href is provided)
readonly href?: string;
readonly prefetch?: boolean;
readonly target?: string;
readonly rel?: string;
readonly title?: string;
readonly role?: string;
readonly "aria-selected"?: boolean | "true" | "false";
readonly "aria-current"?: "true" | "false" | "page" | "step" | "location" | "date" | "time" | boolean;
readonly onMouseEnter?: React.MouseEventHandler<HTMLButtonElement>;
readonly onMouseLeave?: React.MouseEventHandler<HTMLButtonElement>;
readonly onMouseDown?: React.MouseEventHandler<HTMLButtonElement>;
readonly onMouseUp?: React.MouseEventHandler<HTMLButtonElement>;
readonly onFocus?: React.FocusEventHandler<HTMLButtonElement>;
readonly onBlur?: React.FocusEventHandler<HTMLButtonElement>;
readonly onKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>;
readonly onKeyUp?: React.KeyboardEventHandler<HTMLButtonElement>;
readonly "aria-busy"?: boolean | "true" | "false";
readonly "aria-live"?: "off" | "assertive" | "polite";
readonly "aria-atomic"?: boolean | "true" | "false";
readonly "aria-describedby"?: string;
readonly "aria-labelledby"?: string;
readonly "aria-hidden"?: boolean | "true" | "false";
readonly "data-active"?: boolean | "true" | "false";
}

export const Button = React.forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
(
{
children,
className = "",
variant = "primary",
size = "md",
loading = false,
leftIcon,
rightIcon,
fullWidth = false,
disabled,
href,
type = "button",
autoFocus,
prefetch,
target,
rel,
onClick,
onMouseEnter,
onMouseLeave,
onMouseDown,
onMouseUp,
onFocus,
onBlur,
onKeyDown,
onKeyUp,
form,
name,
value,
id,
tabIndex,
...ariaProps
},
ref
) => {
const classes = [
"btn",
`btn-${variant}`,
size !== "md" ? `btn-${size}` : "",
fullWidth ? "w-full" : "",
className,
]
.filter(Boolean)
.join(" ");

const content = (
<>
{loading && <span className={`loading ${children ? "loading-with-label" : ""}`} />}
{!loading && leftIcon && (
<span className="btn-icon-left inline-flex items-center">
{leftIcon}
</span>
)}
{children}
{!loading && rightIcon && (
<span className="btn-icon-right inline-flex items-center">
{rightIcon}
</span>
)}
</>
);

if (href) {
return (
<Link
href={href}
className={classes}
{...(prefetch !== undefined ? { prefetch } : {})}
{...(target !== undefined ? { target } : {})}
{...(rel !== undefined ? { rel } : {})}
{...(id !== undefined ? { id } : {})}
{...(tabIndex !== undefined ? { tabIndex } : {})}
ref={ref as React.Ref<HTMLAnchorElement>}
{...ariaProps}
>
{content}
</Link>
);
}

return (
<button
type={type}
autoFocus={autoFocus}
className={classes}
disabled={disabled || loading}
onClick={onClick}
onMouseEnter={onMouseEnter}
onMouseLeave={onMouseLeave}
onMouseDown={onMouseDown}
onMouseUp={onMouseUp}
onFocus={onFocus}
onBlur={onBlur}
onKeyDown={onKeyDown}
onKeyUp={onKeyUp}
form={form}
name={name}
value={value}
id={id}
tabIndex={tabIndex}
ref={ref as React.Ref<HTMLButtonElement>}
{...ariaProps}
>
{content}
</button>
);
}
);

Button.displayName = "Button";
