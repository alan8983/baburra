## 1. Database Migration

- [x] 1.1 Create migration: add `first_import_free BOOLEAN DEFAULT TRUE` to `profiles`, set `first_import_free = FALSE` where `onboarding_import_used = TRUE`, then drop `onboarding_completed`, `onboarding_completed_at`, `onboarding_import_used`
- [x] 1.2 Run `supabase db push --dry-run` to verify migration
- [x] 1.3 Apply migration with `supabase db push`
- [x] 1.4 Regenerate types with `supabase gen types typescript`

## 2. Replace Free-Import Logic

- [x] 2.1 In `profile.repository.ts`: replace `checkOnboardingImportUsed()` / `markOnboardingImportUsed()` with `checkFirstImportFree()` / `markFirstImportUsed()`
- [x] 2.2 Update `profile-scrape.service.ts` to use new repository functions
- [x] 2.3 Update any other callers of the old functions (check import-pipeline.service.ts, tests)
- [x] 2.4 Update `ProfileData` interface to remove onboarding fields, add `firstImportFree`

## 3. Remove Onboarding Pages & Components

- [x] 3.1 Delete `src/app/welcome/page.tsx` (and any layout/loading files in that directory)
- [x] 3.2 Delete `src/app/(app)/onboarding/page.tsx` (and any layout/loading files)
- [x] 3.3 Delete `src/components/onboarding/` directory (step-intro.tsx, step-import.tsx)
- [x] 3.4 Remove `OnboardingGuard` from AppShell (`src/components/layout/`)
- [x] 3.5 Remove onboarding-conditional sidebar hiding / "NEW" badge logic from nav components

## 4. Remove Onboarding Hook & API Route

- [x] 4.1 Delete `src/hooks/use-onboarding.ts`
- [x] 4.2 Delete `src/app/api/profile/onboarding/route.ts`
- [x] 4.3 Remove `ONBOARDING` from `ROUTES` and `API_ROUTES` constants in `src/lib/constants/routes.ts`

## 5. Remove A/B Test & Simplify Middleware

- [x] 5.1 Delete `src/lib/ab-test.ts`
- [x] 5.2 Simplify `middleware.ts`: remove variant assignment, `/welcome` routing, anonymous session logic; `/` → `/login` (unauthed) or `/input` (authed)
- [x] 5.3 Remove `/welcome` from `publicRoutes`, remove `anonymousAllowedRoutes` and `anonymousAllowedApiPrefixes`
- [x] 5.4 Remove any A/B API route if it exists (`/api/ab/`)

## 6. Remove Translation Files

- [x] 6.1 Delete `src/messages/en/onboarding.json` and `src/messages/zh-TW/onboarding.json`
- [x] 6.2 Remove onboarding namespace from message config/imports if referenced

## 7. Update Living Specs

- [x] 7.1 Update `openspec/specs/ai-pipeline.md` — change quota exemption line from `onboarding_import_used` to `first_import_free`
- [x] 7.2 Update `openspec/specs/data-models.md` — remove `ab_experiments` mention if the table is no longer actively used, update profiles description

## 8. Verification

- [x] 8.1 Run `npm run type-check` — fix any type errors
- [x] 8.2 Run `npm test` — fix any failing tests
- [x] 8.3 Run `npm run build` — ensure production build succeeds
- [x] 8.4 Manual smoke test: new user flow (register → lands on app, no onboarding redirect)
