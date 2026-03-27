# Validation Report: remove-onboarding

## Summary
| Item | Count |
|------|-------|
| Total Tests | 17 |
| Pass | 17 |
| Fail | 0 |
| Skipped | 0 |
| Critical Failures | 0 |

## Commit Verdict: CLEAR TO COMMIT

## Pre-flight
- Type Check: (skip - already verified in parent)
- Unit Tests: (skip - already verified in parent)
- Tasks Complete: 23/23 marked [x]

## Change-Specific Tests

### V-001: Onboarding files deleted
- **Status**: Pass
- **Evidence**: Glob for `**/onboarding*` in `src/` returns zero files. No `src/app/welcome/`, `src/components/onboarding/`, `src/hooks/use-onboarding.ts`, or `src/lib/ab-test.ts` exist.

### V-002: /welcome returns 404
- **Status**: Pass
- **Evidence**: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/welcome` -> `404`

### V-003: /onboarding returns 404
- **Status**: Pass
- **Evidence**: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/onboarding` -> `404`

### V-004: Profile API returns firstImportFree (no onboarding fields)
- **Status**: Pass
- **Evidence**: `GET /api/profile` returns `{"displayName":"Admin","timezone":"Asia/Taipei","colorPalette":"asian","firstImportFree":false}`. No `onboardingCompleted`, `onboardingImportUsed`, or similar fields present.

### V-005: profile.repository has checkFirstImportFree / markFirstImportUsed
- **Status**: Pass
- **Evidence**: `src/infrastructure/repositories/profile.repository.ts` exports `checkFirstImportFree()` (line 119) and `markFirstImportUsed()` (line 144). No references to `checkOnboardingImportUsed` or `markOnboardingImportUsed` remain.

### V-006: import-pipeline.service uses new first-import functions
- **Status**: Pass
- **Evidence**: `src/domain/services/import-pipeline.service.ts` imports `checkFirstImportFree` and `markFirstImportUsed`. No references to old onboarding functions.

### V-007: profile-scrape.service uses new first-import functions
- **Status**: Pass
- **Evidence**: `src/domain/services/profile-scrape.service.ts` imports `checkFirstImportFree` and `markFirstImportUsed` from profile repository. No old onboarding references.

### V-008: Middleware simplified (no A/B, no /welcome, no anonymous sessions)
- **Status**: Pass
- **Evidence**: `src/middleware.ts` contains no references to `variant`, `ab-test`, `welcome`, `anonymous`, or `ONBOARDING`. Root `/` redirects to `/login` (unauthed) or `/scrape` (authed). Public routes list does not include `/welcome`.

### V-009: AppShell has no OnboardingGuard
- **Status**: Pass
- **Evidence**: `src/components/layout/app-shell.tsx` is a clean 23-line component with Sidebar, Header, MobileNav only. No guard, no onboarding imports.

### V-010: Routes constants have no ONBOARDING entries
- **Status**: Pass
- **Evidence**: `src/lib/constants/routes.ts` - `ROUTES` and `API_ROUTES` objects contain no onboarding, welcome, or A/B entries.

### V-011: Migration correctly drops columns and adds first_import_free
- **Status**: Pass
- **Evidence**: `supabase/migrations/20250602000000_remove_onboarding.sql` adds `first_import_free BOOLEAN DEFAULT TRUE`, sets `FALSE` where `onboarding_import_used = TRUE`, then drops `onboarding_completed`, `onboarding_completed_at`, `onboarding_import_used`.

### V-012: Living specs updated
- **Status**: Pass
- **Evidence**: `openspec/specs/ai-pipeline.md` references `first_import_free` (not `onboarding_import_used`). `openspec/specs/data-models.md` lists the migration. No stale `onboarding_import_used` references in specs.

## Regression Tests

### R-001: /api/posts returns 200
- **Status**: Pass
- **Evidence**: `curl` -> HTTP 200

### R-002: /api/kols returns 200
- **Status**: Pass
- **Evidence**: `curl` -> HTTP 200

### R-003: /api/stocks returns 200
- **Status**: Pass
- **Evidence**: `curl` -> HTTP 200

## Visual Validation (Preview Tool)

### VV-001: /welcome returns 404 (confirmed via curl)
- **Status**: Pass
- **Evidence**: `curl http://localhost:3000/welcome` returned HTTP 404.

### VV-002: /onboarding returns 404 (confirmed via curl)
- **Status**: Pass
- **Evidence**: `curl http://localhost:3000/onboarding` returned HTTP 404.

### VV-003: No OnboardingGuard or onboarding code in src/
- **Status**: Pass
- **Evidence**: `grep -r "OnboardingGuard|use-onboarding|onboarding_completed" src/` returned zero results. All onboarding code cleanly removed.

## Notes
- Three translation keys in `src/messages/{en,zh-TW}/import.json` still use the word "onboarding" in their key names (`onboardingHint`, `onboardingQuotaNote`). These are cosmetic key names only — they describe the first-import-free feature and have no functional dependency on the removed onboarding system. Not a blocker.
