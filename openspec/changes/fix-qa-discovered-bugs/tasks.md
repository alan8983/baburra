# Tasks: Fix QA-Discovered Bugs

## Bug 1: Scrape flow never charges credits
- [x] **1.1** Fix `processJobBatch` in `profile-scrape.service.ts` to check `onboarding_import_used` and pass correct `quotaExempt` value instead of hardcoded `true`
- [x] **1.2** Add `markOnboardingImportUsed` call after successful imports in `processJobBatch` (same pattern as `executeBatchImport`)

## Bug 2: Batch import timeout too short
- [x] **2.1** Increase `maxDuration` export to 180 in `import/batch/route.ts` for Vercel Pro
- [x] **2.2** Increase `BATCH_TIMEOUT_MS` from 55s to 170s to accommodate Gemini transcription

## Bug 3: ScrapeProgress rendering race condition
- [x] **3.1** Fix `ScrapeProgress` to show completed state when job jumps directly from queued to completed (render completed summary instead of progress bar)

## Verification
- [x] **4.1** Run type-check to verify no compilation errors
- [x] **4.2** Run existing tests to verify no regressions — fixed profile-scrape-performance.test.ts mock to include new imports
