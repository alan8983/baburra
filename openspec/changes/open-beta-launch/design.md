## Context

Baburra.io has a three-tier credit system (free/pro/max) with feature gates (blur, pro badge, locked) and a `consume_credits()` RPC that hardcodes tier limits (700/4200/21000). No paying users exist yet. The product needs real usage data before finalizing pricing. The current credit ceiling makes YouTube transcription impractical for free users, blocking the flywheel.

Existing infrastructure to preserve:
- `consume_credits()` / `refund_credits()` RPCs with tier-based limits
- `feature-gate.service.ts` + `useFeatureGate` hook + paywall components (blur gate, pro badge, upgrade prompt, tracking limit gate)
- `profiles.subscription_tier` column (free/pro/max)
- `profiles.credit_balance` + `credit_reset_at` weekly cycle
- `handle_new_user()` trigger on `auth.users`

## Goals / Non-Goals

**Goals:**
- Launch open beta with 100 user cap and waitlist overflow
- Give all beta users 5,000 credits/week with all features unlocked
- Preserve all tier/paywall infrastructure for production activation
- Single-point switch from beta → production mode
- Collect real usage telemetry (credit consumption patterns visible to users)
- Waitlisted users get a clear queue position and notification when activated

**Non-Goals:**
- Stripe integration or actual payment processing (deferred to go-to-market)
- Full notification email system (weekly digests, credit alerts — deferred to separate change)
- Admin dashboard for user management (use Supabase dashboard directly)
- Changing credit cost ratios (1/2/5/3 stay as-is for data collection)
- A/B testing different credit ceilings

## Decisions

### D1: Billing mode via environment variable, not database

**Decision:** Use `BILLING_MODE=beta|production` env var in `.env.local`, exposed as a server-side constant. NOT stored in a database `app_config` table.

**Why over DB table:** The billing mode switch should require a deployment (env var change + redeploy), not a runtime DB toggle. This prevents accidental switches and makes the transition a deliberate operational event. An env var is also simpler — no migration, no RPC, no cache invalidation. The `consume_credits()` RPC reads it via `current_setting('app.billing_mode', true)` which can be set per-session from the env var.

**Alternative considered:** `app_config` table with a `billing_mode` row. Rejected because it adds migration complexity, requires RPC to read, and a runtime toggle is riskier than a deploy-gated switch.

### D2: Override credit limits in the RPC, not the application layer

**Decision:** The `consume_credits()` RPC checks `current_setting('app.billing_mode', true)`. When `'beta'`, it uses 5,000 as the weekly limit regardless of `subscription_tier`. When `'production'` or unset, it uses the existing tier-based limits.

**Why:** Credit enforcement is already atomic in the RPC. Adding the beta override here means the application layer doesn't need any credit-related changes. The single override point is the RPC itself.

**Alternative considered:** Override in the TypeScript `CREDIT_LIMITS` constant. Rejected because the RPC is the enforcement layer — TS constants are only used for display. Overriding both introduces inconsistency risk.

**Client-side display:** `CREDIT_LIMITS` in `user.ts` also needs beta awareness for UI display. Expose `BILLING_MODE` and `BETA_CREDIT_LIMIT` via a new `src/lib/constants/billing.ts` that the hooks read.

### D3: Waitlist via `profiles.status` column + `handle_new_user()` gating

**Decision:** Add `status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'waitlisted'))` to `profiles`. Update `handle_new_user()` to count active profiles and set `status = 'waitlisted'` when count >= cap. Cap stored as a Postgres config `app.user_cap` (set from env var `USER_CAP`).

**Why over separate waitlist table:** A status column is simpler and avoids join complexity. The profile already represents the user. Queue position = count of waitlisted users created before this user.

**Activation flow:** Admin runs SQL: `UPDATE profiles SET status = 'active' WHERE id = '<user_id>';` or increases cap and re-runs: `UPDATE profiles SET status = 'active' WHERE status = 'waitlisted' ORDER BY created_at LIMIT <N>;`

