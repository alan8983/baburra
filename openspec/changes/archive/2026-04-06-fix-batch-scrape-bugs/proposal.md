# Fix Batch Scrape Bugs (Validation Report)

## Context

Batch scraping validation on 2026-03-27 found 8 bugs. This change fixes the 3 highest-priority bugs (Bugs #2, #1, #5) plus two small fixes (#8, #6/#7 dead code cleanup). Full report at `docs/batch-scrape-validation-report.md`.

## Bug #2: FK constraint blocks job creation in dev mode (CRITICAL)

**Location**: `supabase/migrations/021_scrape_jobs.sql:8`
**Problem**: `scrape_jobs.triggered_by` has `REFERENCES auth.users(id)`, but `DEV_USER_ID` only exists in `profiles`. All other tables reference `profiles(id)`.
**Impact**: Batch scraping is completely broken in dev mode — cannot create any scrape job.
**Fix**: Migration to drop the FK and re-add it referencing `profiles(id)`.

## Bug #1: 72% of YouTube videos have missing `durationSeconds` (HIGH)

**Location**: `src/infrastructure/extractors/youtube-channel.extractor.ts:216-257`
**Problem**: `videos.list` API can return fewer items than IDs requested. YouTube Data API v3 `videos.list` has a max of 50 IDs per call, but may silently drop IDs for private/deleted/unavailable videos. Videos not in the response map get `undefined` duration.
**Impact**: Credit estimation wrong (defaults to 7 credits), 45-min safety guard bypassed, content type defaults to `long_video` (shorts not detected).
**Fix**: The current code already handles up to 50 IDs in one call. The missing durations are expected — those are private/deleted/age-restricted videos the API won't return details for. The fix is to handle missing videos gracefully: log them and provide sensible defaults rather than `undefined`.

## Bug #5: Frontend reads `error` but backend sends `errorMessage` (MEDIUM)

**Location**: Backend `src/domain/models/kol-source.ts:49` sends `errorMessage`; frontend `src/hooks/use-scrape.ts:38` reads `error`.
**Impact**: Error messages from failed scrape jobs are never displayed in the UI.
**Fix**: Align frontend type to use `errorMessage` matching the backend domain model.

## Bug #8: `initialProgress.totalUrls` uses wrong count (MEDIUM)

**Location**: `src/domain/services/profile-scrape.service.ts:192`
**Problem**: Uses `profile.postUrls.length` (all URLs) instead of `urlsToScrape.length` (selected URLs).
**Impact**: Immediate API response shows wrong total (e.g., 50 instead of 5). Corrects on next poll.
**Fix**: One-line change to use `urlsToScrape.length`.

## Bug #6/#7: Dead `url`, `stats` fields in frontend type (LOW)

**Location**: `src/hooks/use-scrape.ts:34,46-51`
**Problem**: `url` and `stats` fields are defined in frontend `ScrapeJob` type but never populated by the backend.
**Fix**: Remove dead fields and their fallback patterns.
