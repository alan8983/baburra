# Tasks: Fix Scrape Flow Credit Consumption

## Implementation

- [x] **1.1** Fix `processUrlBatch()` in `src/domain/services/profile-scrape.service.ts`
  - Import `checkOnboardingImportUsed` and `markOnboardingImportUsed` from `@/infrastructure/repositories/profile.repository`
  - Before the batch loop, add: `const onboardingAlreadyUsed = await checkOnboardingImportUsed(userId);` and `const isOnboardingExempt = !onboardingAlreadyUsed;`
  - Change line 263: replace `true` with `isOnboardingExempt`
  - After the batch loop, add: `if (isOnboardingExempt && importedCount > 0) { await markOnboardingImportUsed(userId); }`

- [x] **1.2** Update existing unit tests in `src/domain/services/__tests__/import-pipeline.service.test.ts`
  - Verify tests still pass with no changes (scrape service has its own test scope)

## Verification (re-run credit checklist)

- [x] **2.1** Mark `onboarding_import_used = true` for dev user in DB (so credits are consumed)
- [x] **2.2** Test 4.2: Scrape a YouTube video with captions → verify 2 credits consumed (848/850 confirmed)
- [ ] **2.3** Test 4.3: Scrape a YouTube video without captions → Gemini "fetch failed" — consume/refund logic confirmed correct, transcription API unreachable
- [ ] **2.4** Test 4.4: Re-scrape same URL → blocked (no transcript cached due to 4.3 failure)
- [x] **2.5** Test 4.5: Re-roll analysis on an existing post → 3 credits consumed (845/848 confirmed). Note: Gemini quota hit, but credit deduction correct
- [x] **2.6** Test 4.6: Set credit balance to 1 → re-roll returns INSUFFICIENT_CREDITS error (confirmed)
- [x] **2.7** Test 4.7: Scrape a video >45 min (46.5 min, Wc1uYyj0cWQ) → rejected with error, 0 credits consumed (confirmed)
- [x] **2.8** Test 4.8: Set balance=100, reset_at=yesterday → RPC reset to 850 + set new reset_at 7 days out (confirmed)
