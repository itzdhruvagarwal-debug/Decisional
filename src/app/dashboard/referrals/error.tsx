"use client";

import { logger } from "@/lib/logger-client";
import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function ReferralsError({
error,
reset,
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
useEffect(() => {
logger.error("Referrals page error:", error);
}, [error]);

return (
<div
role="alert"
aria-live="assertive"
className="flex flex-col items-center justify-center gap-5 text-primary flex-1 min-h-60vh"
>
<div className="text-3xl" aria-hidden="true"></div>
<h2 className="text-xl font-extrabold">Referrals failed to load</h2>
<p className="text-secondary text-sm text-center max-w-380">
Your referral data could not be fetched. Please try again.
</p>
{error.digest && (
<code className="text-xs text-muted font-mono">Ref: {error.digest}</code>
)}
<Button variant="primary" aria-label="Retry loading referrals" onClick={() => reset()}>
Try again
</Button>
</div>
);
}
