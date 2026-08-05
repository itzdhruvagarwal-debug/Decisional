"use client";

import { logger } from "@/lib/logger-client";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function GlobalError({
error,
reset,
}: Readonly<{
error: Error & { digest?: string };
reset: () => void;
}>) {
useEffect(() => {
// Log the error to an error reporting service
logger.error(error);
}, [error]);

return (
<html lang="en">
<head>
<title>System Error - Decisional</title>
</head>
<body
className="flex items-center justify-center p-6 bg-primary text-primary min-h-screen font-inter"
>
{/* Abstract Background Elements */}
<div className="fixed z-0 system-error-bg-glow" />

<div className="glass col-span-2 text-center w-full relative rounded-xl z-1 system-error-card border-rose-subtle">
<div
className="flex items-center justify-center mb-8 bg-rose-subtle text-rose rounded-full text-3xl mx-auto w-80 system-error-icon border-rose-subtle"
>

</div>

<h1 className="gradient-text text-xl font-extrabold mb-4 bg-gradient-rose-orange">
System Malfunction
</h1>

<p className="text-secondary text-sm mb-8">
We've encountered a critical exception in the core engine.
Our engineering team has been automatically alerted.
</p>

{error.digest && (
<div className="text-xs text-muted mb-8 p-3 rounded-md border-card font-mono bg-glass-light">
Digest: {error.digest}
</div>
)}

<div className="flex gap-3">
<Button
onClick={() => reset()}
variant="danger"
aria-label="Restart Session"
className="flex-1 btn-restart-shadow"
>
Restart Session
</Button>
<Button
href="/"
variant="secondary"
className="flex-1"
>
Return Home
</Button>
</div>
</div>
</body>
</html>
);
}
