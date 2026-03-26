## Why

The current onboarding flow (A/B tested across two variants) adds significant complexity — middleware routing, anonymous sessions, an OnboardingGuard, ~15 files — while providing limited value. It's essentially a product tour + guided first import that users can already do via Quick Input. We plan to revisit first-run UX later with a proper FRUX-centered proposal; until then, the onboarding code is dead weight that slows iteration.

## What Changes

- **BREAKING**: Remove the `/welcome` page (pre-registration onboarding, Variant B)
- **BREAKING**: Remove the `/onboarding` page (post-registration onboarding, Variant A)
- Remove `OnboardingGuard` from `AppShell` — new users go straight to the app after login
- Remove `ONBOARDING_BEFORE_REG` A/B experiment and related middleware routing
- Remove `use-onboarding` hook, `POST /api/profile/onboarding` route, onboarding translation files
- Drop `onboarding_completed`, `onboarding_completed_at`, `onboarding_import_used` columns from `profiles` table
- Replace the free-first-import exemption with a simpler mechanism: grant free credits on account creation (decoupled from onboarding flow)
- Anonymous `/` now redirects to `/login`; authenticated `/` redirects to `/dashboard`
- Remove "NEW" badge on Quick Input nav item (tied to onboarding status)

## Capabilities

### New Capabilities

- `first-import-credit`: Simple mechanism to grant new users free AI credits on account creation, replacing the onboarding-coupled free import exemption

### Modified Capabilities

- `ai-pipeline`: Remove `onboarding_import_used` check from batch import credit logic
- `data-models`: Drop three onboarding columns from `profiles` table

## Impact

- **Pages**: Delete `/welcome`, `/onboarding` pages
- **Components**: Delete `src/components/onboarding/` directory, remove `OnboardingGuard` from AppShell
- **Hooks**: Delete `use-onboarding.ts`
- **API**: Delete `POST /api/profile/onboarding`
- **Middleware**: Simplify `middleware.ts` — remove A/B variant routing, anonymous session creation for `/welcome`
- **Database**: Migration to drop 3 columns from `profiles`
- **Translations**: Delete `onboarding.json` from all locales
- **A/B testing**: Remove `ONBOARDING_BEFORE_REG` experiment config
- **Nav/Sidebar**: Remove onboarding-conditional "NEW" badge logic
- **Profile repository**: Remove onboarding field mapping
