# Batch Scraping Feature — Validation Report

**Date:** 2026-03-27
**Tested on:** `main` branch (commit `6f6a6be`)
**Environment:** Local dev server (Next.js 16.1.6, DEV_USER_ID bypass)

---

## Executive Summary

The Batch Scraping feature has **8 bugs identified**, including **1 critical blocker** that prevents the entire scrape pipeline from working in development, and **1 high-severity data quality issue** affecting 72% of discovered videos. The feature's UI flow (discovery → selection) works correctly, but job creation and batch processing are broken.

---

## Test Results

### ✅ PASS: Discovery Flow (YouTube)

- `POST /api/scrape/discover` works correctly for YouTube channels
- Tested with `@MoneyXYZ` (一口新飯) → returned 50 videos with KOL name, avatar, platform metadata
- Tested with `@MeetKevin` → returned 8 videos, all with captions
- Content type classification works: 49 long_video + 1 short detected
- Credit estimation works for videos WITH duration data
- UI correctly transitions: `input` → `discovering` → `selecting`
- Flow chart advances to step 2
- URL selection list, content type filters, select/deselect all — all functional

### ❌ FAIL: Job Initiation (Critical Blocker)

- `POST /api/scrape/profile` returns **500 Internal Server Error**
- Error: `insert or update on table "scrape_jobs" violates foreign key constraint "scrape_jobs_triggered_by_fkey"`
- **Root cause:** `DEV_USER_ID=00000000-0000-0000-0000-000000000001` does not exist in `auth.users` table, but `scrape_jobs.triggered_by` has `REFERENCES auth.users(id)`
- **Impact:** Batch scraping is completely broken in dev mode. Cannot create any scrape job without a real authenticated user.

### ❌ FAIL: Twitter/X Discovery

- `POST /api/scrape/discover` with Twitter URL returns `400 API_KEY_MISSING`
- `TWITTERAPI_IO_KEY` env var not configured in `.env.local`
- Cannot validate Twitter scraping without the API key

### ⚠️ NOT TESTED: Batch Processing, Completion, Edge Cases

- Blocked by Bug #2 (FK constraint). Could not create a scrape job to test:
  - `/api/scrape/jobs/[id]/continue` batch processing
  - Progress polling loop
  - Completion summary
  - Duplicate handling
  - Credit consumption/refund

---

## Bugs Found

### BUG #1: 72% of videos have missing `durationSeconds` [HIGH]

**Location:** `src/infrastructure/extractors/youtube-channel.extractor.ts:216-257`
**Symptom:** 36 out of 50 discovered videos have `durationSeconds: undefined`
**Evidence:**
```
With duration: 14
No duration: 36
Total: 50
```
**Root cause:** The YouTube Data API `search.list` endpoint returns video IDs, then `videos.list` is called with all 50 IDs to get `contentDetails`. The API may be returning fewer items than requested, causing some IDs to have no match in `videoMap`.
**Impact:**
- Credit estimation is wrong — videos without duration default to 7 credits (1 min transcription) regardless of actual length
- A 45-minute video without duration data would be estimated at 7 credits but could cost 315 credits
- The 45-minute safety guard in `processUrl()` won't trigger for videos without duration
- Content type classification defaults all to `long_video` (shorts not detected)

**Fix direction:** Debug the `videos.list` API call. Check if it needs pagination for >50 IDs, or if the response is being truncated. Add logging to compare requested IDs vs returned IDs.

---

### BUG #2: FK constraint blocks job creation in dev mode [CRITICAL]

**Location:** `supabase/migrations/021_scrape_jobs.sql:8`
**Symptom:** `POST /api/scrape/profile` returns 500 with FK violation
**Schema:**
```sql
triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
```
**Root cause:** `DEV_USER_ID=00000000-0000-0000-0000-000000000001` exists in `profiles` but NOT in `auth.users`. The FK references `auth.users`, not `profiles`.
**Note:** Other tables (kols, posts, etc.) reference `profiles(id)` instead — this table is inconsistent.
**Impact:** Batch scraping is completely broken in development mode.

**Fix direction:** Either:
1. Change FK to reference `profiles(id)` (consistent with other tables), OR
2. Seed a test user into `auth.users` for development, OR
3. Make `triggered_by` nullable without FK (least safe)

---

### BUG #3: Twitter API key not in `.env.local` [MEDIUM]

**Location:** `.env.local` (missing `TWITTERAPI_IO_KEY`)
**Impact:** Twitter/X profile scraping cannot be tested or used.
**Fix direction:** Add `TWITTERAPI_IO_KEY` to `.env.local` and `.env.example`.

---

### BUG #4: UI only mentions YouTube support [LOW]

**Location:** `src/messages/zh-TW/scrape.json` and `src/messages/en/scrape.json`
**Symptom:**
```json
"urlPlaceholder": "貼上 YouTube 頻道 URL",
"supportedPlatforms": "支援: YouTube 頻道"
```
**Reality:** The form code (`profile-scrape-form.tsx`) accepts both YouTube and Twitter/X URLs and shows the correct platform icon dynamically.
**Impact:** Users won't know they can paste Twitter/X URLs.

