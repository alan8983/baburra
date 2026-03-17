# Fix QA-Discovered Bugs: Credits, Timeout, Progress UI

## Context

QA session on 2026-03-18 uncovered three bugs in the scrape/import pipeline.

## Bug 1: Scrape flow never charges credits (HIGH)

**Location**: `src/domain/services/profile-scrape.service.ts:257`
**Problem**: `processJobBatch` hardcodes `isOnboardingExempt = true`, so all imports via the scrape flow (`/api/scrape/jobs/:id/continue`) bypass credit consumption entirely. Only `/api/import/batch` correctly checks `onboarding_import_used`.
**Impact**: Users can import unlimited content for free via the scrape flow.
**Fix**: Call `checkOnboardingImportUsed(userId)` and pass correct `quotaExempt` value.

## Bug 2: Batch import timeout too short for Gemini transcription (MEDIUM)

**Location**: `src/app/api/import/batch/route.ts:41`
**Problem**: `BATCH_TIMEOUT_MS = 55_000` but Gemini video transcription can take 60-120s. Credits are consumed before transcription starts but not refunded when the timeout fires.
**Impact**: Credits lost on timeout, no post/transcript created. Observed: 119 credits lost for a 17-min captionless video.
**Fix**: Increase timeout to 180s for requests that include YouTube URLs (potential Gemini transcription).

## Bug 3: ScrapeProgress rendering race condition (MEDIUM)

**Location**: `src/components/scrape/scrape-progress.tsx`
**Problem**: Component shows "排隊中 0/2" even after API returns `status: completed, processedUrls: 2`. The `prevStatusRef` transition detection misses the `queued → completed` jump when intermediate states are skipped.
**Impact**: Users must reload page to see scrape results.
**Fix**: Derive display state directly from query data instead of relying on ref-based transition detection.
