# Decisional Deployment Guide

Target stack: Vercel Pro + Supabase Postgres + Upstash Redis + Cloudflare R2.

Last updated: 2026-05-30

Official docs used for this guide:

- Vercel Next.js: https://vercel.com/docs/concepts/next.js/overview
- Vercel Cron Jobs: https://vercel.com/docs/cron-jobs
- Supabase Prisma: https://supabase.com/docs/guides/database/prisma
- Upstash Redis TLS: https://upstash.com/docs/redis/overall/getstarted
- Cloudflare R2 S3 API: https://developers.cloudflare.com/r2/api/s3/
- Razorpay webhooks: https://razorpay.com/docs/webhooks/
- RazorpayX payouts: https://razorpay.com/docs/x/payouts/api/
- Resend docs: https://resend.com/docs

## Deployment Architecture

Recommended production architecture:

- App hosting: Vercel Pro, region `bom1`.
- Database: Supabase Postgres, India/nearest region if available.
- Runtime DB connections: Supabase transaction pooler or Prisma Accelerate.
- Redis: Upstash Redis with TLS (`rediss://`).
- Object storage: Cloudflare R2 with S3-compatible credentials.
- Payments: Razorpay Orders + manual capture + RazorpayX payouts.
- Email: Resend.
- OTP: WhatsApp first, SMS fallback.
- Social verification: official Meta/Instagram Graph API and YouTube Data API.

Why this stack:

- Low operational load.
- Good India latency with Vercel `bom1` and nearby Supabase/Upstash regions.
- Serverless-compatible database pooling.
- Durable uploads outside Vercel filesystem.
- Built-in cron support through `vercel.json`.

## Pre-Deployment Checklist

1. Create production Vercel project.
2. Create Supabase project and run Prisma migrations.
3. Create Upstash Redis database with TLS.
4. Create Cloudflare R2 bucket and S3 API token.
5. Create Razorpay live keys and webhook secret.
6. Enable RazorpayX payouts and get account number.
7. Verify email sending domain in Resend.
8. Configure WhatsApp OTP provider and SMS fallback.
9. Configure Google OAuth and social APIs if enabled.
10. Set all production environment variables in Vercel.
11. Run `npm run deploy:check` locally or in CI.
12. Deploy preview, smoke test, then promote to production.

## Required Environment Variables

App:

```env
NODE_ENV=production
NEXTAUTH_URL=https://your-domain.com
NEXT_PUBLIC_APP_URL=https://your-domain.com
APP_BASE_URL=https://your-domain.com
NEXTAUTH_SECRET=<32+ char secret>
```

Database:

```env
DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require
PGBOUNCER_URL=postgresql://postgres.<project-ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true&connection_limit=1
PRISMA_ACCELERATE_URL=
```

Use `DATABASE_URL` for migrations/admin tooling. Use `PGBOUNCER_URL` or Prisma Accelerate for Vercel runtime traffic.

Redis:

```env
REDIS_URL=rediss://default:<password>@<host>.upstash.io:6379
```

Payments:

```env
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=<secret>
RAZORPAY_WEBHOOK_SECRET=<webhook-secret>
RAZORPAY_ACCOUNT_NUMBER=<razorpayx-account-number>
```

Cron and signatures:

```env
CRON_SECRET=<openssl rand -hex 32>
CONTRACT_SIGNING_SECRET=<openssl rand -hex 32>
SIGNING_SECRET=<openssl rand -hex 32>
```

Storage:

```env
STORAGE_PROVIDER=r2
S3_BUCKET=decisional-prod
S3_REGION=auto
S3_ACCESS_KEY=<r2-access-key-id>
S3_SECRET_KEY=<r2-secret-access-key>
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
STORAGE_PUBLIC_URL=https://cdn.your-domain.com
R2_PUBLIC_URL=
```

Email:

```env
RESEND_API_KEY=<resend-key>
FROM_EMAIL=noreply@your-domain.com
REPLY_TO_EMAIL=support@your-domain.com
```

OTP:

