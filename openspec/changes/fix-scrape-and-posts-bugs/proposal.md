# Proposal: Fix Scrape Pipeline & Posts Page Bugs

## What

Fix four bugs discovered during scrape pipeline testing: (1) scrape flow stuck at Step 3, (2) duplicate posts created from same URL, (3) Posts page stuck loading, and (4) YouTube extractor silently failing with no logging.

## Why

1. **Scrape flow stuck at Step 3** — After a scrape job completes, the UI stays on the "處理中" step instead of auto-redirecting to the KOL detail page. Users see "完成" badge but nothing happens. The job completed too fast for the component to observe a transition.

2. **Duplicate posts** — The same YouTube URL produces two identical posts in the database (e.g., post `06b580ed` and `a5ff9d7a` both link to `youtube.com/watch?v=LTOocb9u6Fs`). This is a race condition in concurrent batch processing.

3. **Posts page stuck on "載入中..."** — The `/api/posts` endpoint calls `enrichPostsWithPriceChanges()` which fetches stock prices from Tiingo for every unique stock. If Tiingo is slow or timing out, the entire response hangs indefinitely.

4. **YouTube extractor silent failure** — When `youtube-transcript-plus` fails (e.g., captions disabled), the error is swallowed on line 100 of `youtube.extractor.ts` with no logging, making it impossible to diagnose content quality issues.

## Scope

### Bug 1: Scrape flow completion detection
- **Files**: `src/components/scrape/scrape-progress.tsx`, `src/app/(app)/scrape/page.tsx`
- **Root cause**: `prevStatusRef` starts as `undefined` (falsy), so the condition `prevStatus && prevStatus !== 'completed' && job.status === 'completed'` fails when the first observed status is already `completed`
- **Fix**: Also trigger completion when `prevStatus === undefined && job.status === 'completed'`
- **Bonus**: The `stateToStep` mapping skips Step 4 (匯入) — add an `'importing'` state or remove Step 4 from the flow chart

### Bug 2: Duplicate posts from same URL
- **Files**: `src/domain/services/import-pipeline.service.ts`, `supabase/migrations/` (new migration)
- **Root cause**: `findPostBySourceUrl()` check on line 164 races with concurrent batch processing. Both requests check before either creates, so both proceed to create
- **Fix**: Add a unique constraint on `(source_url, kol_id)` in the database + use upsert or catch-and-fetch pattern (same approach used for `createStock` fix already applied in this branch)

### Bug 3: Posts page loading timeout
- **Files**: `src/lib/api/enrich-price-changes.ts`, `src/app/api/posts/route.ts`
- **Root cause**: `enrichPostsWithPriceChanges()` calls `getStockPrices()` for every unique stock with no timeout. If Tiingo API is slow, the entire API response hangs
- **Fix**: Add per-stock timeout (e.g., 5s) to the `Promise.allSettled` calls. On timeout, skip that stock's price data rather than blocking everything. Consider caching stock prices to avoid repeated external calls.

### Bug 4: YouTube extractor silent failure
- **Files**: `src/infrastructure/extractors/youtube.extractor.ts`
- **Root cause**: Line 100 `catch {}` swallows all errors from `YoutubeTranscript.fetchTranscript()`
- **Fix**: Add `console.warn()` in the catch block logging the error type and video ID. Also use the `shortDescription` (already parsed at line 182-188) as fallback content instead of the truncated `<meta>` description

## Out of Scope

- Gemini multimodal video analysis (alternative to transcript extraction) — separate investigation
- YouTube transcript alternatives (Whisper, YouTube Data API v3) — separate change
- Posts page pagination UX improvements — the page loads all posts client-side; this could be improved but is a separate concern
- Content character limit tuning (10K chars) for transcript use case
