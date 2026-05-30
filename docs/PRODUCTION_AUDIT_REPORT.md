# Decisional Production Audit Report

Last updated: 2026-05-30

This report describes the real product logic implemented in the codebase after the latest hardening pass. It is written for founders, senior engineers, product reviewers, and deployment owners.

## Executive Status

Status: production candidate after environment setup and real payment/OAuth/KYC provider credentials are configured.

Validation completed locally:

- `npm run typecheck` passed.
- `npm run lint` passed.
- Critical contract/payment logic was aligned so signed deal terms and Razorpay hold amounts use the same brand fee snapshot.
- PWA install/download controls now provide deterministic iOS and Android install guidance when the browser install prompt is unavailable.
- Login callback URL handling was hardened against open redirects and server-side `window` access.
- Register mobile layout was fixed for long forms and small screens.

## Primary Roles

Admin:

- Manage users, payouts, financial analytics, disputes, verification reviews, and seed platform badges.
- All admin routes should derive authority from the authenticated server session and `requireActiveAdmin`.
- Admin email should never be trusted from client payloads.

Brand:

- Register with email OTP and phone OTP.
- Complete profile, India tax compliance, verification, and payment setup.
- Create campaigns or direct invites.
- Review applications, accept influencers, sign contracts, pre-authorize payments, approve content, raise disputes, and review outcomes.

Influencer:

- Register with email OTP and phone OTP.
- Build profile, rates, social links, India tax compliance, verification, and bank details.
- Apply to campaigns, sign contracts, submit content, post approved content, verify posts, receive payouts, message brands, collect badges, and earn referral rewards.

## Authentication And Onboarding Flow

1. User selects role on `/register`.
2. Email OTP is sent through `/api/auth/verify-email-otp`.
3. Phone OTP is sent through `/api/auth/verify-otp`.
4. WhatsApp is the preferred phone OTP channel when configured; SMS is the fallback.
5. Registration is accepted only after Redis-backed email and phone verification flags exist.
6. User is created with:
   - `status = ACTIVE`
   - `verificationLevel = BASIC`
   - referral code
   - wallet
   - initial India tax compliance record
   - role-specific profile
7. Login uses credentials or Google when configured.
8. Login callback URL is constrained to same-origin relative or same-origin absolute URLs.
9. Protected routes use session checks and redirect unauthorized users to `/login`.

Security rules:

- OTP verification cannot be bypassed by only sending booleans in the registration body; the API checks Redis verification keys.
- Password policy is enforced server-side with uppercase, lowercase, number, special character, min 8, max 100.
- Login has client and server rate limiting.
- Two-factor authentication is supported from settings.

## Campaign Flow

Brand campaign:

1. Brand creates campaign with budget, brief, deliverables, targeting, product seeding, and deadlines.
2. Campaign can move through `DRAFT`, `PENDING_APPROVAL`, `ACTIVE`, `PAUSED`, `COMPLETED`, `CANCELLED`.
3. Influencers apply with a proposal, rate, and estimated delivery.
4. Brand accepts or rejects applications.
5. On acceptance, a deal is created in `PENDING_SIGNATURE`.

Direct invite flow:

1. Brand creates a direct campaign or invite with a selected influencer.
2. Deal is generated immediately with normalized contract terms.
3. Influencer can accept/sign or reject the invite.

Core guardrails:

- Campaign and application ownership is checked in service/API layers.
- Campaign deliverables are typed and validated.
- Deadlines are stored as dates and used by dispute and auto-approval logic.

## Brand And Influencer Contract Logic

Contract generation is handled by `src/lib/contract-engine.ts`.

The signed contract now includes:

- Creator fee (`dealAmount`)
- Brand payable total (`totalAmount`)
- Platform fee
- Gateway fee
- Platform fee percent
- Influencer payout
- Product handling fee
- Disclosure requirement
- Content usage window
- Brand obligations
- Influencer obligations
- India tax note
- Proposal message
- Normalized deliverables
- Mandatory tags and handles extracted from campaign text and proposal

Contract integrity rules:

- Contract terms are hashed with deterministic JSON stringification.
- Brand and influencer signatures are stored separately.
- Duplicate signature attempts are blocked.
- Contract hash changes invalidate old signatures.
- Payment amount shown on deal pages uses the locked deal fee snapshot, not a recalculated value.

Default contract rules:

- Submission deadline: campaign content deadline or 7 days from generation.
- Posting deadline: campaign posting deadline or 14 days from generation.
- Review window: 48 hours.
- Included revisions: 2.
- Extra revision fee: 50000 paise.
- Mandatory disclosure defaults to `#ad` and `#sponsored` when no disclosure tags are found.
- Post live monitoring default: 30 days.
- Content usage default: 30 days organic resharing only unless explicitly agreed.

## Payment And Ledger Flow

