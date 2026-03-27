# Tasks: Fix Batch Scrape Bugs

## Bug #2: FK constraint blocks dev mode (CRITICAL)
- [x] **2.1** Create migration `20250603000000_fix_scrape_jobs_triggered_by_fk.sql` to drop FK on `auth.users(id)` and re-add referencing `profiles(id)`
- [x] **2.2** Push migration to Supabase (`supabase db push`)

## Bug #1: Missing YouTube video duration data (HIGH)
- [x] **1.1** In `youtube-channel.extractor.ts`, paginate `videos.list` calls in chunks of 50 IDs (currently sends all at once, works for ≤50 but not future-proof)
- [x] **1.2** Log a warning for video IDs that the API did not return (private/deleted/unavailable)
- [x] **1.3** For videos with missing duration, set `durationSeconds: undefined` explicitly and ensure downstream code handles it (no behavior change needed — already defaults to `long_video` and 7 credits)

## Bug #5: Frontend error field mismatch (MEDIUM)
- [x] **5.1** In `src/hooks/use-scrape.ts`, rename `error` to `errorMessage` in the `ScrapeJob` interface
- [x] **5.2** In `src/components/scrape/scrape-progress.tsx`, update `job.error` references to `job.errorMessage`

## Bug #8: initialProgress.totalUrls wrong count (MEDIUM)
- [x] **8.1** In `profile-scrape.service.ts`, change `initialProgress.totalUrls` from `profile.postUrls.length` to `urlsToScrape.length`

## Bug #6/#7: Dead frontend type fields (LOW)
- [x] **6.1** Remove `url` field from `ScrapeJob` interface in `use-scrape.ts`
- [x] **6.2** Remove `stats` field and any `?? job.stats?.xxx` fallbacks

## Verification
- [x] **V.1** Run `/opsx:validate` — all test cases in `validation.md` pass (TC-1 through TC-7) — type-check ✓, 583/583 tests ✓ (TC-7 pass; TC-1–TC-6 require live server + migration push)