```env
OTP_PRIMARY_CHANNEL=whatsapp
OTP_SMS_FALLBACK=true
WHATSAPP_PROVIDER=auto
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_OTP_TEMPLATE_NAME=
WHATSAPP_TEMPLATE_LANGUAGE=en_US
MSG91_AUTH_KEY=
MSG91_SENDER_ID=DCSNL
MSG91_TEMPLATE_ID=
```

Monitoring and limits:

```env
LOG_LEVEL=info
PROMETHEUS_AUTH_TOKEN=<openssl rand -hex 32>
PLATFORM_FEE_PERCENTAGE=10
GATEWAY_FEE_PERCENTAGE=2
MIN_WITHDRAWAL_AMOUNT=50000
MAX_WALLET_BALANCE=1000000000
ADMIN_EMAILS=admin@your-domain.com
```

Encryption:

```env
ENCRYPTION_KEYS=v1:<64-hex-key>
ENCRYPTION_KEY=
```

Optional providers:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
YOUTUBE_API_KEY=
KYC_PROVIDER=manual
KYC_API_KEY=
IPINFO_TOKEN=
FCM_SERVER_KEY=
ONESIGNAL_APP_ID=
ONESIGNAL_API_KEY=
```

## Supabase Setup

1. Create Supabase project.
2. Copy direct connection string to `DATABASE_URL`.
3. Copy transaction pooler connection string to `PGBOUNCER_URL`.
4. Ensure pooler URL includes:
   - `sslmode=require`
   - `pgbouncer=true`
   - `connection_limit=1`
5. Run migrations:

```bash
npx prisma migrate deploy
npx prisma generate
```

6. Verify:

```bash
npx prisma validate
```

Scaling notes:

- Vercel serverless functions can open many short-lived connections.
- Always use pooler/Accelerate in production runtime.
- Keep long-running analytics queries out of hot request paths.

## Upstash Redis Setup

1. Create Upstash Redis database.
2. Choose a low-latency region near Vercel/Supabase when possible.
3. Use TLS Redis URL (`rediss://`), not plain `redis://`.
4. Set `REDIS_URL` in Vercel.

Used for:

- Rate limiting
- OTP state
- Idempotency
- Payment retry locks
- Typing indicators
- Caching

## Cloudflare R2 Setup

1. Create R2 bucket.
2. Create S3-compatible API token with least privilege for the bucket.
3. Set:
   - `S3_BUCKET`
   - `S3_ACCESS_KEY`
   - `S3_SECRET_KEY`
   - `S3_ENDPOINT`
   - `STORAGE_PUBLIC_URL`
4. Add custom domain for public assets if possible.
5. Configure CORS for upload/read flows used by the app.

Production rule:

- Never use `STORAGE_PROVIDER=local` on Vercel. Vercel filesystem is not durable for user uploads.

## Vercel Setup

Project:

- Framework preset: Next.js.
- Node: 20+ recommended.
- Region: `bom1` configured in `vercel.json`.
- Build command: `npm run build`.
- Install command: `npm ci`.

`vercel.json` already configures:

- API function durations.
- Payment capture retry cron every 5 minutes.
- Content auto-approval cron every 15 minutes.
- Engagement cron hourly.
- Suspension lift cron hourly.
- Post monitor daily.
- Social proof weekly.
- Weekly challenges weekly.

Deploy:

```bash
npm ci
npm run deploy:check
vercel
vercel --prod
```

CI deploy pattern:

```bash
vercel pull --yes --environment=production --token=$VERCEL_TOKEN
vercel build --prod --token=$VERCEL_TOKEN
vercel deploy --prebuilt --prod --token=$VERCEL_TOKEN
```

Required CI secrets:

```env
VERCEL_TOKEN=<token>
VERCEL_ORG_ID=<org-id>
VERCEL_PROJECT_ID=<project-id>
```

## Razorpay Setup

Orders and pre-auth:

1. Create live API keys.
2. Set whitelisted production domain in Razorpay dashboard.
3. Configure webhook endpoint:

```text
https://your-domain.com/api/payments/webhook
```

4. Use the same webhook secret in `RAZORPAY_WEBHOOK_SECRET`.
5. Enable required payment events:
   - payment authorized
   - payment captured
   - payment failed
   - refund processed/failed

RazorpayX payouts:

