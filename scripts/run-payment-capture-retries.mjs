const baseUrl =
  process.env.APP_BASE_URL ||
  process.env.NEXTAUTH_URL ||
  `http://127.0.0.1:${process.env.PORT || "3000"}`;

const cronSecret = process.env.CRON_SECRET;

if (!cronSecret) {
  console.error("CRON_SECRET is required for payment capture retry cron");
  process.exit(1);
}

let response;
try {
  response = await fetch(new URL("/api/cron/payment-capture-retries", baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      "Content-Type": "application/json",
    },
  });
} catch (error) {
  console.error("Payment capture retry cron request failed", error);
  process.exit(1);
}

const body = await response.text();

if (!response.ok) {
  console.error("Payment capture retry cron failed", response.status, body);
  process.exit(1);
}

let payload = null;
try {
  payload = body ? JSON.parse(body) : null;
} catch {
  console.error("Payment capture retry cron returned non-JSON response", body);
  process.exit(1);
}

const results = Array.isArray(payload?.results) ? payload.results : [];
const failures = results.filter((item) => item && item.success === false);

if (!payload?.success || failures.length > 0) {
  console.error(
    "Payment capture retry cron completed with failures",
    JSON.stringify(
      {
        scanned: payload?.scanned ?? null,
        failed: failures.length,
        failures,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

process.stdout.write(
  `Payment capture retry cron completed. Scanned ${payload.scanned ?? 0} deals.\n`,
);
