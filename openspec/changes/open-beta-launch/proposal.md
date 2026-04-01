## Why

Baburra's flywheel depends on users importing KOL content — but the current credit system (700 free credits/week) makes YouTube transcription painful for free users, and there are no paying users yet to validate the tier model. Rather than guess at pricing, we should launch an **open beta** that removes paywall friction, raises the credit ceiling generously (5,000/week), and caps registration at 100 users with a waitlist for overflow. This gives us real usage data to inform pricing while letting beta users experience the full product. A **billing mode switch** (beta → production) ensures we can flip to real tiers without rewriting infrastructure.

## What Changes

- **New `billing_mode` system constant** — a single config flag (`beta` | `production`) that controls credit limits, feature gates, and tier enforcement globally. In `beta` mode: all users get 5,000 credits/week, all features unlocked, no upgrade prompts. In `production` mode: existing three-tier system activates.
- **Registration cap + waitlist** — `handle_new_user()` trigger checks current user count; if >= cap (initially 100), the user is created but with `status: 'waitlisted'` instead of `'active'`. Waitlisted users see a waitlist landing page instead of the app. Admin can increase cap or activate users manually.
- **New `status` column on `profiles`** — `'active' | 'waitlisted'` with middleware enforcement. Active users access the app; waitlisted users see a "you're on the waitlist" page with queue position.
- **Waitlist page** — simple page showing the user's queue position, a "we'll notify you" message, and option to log out.
- **Beta banner** — persistent top banner on all app pages indicating "Open Beta — 5,000 credits/week" with a feedback link.
- **Feature gate bypass in beta mode** — `getFeatureAccess()` returns `full_access` for all features when `billing_mode === 'beta'`, preserving the gate infrastructure for production activation.
- **Credit limit override in beta mode** — `consume_credits()` RPC uses 5,000 as the weekly limit for all users regardless of `subscription_tier` when in beta mode.
- **Remove/hide upgrade CTAs in beta mode** — paywall components (blur gate, pro badge, upgrade prompt) render as pass-through when billing mode is beta. No code deleted — just conditional rendering.
- **Resend email infrastructure** — New `resend` dependency + React Email templates for transactional emails. Beta launch scope: waitlist confirmation (you're #N), waitlist activation (you're in!), and beta welcome email. Lays foundation for future digest/alert emails. Triggered from `handle_new_user()` activation flow and admin batch-activation.

## Capabilities

### New Capabilities
- `billing-mode`: Global billing mode switch (`beta` | `production`) controlling credit limits, feature gates, and tier enforcement. Single source of truth for the business model state.
- `waitlist`: Registration cap with waitlist overflow. Includes `profiles.status` column, `handle_new_user()` gating, middleware enforcement, waitlist page, and admin cap control.
- `email`: Transactional email infrastructure via Resend + React Email. Reusable client, React component templates, and three beta-launch emails (waitlist confirmation, activation, welcome).

### Modified Capabilities
- `data-models`: New `status` column on `profiles`, new `app_config` table or constants for billing mode and registration cap.
- `api-contracts`: Middleware gains waitlist enforcement; all protected routes redirect waitlisted users.

## Impact

- **Database**: Migration adding `profiles.status` column (default `'active'`), `app_config` table (or env var for billing mode + user cap), update to `handle_new_user()` trigger for cap enforcement
- **Middleware**: `src/middleware.ts` gains waitlist check — redirect `status: 'waitlisted'` users to `/waitlist`
- **Domain services**: `feature-gate.service.ts` gains billing mode awareness; returns `full_access` in beta mode
- **Infrastructure**: `consume_credits()` RPC gains billing mode check for limit override
- **Components**: Paywall components gain beta-mode bypass; new beta banner component; new waitlist page
- **Constants**: New `src/lib/constants/billing.ts` for billing mode, beta credit limit, and registration cap
- **Dependencies**: New npm packages `resend` and `@react-email/components`
- **Infrastructure**: New `src/infrastructure/email/` directory with Resend client and React Email templates
- **Environment**: New `RESEND_API_KEY` env var required for email sending
- **i18n**: New translation keys for waitlist page, beta banner, and email templates (zh-TW + en)
- **Existing tiers**: No deletion — all tier infrastructure preserved, just bypassed in beta mode