1. Complete RazorpayX activation and KYC.
2. Set `RAZORPAY_ACCOUNT_NUMBER`.
3. Verify payout modes and bank validation rules.
4. Test payout flow with a small internal account before public launch.

## Email Setup

Resend:

1. Add and verify production domain.
2. Add DNS records.
3. Set `FROM_EMAIL` on a verified domain.
4. Set `RESEND_API_KEY`.
5. Test:
   - registration OTP
   - password reset
   - deal update
   - payout update

## WhatsApp And SMS OTP Setup

WhatsApp primary:

- Option A: Meta WhatsApp Cloud API.
- Option B: Twilio WhatsApp.

Requirements:

- Approved sender.
- Approved authentication OTP template.
- Template language matching `WHATSAPP_TEMPLATE_LANGUAGE`.
- Fallback SMS configured.

SMS fallback:

- Configure MSG91 or equivalent.
- Confirm DLT template approval for India if required.
- Set sender ID and template ID.

## Google OAuth Setup

Set in Google Cloud Console:

- Authorized JavaScript origins:

```text
https://your-domain.com
```

- Authorized redirect URI:

```text
https://your-domain.com/api/auth/callback/google
```

Then set:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

## Social Verification APIs

Instagram:

- Use official Instagram Graph API for creator/business accounts.
- Configure Meta app, app review permissions, redirect URIs, and long-lived tokens as required.
- Set `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET`.

YouTube:

- Enable YouTube Data API v3.
- Set `YOUTUBE_API_KEY`.
- Use official video/channel endpoints for verification and engagement checks.

## KYC Provider Setup

Supported config:

```env
KYC_PROVIDER=manual
KYC_API_KEY=
```

Recommended production options:

- DigiLocker integration
- Surepass
- IDfy

Minimum production checks:

- PAN format validation.
- GSTIN format validation.
- Bank account/IFSC validation.
- Secure document upload to R2/S3.
- Admin verification queue.

## Monitoring And Operations

Health:

```text
/api/health
```

Metrics:

```text
/api/metrics
Authorization: Bearer <PROMETHEUS_AUTH_TOKEN>
```

Recommended monitoring:

- Vercel Observability for functions and traffic.
- Sentry for frontend and API errors.
- Prometheus/Grafana for business metrics.
- Razorpay dashboard reconciliation.
- Supabase query performance dashboards.
- Upstash Redis command/error dashboards.

Alerts:

- Payment capture failures.
- Webhook signature failures.
- Redis unavailable.
- Database pool exhaustion.
- Upload failures.
- High 401/403 rate.
- High dispute creation rate.
- Payout failure rate.

## Production Smoke Test

Run after every production deploy:

1. Open `/`.
2. Click iOS and Android download buttons. Confirm install guide appears.
3. Register test influencer.
4. Register test brand.
5. Login as brand.
6. Create campaign.
7. Login as influencer.
8. Apply to campaign.
9. Login as brand.
10. Accept application.
11. Sign contract as both parties.
12. Create Razorpay test/pre-auth hold in test environment.
13. Submit content.
14. Approve content.
15. Verify post.
16. Confirm payment capture/retry behavior.
17. Test messages, typing indicator, and read state.
18. Raise and resolve a dispute.
19. Check admin analytics, users, payouts, and verification screens.

## Rollback Plan

Vercel:

```bash
vercel rollback
```

Database:

- Prefer forward-only migrations.
- If rollback requires DB change, write compensating migration.
- Backup before large schema changes.

Payments:

- Disable capture cron if payment logic is suspected.
- Keep webhook endpoint online to continue receiving payment state changes.
- Reconcile Razorpay dashboard before manually editing wallet state.

## Launch Readiness Gate

Do not launch until all are true:

- `npm run deploy:check` passes.
- All required Vercel env vars set in production.
- Supabase pooler/Accelerate configured.
- Upstash Redis uses `rediss://`.
- R2/S3 public URL works.
- Razorpay webhook signature test passes.
- RazorpayX test payout passes.
- Email domain verified.
- OTP WhatsApp/SMS tested on real India numbers.
- Admin account created and verified.
- Real brand/influencer E2E smoke test passes.
- Privacy, Terms, Refund, Cookie, Contact pages reviewed.
- Tax/legal text reviewed by counsel or CA.