### D4: Middleware enforcement for waitlist

**Decision:** Extend `src/middleware.ts` to check `profiles.status` after auth. Waitlisted users are redirected to `/waitlist` for page routes and get 403 for API routes. The `/waitlist` page itself is added to `publicRoutes`.

**Why middleware:** It's the existing auth enforcement layer. Adding waitlist check here means no component-level or API-level checks needed.

**Performance concern:** This adds a Supabase query per request for the profile status. Mitigation: use a lightweight RPC or cache the status in a cookie/session after first check. For 100 users, the query load is negligible — optimize later if needed.

### D5: Feature gate bypass via billing mode check

**Decision:** `getFeatureAccess()` in `feature-gate.service.ts` returns `{ gate: 'full_access' }` for all features when `BILLING_MODE === 'beta'`. No code removed — the existing `FEATURE_MAP` and tier logic remain intact.

**Client-side:** `useFeatureGate` already calls `getFeatureAccess`. The bypass propagates automatically. Paywall components check `gate === 'full_access'` and render children normally.

**KOL tracking limit:** Override `TIER_LIMITS[tier].kolTracking` to return a generous cap (e.g., 50) in beta mode so users can explore freely.

### D6: Beta banner as a layout-level component

**Decision:** A thin top banner (`<BetaBanner />`) rendered in `src/app/(app)/layout.tsx` when `BILLING_MODE === 'beta'`. Shows "Open Beta — 5,000 credits/week" + feedback link. Dismissible per session (sessionStorage).

**Why not a toast/notification:** The banner communicates ongoing context, not a one-time event. It should be persistent but unobtrusive.

### D7: Waitlist page shows queue position

**Decision:** `/waitlist` page queries the user's position among waitlisted profiles (count of waitlisted users with `created_at` before the current user). Shows: position, total waitlisted count, and a message. Logged-in users only.

### D8: Resend for transactional email with React Email templates

**Decision:** Use Resend (`resend` npm package) as the email provider, with `@react-email/components` for building email templates as React components. Email client lives in `src/infrastructure/email/resend.client.ts`. Templates live in `src/infrastructure/email/templates/`.

**Why Resend over alternatives:**
- First-class React Email support (they built the library) — templates are React components, same stack as the app
- Generous free tier (3,000 emails/month) — more than enough for 100 beta users
- Simple API — one SDK, one API key, no SMTP config or domain verification for sandbox
- Next.js ecosystem alignment (Vercel-adjacent)
- Future-ready: supports Audiences for marketing broadcasts when needed

**Alternatives considered:**
- *Supabase Auth emails only*: Can't send custom transactional emails (only auth flows). Rejected.
- *SendGrid*: Heavier SDK, template builder is HTML-based not React-based, lower free tier (100/day). Rejected.
- *Nodemailer + SMTP*: Requires SMTP provider setup, no template framework, more infra to manage. Rejected.

**Email triggers for beta launch (3 emails):**
1. **Waitlist confirmation** — Sent from `handle_new_user()` flow (via API route, not directly from trigger) when user gets `status: 'waitlisted'`. Shows queue position.
2. **Waitlist activation** — Sent when admin activates a user (via a new `POST /api/admin/activate-users` endpoint that updates status + sends email).
3. **Beta welcome** — Sent from `handle_new_user()` flow when user gets `status: 'active'` (under cap). Shows beta credit limit and quick-start guidance.

**Architecture note:** Postgres triggers cannot call external APIs. Email sending happens in the application layer. The `handle_new_user()` trigger sets the status; the registration API route (or a post-registration hook) detects the status and sends the appropriate email.

**Domain verification:** Resend requires domain verification for production sending. For beta launch, use Resend's sandbox domain (sends to verified email addresses only) or verify the `baburra.io` domain. Domain verification is a one-time setup in the Resend dashboard.

### D9: Admin activation via API route, not raw SQL

