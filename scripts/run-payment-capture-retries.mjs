const baseUrl =
  process.env.APP_BASE_URL ||
  process.env.NEXTAUTH_URL ||
  `http://127.0.0.1:${process.env.PORT || "3000"}`;

const cronSecret = process.env.CRON_SECRET;

if (!cronSecret) {
  console.error("CRON_SECRET is required for payment capture retry cron");
  process.exit(1);
}

const response = await fetch(
  new URL("/api/cron/payment-capture-retries", baseUrl),
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      "Content-Type": "application/json",
    },
  },
);

const body = await response.text();

if (!response.ok) {
  console.error("Payment capture retry cron failed", response.status, body);
  process.exit(1);
}

process.stdout.write(body.trim() ? `${body}\n` : "Payment capture retry cron completed\n");
