"use client";

import { logger } from "@/lib/logger-client";
import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function DealsError({
error,
reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
useEffect(() => {
logger.error("Deals page error:", error);
}, [error]);

return (
<div
role="alert"
aria-live="assertive"
className="flex flex-col items-center justify-center gap-5 text-primary flex-1 min-h-60vh"
>
<div className="text-3xl" aria-hidden="true"></div>
<h2 className="text-xl font-extrabold">Deals failed to load</h2>
<p className="text-secondary text-sm text-center max-w-380">
Your deals could not be fetched. Please try again.
</p>
{error.digest && (
<code className="text-xs text-muted font-mono">Ref: {error.digest}</code>
)}
<Button variant="primary" aria-label="Retry loading deals" onClick={() => reset()}>
Try again
</Button>
</div>
);
}