**Decision:** Add `POST /api/admin/activate-users` endpoint (protected by a simple admin secret in env var `ADMIN_SECRET`). Accepts `{ userIds: string[] }` or `{ count: number }` (activate next N from waitlist by created_at order). This endpoint updates `profiles.status` AND sends activation emails — ensuring the two actions are always coupled.

**Why over raw SQL:** Raw SQL activation (as originally designed) can't trigger emails. The API route couples status change + email sending atomically. Admin still uses Supabase dashboard to identify users, but calls this endpoint to activate them.

**Alternative considered:** Supabase Database Webhook that fires on `profiles.status` UPDATE. Rejected because it adds infrastructure complexity (webhook endpoint, retry handling) for a simple use case that an API route handles cleanly.

## Risks / Trade-offs

**[Risk] Env var not propagated to RPC** → The `consume_credits()` RPC runs in Postgres, not Next.js. We must set `app.billing_mode` as a Postgres custom setting, either via Supabase DB config or by running `SET app.billing_mode = 'beta'` at connection time. Mitigation: Use Supabase project settings to set custom Postgres config, or set it in the migration as a default. Test in staging first.

**[Risk] 100-user cap race condition** → Two users registering simultaneously could both pass the count check. Mitigation: Use `SELECT ... FOR UPDATE` or `ADVISORY LOCK` in `handle_new_user()` to serialize the count check. At 100 users this is extremely unlikely but worth preventing.

**[Risk] Waitlisted user confusion** → Users who register and immediately see a waitlist may churn. Mitigation: Clear messaging on the register page ("Beta limited to 100 users"), and the waitlist page should set expectations ("You'll be notified when a spot opens").

**[Risk] Beta → production transition data** → When switching to production, existing beta users have `subscription_tier = 'free'` and may lose access to features they were using. Mitigation: Document the transition plan. Consider a grace period or auto-upgrade early beta users to 'pro' for N months as a reward.

**[Risk] Resend domain verification delay** → Sending from a custom domain requires DNS verification (TXT + DKIM records). May take 24-48h to propagate. Mitigation: Start domain verification early in implementation. Use Resend sandbox (test-only addresses) for development.

**[Risk] Email delivery in trigger context** → Postgres `handle_new_user()` trigger runs synchronously during registration. Cannot call Resend from inside the trigger. Mitigation: Email sending happens in the Next.js registration callback / API route, after Supabase auth completes and the trigger has already set the profile status. Use fire-and-forget pattern (don't block registration on email delivery).

**[Trade-off] Admin activation requires API call, not just SQL** → Slightly more friction for admin than raw SQL UPDATE. Acceptable because it ensures emails are always sent with activation.

## Migration Plan

1. **Deploy migration** — Add `profiles.status` column, update `handle_new_user()`, update `consume_credits()` / `refund_credits()` with beta mode check
2. **Set env vars** — `BILLING_MODE=beta`, `USER_CAP=100` in Vercel environment settings
3. **Set Postgres config** — `ALTER DATABASE postgres SET app.billing_mode = 'beta';` and `ALTER DATABASE postgres SET app.user_cap = '100';`
4. **Deploy application** — New middleware, waitlist page, beta banner, feature gate bypass
5. **Verify** — Register test user, confirm 5,000 credit limit, confirm all features unlocked
6. **Go live** — Open registration, announce beta

**Rollback:** Set `BILLING_MODE=production`, remove Postgres config overrides, redeploy. Users keep their accounts but revert to standard tier limits.

## Open Questions

1. **Should we show the original tier pricing on a "coming soon" pricing page?** Could set expectations for what beta users will eventually pay.
2. **Do we want beta-exclusive analytics?** E.g., a simple dashboard showing aggregate credit consumption patterns across all beta users. (Could be a SQL view queried from Supabase dashboard — no UI needed.)
3. **Grace period for beta → production transition?** Should early beta users get a free month of Pro as a thank-you?
