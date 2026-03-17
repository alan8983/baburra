# Design: Fix Scrape Flow Credit Consumption

## Root Cause

In `profile-scrape.service.ts:263`, `processUrl()` is called with `quotaExempt = true` hardcoded:

```ts
// Current (broken)
batch.map((url) => processUrl(url, userId, timezone, true, kolCache, kolId))
```

This bypasses all credit consumption logic in `processUrl()`, which gates charges behind `if (!quotaExempt)`.

Meanwhile, the import batch flow (`import-pipeline.service.ts:101`) correctly checks onboarding status:

```ts
// Import batch (correct)
const onboardingAlreadyUsed = await checkOnboardingImportUsed(userId);
const isOnboardingExempt = !onboardingAlreadyUsed;
// ...
input.urls.map((url) => processUrl(url, userId, timezone, isOnboardingExempt, kolCache))
```

## Fix

### Option A: Mirror import batch logic (recommended)

Add onboarding check to `processUrlBatch()` in `profile-scrape.service.ts`, matching the pattern used in `executeBatchImport()`:

```ts
// Fixed
const onboardingAlreadyUsed = await checkOnboardingImportUsed(userId);
const isOnboardingExempt = !onboardingAlreadyUsed;

// ... in the batch loop:
batch.map((url) => processUrl(url, userId, timezone, isOnboardingExempt, kolCache, kolId))
```

After a successful scrape with `isOnboardingExempt = true`, call `markOnboardingImportUsed(userId)` — same as `executeBatchImport()` does.

### Option B: Always charge (simpler but different semantics)

```ts
batch.map((url) => processUrl(url, userId, timezone, false, kolCache, kolId))
```

This would always charge credits, even for first-time users. Simpler but breaks the onboarding-free-import design.

**Decision: Option A** — maintains parity with the import batch flow and preserves onboarding UX.

## Changes

### `src/domain/services/profile-scrape.service.ts`

1. Import `checkOnboardingImportUsed` and `markOnboardingImportUsed` from profile repository
2. In `processUrlBatch()`, before the batch loop:
   - Call `checkOnboardingImportUsed(userId)` to determine exemption
3. Change line 263: pass `isOnboardingExempt` instead of `true`
4. After the batch loop, if `isOnboardingExempt && importedCount > 0`:
   - Call `markOnboardingImportUsed(userId)`

### Impact on verification tests

After this fix:
- **4.2** (YouTube w/ captions): Should deduct 2 credits
- **4.3** (Gemini transcription): Should deduct 7/min credits
- **4.6** (Insufficient credits): Should block when balance is too low
- **4.7** (Video >45 min): Already handled in `processUrl()` — unrelated to this fix

### Edge cases

- **First scrape by new user**: `onboarding_import_used = false` → exempt (free), then marked as used
- **Subsequent scrapes**: `onboarding_import_used = true` → credits consumed normally
- **User who already used import batch**: Already marked → scrape will charge credits
- **Credit refund on failure**: Already handled in `processUrl()` — no changes needed
