## 1. Database Migration

- [x] 1.1 Create migration: add `profiles.status` column (`TEXT NOT NULL DEFAULT 'active'` with CHECK constraint `IN ('active', 'waitlisted')`), backfill existing rows to `'active'`
- [x] 1.2 In same migration: set Postgres custom settings `app.billing_mode` (default `'production'`) and `app.user_cap` (default `'100'`) via `ALTER DATABASE`
- [x] 1.3 Update `handle_new_user()` trigger: count active profiles, set `status = 'waitlisted'` when count >= `current_setting('app.user_cap')::int`. Use advisory lock to prevent race condition
- [x] 1.4 Update `consume_credits()` RPC: when `current_setting('app.billing_mode', true) = 'beta'`, use 5000 as weekly limit regardless of tier
- [x] 1.5 Update `refund_credits()` RPC: when billing mode is `'beta'`, cap refund at 5000
- [x] 1.6 Run `supabase db push --dry-run` to verify, then push with confirmation (applied via Supabase MCP)

## 2. Billing Mode Constants & Config

- [x] 2.1 Create `src/lib/constants/billing.ts`: export `BILLING_MODE` (from `NEXT_PUBLIC_BILLING_MODE` env), `BETA_CREDIT_LIMIT = 5000`, `BETA_KOL_TRACKING_LIMIT = 50`
- [x] 2.2 Add `NEXT_PUBLIC_BILLING_MODE`, `USER_CAP`, `RESEND_API_KEY`, `ADMIN_SECRET`, and `EMAIL_FROM` to `.env.example` with documentation
- [x] 2.3 Update `CREDIT_LIMITS` in `src/domain/models/user.ts`: add helper `getEffectiveCreditLimit(tier)` that returns `BETA_CREDIT_LIMIT` when billing mode is beta
- [x] 2.4 Update `TIER_LIMITS` in `src/lib/constants/tiers.ts`: add helper `getEffectiveKolLimit(tier)` that returns `BETA_KOL_TRACKING_LIMIT` when billing mode is beta

## 3. Feature Gate & Paywall Bypass

- [x] 3.1 Update `getFeatureAccess()` in `feature-gate.service.ts`: return `{ gate: 'full_access' }` for all features when `BILLING_MODE === 'beta'`
- [x] 3.2 Update `useFeatureGate` hook: no changes needed (bypass propagates from service)
- [x] 3.3 Update `<BlurGate>` component: render children without blur when billing mode is beta
- [x] 3.4 Update `<ProBadge>` component: render as normal button (no lock) when billing mode is beta
- [x] 3.5 Update `<UpgradePrompt>` component: don't render when billing mode is beta
- [x] 3.6 Update `<TrackingLimitGate>` component: use beta KOL tracking limit when applicable

## 4. Email Infrastructure (Resend)

- [x] 4.1 Install `resend` and `@react-email/components` packages
- [x] 4.2 Create `src/infrastructure/email/resend.client.ts`: Resend SDK wrapper with `sendEmail(to, subject, reactComponent)`. Read `RESEND_API_KEY` and `EMAIL_FROM` from env. Log errors but never throw (fire-and-forget pattern)
- [x] 4.3 Create `src/infrastructure/email/templates/waitlist-confirm.tsx`: React Email template showing queue position, "we'll notify you" message, Baburra branding
- [x] 4.4 Create `src/infrastructure/email/templates/waitlist-activated.tsx`: React Email template with welcome message, login link, beta credit limit info
- [x] 4.5 Create `src/infrastructure/email/templates/beta-welcome.tsx`: React Email template with welcome message, credit limit, link to scrape page, feedback link

## 5. Waitlist Middleware & API

- [x] 5.1 Update `src/middleware.ts`: after auth check, query `profiles.status` for authenticated users; redirect waitlisted users to `/waitlist` (pages) or return 403 (APIs). Add `/waitlist` to public routes list
- [x] 5.2 Create `GET /api/waitlist/position` route: return `{ position, total }` for waitlisted users, 404 for active users
- [x] 5.3 Create `GET /api/auth/capacity` route (public): return `{ activeUsers, cap, status }` where status is `'open'` | `'near_capacity'` | `'full'`
- [x] 5.4 Create `POST /api/admin/activate-users` route: protected by `ADMIN_SECRET` header. Accept `{ userIds }` or `{ count }`. Update profiles to `'active'` + send activation emails via Resend

## 6. Waitlist Page & UI

- [x] 6.1 Create `/waitlist` page (`src/app/waitlist/page.tsx`): show queue position, total count, "we'll notify you" message, logout button. Fetch position from `/api/waitlist/position`
- [x] 6.2 Add i18n translations for waitlist page in `src/messages/zh-TW/` and `src/messages/en/` (new `waitlist.json`)
- [x] 6.3 Update registration page: fetch `/api/auth/capacity` and show capacity notice (full / near capacity / open)
- [x] 6.4 Add i18n translations for registration capacity notices

## 7. Registration Email Integration

- [x] 7.1 Update auth callback / post-registration flow: after Supabase auth completes, read `profiles.status` and send appropriate email (beta welcome if active, waitlist confirmation if waitlisted). Use fire-and-forget pattern — do not block registration on email delivery
- [x] 7.2 Test email delivery in development using Resend sandbox or test API key

## 8. Beta Banner

- [x] 8.1 Create `<BetaBanner />` component (`src/components/layout/beta-banner.tsx`): top banner showing "Open Beta — 5,000 credits/week" + feedback link, dismissible via sessionStorage
- [x] 8.2 Add `<BetaBanner />` to `src/app/(app)/layout.tsx`, conditionally rendered when `BILLING_MODE === 'beta'`
- [x] 8.3 Add i18n translations for beta banner in both locales

## 9. Domain Model & Type Updates

- [x] 9.1 Update `Profile` interface in `src/domain/models/user.ts`: add `status: 'active' | 'waitlisted'`
- [x] 9.2 Update profile repository mapper to include `status` field
- [x] 9.3 Regenerate Supabase TypeScript types via MCP `generate_typescript_types` — includes `profiles.status` field
- [x] 9.4 Run `npm run type-check` to verify all types compile

## 10. Testing & Verification

- [x] 10.1 Write unit tests for `getFeatureAccess()` beta mode bypass
- [x] 10.2 Write unit tests for `getEffectiveCreditLimit()` and `getEffectiveKolLimit()` helpers
- [ ] 10.3 Write unit test for capacity API response logic (deferred: requires Supabase mock)
- [x] 10.4 Write unit test for Resend client (mock SDK, verify fire-and-forget behavior on errors)
- [ ] 10.5 Write unit test for admin activation endpoint (deferred: requires Supabase mock)
- [ ] 10.6 Manual test: register user, verify 5000 credit limit, verify all features unlocked, verify beta banner, verify welcome email received
- [ ] 10.7 Manual test: simulate waitlist by setting `app.user_cap = 0`, register, verify waitlist page, queue position, and waitlist confirmation email
- [ ] 10.8 Manual test: call admin activation endpoint, verify user activated and activation email received
- [x] 10.9 Run `npm run type-check && npm run lint && npm test`
