## Context

The onboarding system spans ~15 files: two page routes (`/welcome`, `/onboarding`), an A/B experiment with middleware routing, an `OnboardingGuard` client component, a dedicated hook, API route, translation files, and three DB columns on `profiles`. It was built as a guided first-run experience that doubles as a free-trial mechanism for AI credits.

We're removing it now to reduce complexity while a proper FRUX-centered first-run experience is designed separately.

### Key integration points

- **Middleware** (`middleware.ts`): A/B variant assignment, `/` redirect logic, `/welcome` routing, anonymous session handling
- **AppShell**: Renders `OnboardingGuard`, hides sidebar during onboarding
- **Credit system**: `profile-scrape.service.ts` calls `checkOnboardingImportUsed()` / `markOnboardingImportUsed()` to grant one free batch import
- **Nav**: "NEW" badge on Quick Input when `!isOnboardingCompleted`

## Goals / Non-Goals

**Goals:**

- Remove all onboarding UI, routing, and guard logic
- Simplify middleware to remove A/B test and anonymous session handling
- Drop onboarding DB columns via migration
- Replace the free-first-import exemption with a simpler `first_import_free` column on `profiles` (decoupled from onboarding)
- Anonymous `/` → `/login`, authenticated `/` → `/dashboard`

**Non-Goals:**

- Designing a new first-run UX (deferred to FRUX proposal)
- Removing the credit system itself
- Changing the import pipeline beyond removing the onboarding check
- Removing the A/B testing infrastructure entirely (just this experiment)

## Decisions

### 1. Replace free-import with `first_import_free` column

**Decision:** Add a `first_import_free BOOLEAN DEFAULT TRUE` column to `profiles` in the same migration that drops the onboarding columns. The credit check in `profile-scrape.service.ts` will check this column instead of `onboarding_import_used`.

**Why not just remove the free import?** User requested keeping a simpler mechanism. A boolean column is the minimum viable approach — no new tables, no credit ledger, just a flag that starts `true` and flips to `false` after first use.

**Alternative considered:** Grant N free credits on creation via a `free_credits` integer column. Rejected — overengineered for what's currently a single boolean check.

### 2. Drop DB columns in migration (not leave dormant)

**Decision:** Create a migration that drops `onboarding_completed`, `onboarding_completed_at`, `onboarding_import_used` and adds `first_import_free`.

**Why:** User explicitly chose clean removal. Dormant columns create confusion. The data is not needed for analytics (we have the A/B experiment cookie data separately if needed).

### 3. Keep A/B test infrastructure, remove only the experiment

**Decision:** Delete `src/lib/ab-test.ts` and all references. The A/B framework is only used for this one experiment, so there's nothing worth keeping. If we need A/B testing later, we'll build it fresh (or use a proper tool).

**Why not keep ab-test.ts as a utility?** It's tightly coupled to cookie-based variant assignment for this specific experiment. A future A/B system would likely use a proper feature flag service.

### 4. Simplify middleware routing

**Decision:** After removal, middleware becomes:

```
/ → /login (unauthenticated) or /input (authenticated)
/login, /register → accessible when unauthenticated
Everything else → requires auth
```

No more: variant assignment, `/welcome` routing, anonymous session creation, `anonymousAllowedRoutes`.

## Risks / Trade-offs

- **Existing users with `onboarding_completed = false`** → After migration, they'll no longer be blocked. This is the desired behavior — they go straight to the app.
- **Data loss from column drops** → Irreversible, but the data has no ongoing value. The `onboarding_completed_at` timestamp could theoretically be useful for cohort analysis, but we have `created_at` on profiles for that.
- **Free import behavior change** → Users who already used their free onboarding import (`onboarding_import_used = true`) will get `first_import_free = TRUE` by default in the migration. We should set `first_import_free = FALSE` for users where `onboarding_import_used = true` to avoid granting a double free import.

## Migration Plan

1. Create migration: drop 3 onboarding columns, add `first_import_free` column
2. Set `first_import_free = FALSE` for users who already used their onboarding import
3. Deploy code changes and migration together
4. No rollback plan needed — this is a clean removal with no external dependencies