**Fix direction:** Update translations to mention both platforms:
- `"urlPlaceholder": "貼上 YouTube 頻道或 Twitter/X 個人檔案 URL"`
- `"supportedPlatforms": "支援: YouTube 頻道、Twitter/X"`

---

### BUG #5: Frontend reads `error` but backend sends `errorMessage` [MEDIUM]

**Location:**
- Backend: `src/domain/models/kol-source.ts:49` → `errorMessage: string | null`
- Frontend: `src/hooks/use-scrape.ts:38` → `error?: string`
- UI: `src/components/scrape/scrape-progress.tsx:190` → `job.error`

**Impact:** When a scrape job fails with an error message, the UI will never display it. `job.error` will always be `undefined` because the backend sends the field as `errorMessage`.

**Fix direction:** Either rename backend field to `error` in the API response serialization, or update frontend type to read `errorMessage`.

---

### BUG #6: Frontend expects `url` field that backend doesn't return [LOW]

**Location:** `src/hooks/use-scrape.ts:33` → `url: string` in `ScrapeJob` type
**Impact:** The `url` field is defined in the frontend type but never populated by the API. Currently unused in the UI rendering, so no visible impact — but the type is misleading.

**Fix direction:** Remove `url` from the frontend `ScrapeJob` interface, or add it to the backend response.

---

### BUG #7: Dead `stats` fallback in frontend type [LOW]

**Location:** `src/hooks/use-scrape.ts:46-51`
```typescript
stats?: {
  videosFound: number;
  postsCreated: number;
  duplicates: number;
  errors: number;
};
```
**Impact:** This object is never populated by the backend. The fallback pattern `job.importedCount ?? job.stats?.postsCreated ?? 0` works because the first value is always present, but `stats` is dead code.

**Fix direction:** Remove the `stats` field and all `?? job.stats?.xxx` fallbacks.

---

### BUG #8: `initialProgress.totalUrls` uses wrong count [MEDIUM]

**Location:** `src/domain/services/profile-scrape.service.ts:196`
```typescript
initialProgress: {
  processedUrls: 0,
  totalUrls: profile.postUrls.length,  // ← BUG: uses ALL urls, not selectedUrls
  ...
}
```
**While at line 173:**
```typescript
const urlsToScrape = selectedUrls ?? profile.postUrls;
```
**Impact:** If user selects 5 out of 50 URLs, the `initialProgress` response says `totalUrls: 50` even though only 5 will be processed. The actual job in the DB has the correct count (set at line 65 of scrape-job.repository.ts via `discoveredUrls.length`). This is only misleading in the immediate API response — subsequent polls will show the correct count.

**Fix direction:** Change line 196 to `totalUrls: urlsToScrape.length`.

---

## Potential Issues (Code Review, Not Yet Tested)

### Race Condition in Polling-Driven Processing

**Location:** `src/hooks/use-scrape.ts:120-126`
The frontend fires `/continue` as a fire-and-forget on every poll (every 5s). If a batch takes >5s to process, two concurrent `/continue` calls could both read the same `processedUrls` value and process overlapping URL batches. There's no server-side lock or optimistic concurrency control.

**Risk:** Duplicate processing of the same URLs, leading to:
- Duplicate posts (caught by `findPostBySourceUrl` but wastes API credits)
- Incorrect progress counters
- Double credit consumption

### Cancel Button is UI-Only

**Location:** `src/components/scrape/scrape-progress.tsx:310`
The cancel button calls `onReset()` which only resets local React state. The server continues processing. There's no `DELETE` or `PATCH` endpoint to cancel a job.

**Risk:** Credits continue to be consumed after user "cancels". The job runs to completion in the background.

---

## Test Environment Notes

- `YOUTUBE_DATA_API_KEY`: Added during testing, works correctly
- `TWITTERAPI_IO_KEY`: Missing, could not test Twitter
- `DEV_USER_ID`: Exists in `profiles` but not `auth.users` — blocks scrape job creation
- `GEMINI_API_KEY`: Present, could not test (blocked by Bug #2)
- `TIINGO_API_TOKEN`: Present, not relevant to scrape flow

---

## Priority Ranking

| # | Bug | Severity | Effort |
|---|-----|----------|--------|
| 2 | FK constraint blocks dev mode | **CRITICAL** | Small (migration or seed fix) |
| 1 | 72% videos missing duration | **HIGH** | Medium (debug YouTube API) |
| 5 | Error message field mismatch | **MEDIUM** | Small (rename field) |
| 8 | initialProgress.totalUrls wrong | **MEDIUM** | Small (one-line fix) |
| 3 | Twitter API key missing | **MEDIUM** | Config only |
| 4 | UI only mentions YouTube | **LOW** | Translation update |
| 6 | Dead `url` field in frontend type | **LOW** | Small cleanup |
| 7 | Dead `stats` fallback code | **LOW** | Small cleanup |
