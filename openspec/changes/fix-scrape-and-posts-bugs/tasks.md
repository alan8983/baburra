# Tasks: Fix Scrape Pipeline & Posts Page Bugs

## Pre-requisites
- [x] Fix `createStock` duplicate key error (upsert approach) — already applied in this branch

## Bug 1: Scrape flow completion detection
- [x] **1.1** Fix completion detection in `src/components/scrape/scrape-progress.tsx`
  - Change line 67: `if (prevStatus && ...)` → `if ((!prevStatus || prevStatus !== 'completed') && ...)`
  - This ensures the completion toast + redirect fires even when job is already completed on first render
- [x] **1.2** Simplify flow chart from 5 steps to 4 in `src/components/scrape/scrape-flow-chart.tsx`
  - Remove Step 4 "匯入" — it's not a user-visible phase
  - New steps: 輸入URL(1) → 探索與選擇(2) → 處理中(3) → 完成(4)
  - Update `ScrapeStep` type from `1|2|3|4|5` to `1|2|3|4`
  - Update `STEP_ICONS` and `STEP_KEYS` arrays
- [x] **1.3** Update `stateToStep()` in `src/app/(app)/scrape/page.tsx`
  - Map `'processing'` → 3, `'redirecting'` → 4 (was 5)
- [x] **1.4** Update translation keys in `src/messages/zh-TW/scrape.json` and `src/messages/en/scrape.json`
  - Remove `step4` key, renumber `step5` → `step4`

## Bug 2: Duplicate posts
- [x] **2.1** Create Supabase migration to add unique constraint
  - First: DELETE duplicate posts keeping the earliest `created_at` per `(source_url, kol_id)`
  - Then: `ALTER TABLE posts ADD CONSTRAINT posts_source_url_kol_id_key UNIQUE (source_url, kol_id);`
  - Note: NULL source_urls are allowed (manual posts) — PostgreSQL UNIQUE allows multiple NULLs
- [x] **2.2** Add duplicate handling in `src/domain/services/import-pipeline.service.ts`
  - Wrap `createPost()` call in try-catch
  - On duplicate key error: call `findPostBySourceUrl(url)` and return `{ status: 'duplicate', postId }`
  - This is defense-in-depth alongside the existing `findPostBySourceUrl` check at line 164

## Bug 3: Posts page loading timeout
- [x] **3.1** Add per-stock timeout in `src/lib/api/enrich-price-changes.ts`
  - Wrap each `getStockPrices()` call with a 5-second timeout using `Promise.race()`
  - On timeout, the stock gets no price data (existing `'rejected'` handling covers this)
- [x] **3.2** Add logging when stock price fetch fails or times out
  - The existing `console.error` already logs rejected fetches — timeout errors are now also logged clearly

## Bug 4: YouTube extractor silent failure
- [x] **4.1** Add error logging in `src/infrastructure/extractors/youtube.extractor.ts`
  - In the catch block: `console.warn('[YouTubeExtractor] Transcript unavailable for video ${videoId}:', error)`
- [x] **4.2** Improve fallback content quality
  - Use `shortDescription` (from `fetchPageData`) as primary fallback content instead of the truncated `<meta>` description
  - Refactored `fetchPageData` to return both `description` and `shortDescription` separately
  - Added logging in `fetchPageData` catch block

## Verification
- [ ] **5.1** Test scrape flow with a quick-completing job — verify auto-redirect fires
- [ ] **5.2** Test Posts page loads within reasonable time (~5s) even when Tiingo is slow
- [ ] **5.3** Verify no duplicate posts are created when scraping the same URL concurrently
- [ ] **5.4** Check server logs show YouTube transcript fallback warnings