Payment provider: Razorpay Orders, manual capture, refunds, RazorpayX payouts.

Brand pre-authorization:

1. Deal is created with a locked payment snapshot.
2. Brand signs required contract terms.
3. Payment hold is created with `createPreAuthOrder`.
4. Razorpay order notes include deal id and fee snapshot status.
5. PaymentHold status moves through `PENDING`, `HELD`, `CAPTURED`, `RELEASED`, `EXPIRED`, `FAILED`.

Fee rules:

- Influencer receives full deal amount.
- Brand pays deal amount + platform fee + gateway fee.
- Brand fee uses the best available effective platform fee:
  - level-based fee
  - referral-tier fee discount
  - lowest valid fee wins
- If a deal already has a locked snapshot, payment hold uses that exact snapshot.

Capture/release:

- Capture occurs when deal conditions are met.
- Capture failures are retried by `/api/cron/payment-capture-retries`.
- Pre-auth release refunds the authorized payment when a hold must be cancelled.

Ledger integrity:

- Wallet transactions should be double-entry for platform movements, payouts, refunds, and clawbacks.
- Dispute clawback code writes offsetting debit/credit transaction records.
- Razorpay webhook processing uses signature verification and replay protection.

## Deal Lifecycle

Deal statuses:

- `PENDING_SIGNATURE`
- `PAYMENT_PENDING`
- `PAYMENT_HELD`
- `ACTIVE`
- `CONTENT_SUBMITTED`
- `REVISION_REQUESTED`
- `CONTENT_APPROVED`
- `POSTED`
- `VERIFICATION_PENDING`
- `VERIFIED`
- `COMPLETED`
- `DISPUTED`
- `CANCELLED`

Expected end-to-end flow:

1. Deal generated from campaign application or invite.
2. Brand and influencer sign contract.
3. Brand pre-authorizes payment.
4. Deal becomes active after payment hold.
5. Influencer submits content.
6. Brand approves or requests revision.
7. Influencer posts approved content.
8. Post verification runs through social provider APIs or supported fallback checks.
9. Payment is captured and wallet/payout path opens.
10. Post monitor watches for deletion/private status during the monitoring window.

## Cancellation And Refund Rules

Cancellation logic lives in `src/lib/contract-engine.ts`.

Rules:

- Before content submission: 100% refund to brand.
- After content submission but before approval: 50% creator payout / 50% brand refund.
- After content approval: 80% creator payout / 20% brand refund.
- Platform keeps 10% of creator payout as commission in cancellation calculation.

Important production note:

- Refund and payout math must always be auditable in wallet transactions and external payment provider records.

## Dispute Flow And Penalty Rules

Dispute types:

- `QUALITY`
- `TIMELINE`
- `PAYMENT`
- `CONTENT_DELETED`
- `TERMS_VIOLATION`
- `OTHER`

Dispute statuses:

- `OPEN`
- `TIER1_AUTO`
- `TIER2_MEDIATION`
- `TIER3_ARBITRATION`
- `RESOLVED`
- `CLOSED`

Auto-mediation rules:

- Brand late review beyond the review window can auto-approve content and release influencer payment.
- Influencer missing submission by more than 48 hours can trigger full brand refund.
- Late but delivered content can suggest 50/50 split.
- Quality disputes require specific brand feedback before penalizing the influencer.
- Content deleted/private within 30 days can trigger clawback.
- Payment disputes are usually invalid while pre-auth is active and held.
- Ambiguous cases escalate to human mediation.

Progressive penalty rules:

- Strike 1: warning, trust -5.
- Strike 2: 24 hour cooldown, trust -10.
- Strike 3: 7 day suspension, trust -20, payout hold review.
- Strike 4: 30 day ban, trust -50, manual review.
- Strike 5+: permanent ban, trust -100.

Penalty categories:

- Fake engagement
- Post deletion
- Content plagiarism
- Missed deadline
- Fake metrics
- Payment fraud
- Harassment
- Spam
- Late response
- Other terms violation

## Referral Logic

Referral tiers:

- Starter: 0 active referrals, no discount.
- Bronze: 10 active referrals, 250 XP, 1% fee discount.
- Silver: 50 active referrals, 1500 XP, 1.5% fee discount.
- Gold: 100 active referrals, 3500 XP, 2% fee discount.
- Platinum: 500 active referrals, 1% GMV revenue share, keeps 2% fee discount.
- Diamond: 1000 active referrals, 2% GMV revenue share, keeps 2% fee discount.

Rules:

- Referral rewards are single-level only.
- Active referral means a referred user has completed meaningful activity such as completed deal/campaign.
- Low-trust referrers are blocked from earning rewards.
- Tier upgrades can award XP even when monetary reward is zero.
- Effective platform fee combines referral discount with level-based discount.

## XP, Level, And Badge Logic

Levels:

- Level 1 Rookie: 0 XP
- Level 2 Rising Star: 101 XP
- Level 3 Creator: 501 XP
- Level 4 Pro: 1501 XP
- Level 5 Expert: 3001 XP
- Level 6 Elite: 6001 XP
- Level 7 Master: 10001 XP
- Level 8 Champion: 20001 XP
- Level 9 Icon: 40001 XP
- Level 10 Legend: 75000 XP

Level fee rules:

- Level 1-3: 10% platform fee.
- Level 4-5: 9% platform fee.
- Level 6-7: 8% platform fee.
- Level 8-10: 7% platform fee.

Badge categories:

- Verification
- Milestone
- Achievement
- Community
- Special
- Brand

Badge triggers:

- Deal completion
- Earnings thresholds
- Verification status
- Profile completeness
- Reviews
- Referrals
- Campaign milestones

## Messaging Logic

Messaging service: `src/services/message.service.ts`.

Rules:

- Users can message themselves: blocked.
- Direct messages require an existing conversation or a shared deal, unless user is admin.
- Deal messages are limited to deal participants or admins.
- Banned/suspended users cannot send messages.
- Message rate limits:
  - 20 messages per minute
  - 500 messages per day
- Contact sharing detection blocks sensitive contact info.
- Blocked messages are redacted for non-admin users.
- Admin alerts are created for contact-sharing attempts.
- Read receipts are written when listing messages.
- Typing indicator uses Redis with short TTL.

## India Compliance Logic

Implemented compliance areas:

- PAN and GSTIN validation formats.
- India tax compliance profile per user.
- GST registration status.
- Compliance status workflow.
- Verification tiers for Aadhaar/selfie, PAN/bank statement, and brand business documents.
- Withdrawal rules for bank account/IFSC/UPI formats.

Product/legal note:

- This product can support GST/TDS/ITR workflows, but final wording, invoices, tax collection, TDS certificates, and filing duties must be reviewed by a qualified India tax professional before launch.

## PWA And Mobile UX

PWA setup:

- `manifest.ts` defines app name, icons, shortcuts, theme, standalone display, and app scope.
- `PWARegister` registers service worker in production.
- Download/install buttons exist for iOS and Android.
- iOS uses Safari "Add to Home Screen" fallback because iOS does not expose the same install prompt event as Chromium.
- Android uses the browser install prompt when available and fallback instructions otherwise.

Mobile fixes applied:

- Long registration forms no longer use clipping overflow.
- OTP rows wrap on small screens.
- PWA modal text colors are fixed on white dialog surfaces.
- Store-style install buttons have stable dimensions.

## External Service Dependencies

Required for production:

- Vercel Pro: Next.js hosting, regions, cron, serverless functions.
- Supabase Postgres: primary database.
- Supabase transaction pooler or Prisma Accelerate: connection scaling on Vercel.
- Upstash Redis: rate limits, OTP state, idempotency, typing indicators, cache.
- Razorpay: Orders, pre-auth/manual capture, refunds.
- RazorpayX: payouts.
- Cloudflare R2 or S3: durable uploads.
- Resend or equivalent email provider: transactional emails.
- MSG91 or equivalent SMS provider: SMS OTP fallback.
- WhatsApp provider: Meta Cloud API or Twilio WhatsApp for OTP primary channel.

Optional but recommended:

- Google OAuth.
- Instagram Graph API for official content/social verification.
- YouTube Data API for official video verification.
- KYC provider such as Surepass/DigiLocker/IDfy.
- IP intelligence such as IPinfo.
- Push provider such as FCM or OneSignal.
- Sentry or equivalent error monitoring.
- Prometheus/Grafana or Vercel Observability for metrics.
- Cloudflare WAF/CDN in front of custom domain.

## Open Production Risks

- Real authenticated end-to-end tests need seeded real admin, brand, and influencer accounts plus test Razorpay credentials.
- Provider dashboards must be configured before production launch: Razorpay webhooks, WhatsApp templates, Google OAuth redirect URIs, storage CORS, and custom domains.
- Tax/legal copy is platform-ready but should receive professional review for India-specific obligations.
- Some older dashboard files remain large and should be split further in a later maintainability pass.

## Senior Engineering Recommendations

1. Add Playwright E2E tests for:
   - register influencer
   - register brand
   - login
   - campaign create
   - application accept
   - contract signing
   - payment pre-auth test flow
   - content submission/review
   - dispute escalation
   - messaging read/typing flow
2. Add seed script for deterministic demo users:
   - admin
   - brand
   - influencer
3. Add a financial reconciliation job:
   - Razorpay order/payment state vs `PaymentHold`
   - wallet transactions vs captured payment totals
4. Add structured audit log dashboards for admin-sensitive mutations.
5. Move remaining large dashboard pages into feature components.
6. Add provider health checks for Razorpay, Redis, storage, email, and database.
