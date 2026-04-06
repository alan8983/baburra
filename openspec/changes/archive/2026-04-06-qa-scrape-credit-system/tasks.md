## 1. Setup

- [x] 1.1 Copy `.env.local` to worktree, run `npm install`
- [x] 1.2 Start dev server via preview tool
- [x] 1.3 Record initial credit balance: **850** (free tier, DEV_USER_ID=8162f65d-90f6-416e-a71d-80a9b3be4c32)

## 2. Scrape Flow (A1, A3, A4)

- [x] 2.1 **A4** ✅ PASS — Discovery list shows 7 URLs, all with `captionAvailable: true`, `durationSeconds`, `estimatedCreditCost: 2`. Footer: "預估消耗點數 14", "剩餘點數 850/850". Button: "開始擷取 (14 點)"
- [x] 2.2 **A1** ⚠️ PARTIAL — Backend PASS: `scrape_jobs.status='completed'`, `processed_urls=2=total_urls`, `completed_at` set, 1 post created. UI BUG: ScrapeProgress stuck on "排隊中 0/2" despite API returning completed. After reload, job list shows "完成". **BUG: ScrapeProgress live rendering race condition.**
- [x] 2.3 **A3** ✅ PASS — Re-scraped AKG_8TmwhsU. Job `5fd8ec2a` completed with `duplicate_count=1, imported=0`. Post count for that URL = 1 (no duplicate created)

## 3. Credit System — Text & YouTube w/ Captions (B1, B2)

- [x] 3.1 Record credit balance snapshot: **850**
- [x] 3.2 **B1** ⏭️ BLOCKED — Twitter API unavailable, only YouTube+Twitter extractors supported. Cannot test text_analysis=1 credit path
- [x] 3.3 Record credit balance snapshot: **850**
- [x] 3.4 **B2** ✅ PASS — Imported `_BhwdvCTEgA` (YouTube w/ captions). Balance 850→848 (Δ=-2). Post created with sentiment=0, ticker NVDA. Content 28K chars (captions). `onboardingQuotaUsed: false` (credits charged)

## 4. Credit System — Gemini Transcription (B3, B4)

- [x] 4.1 Record credit balance snapshot: **675** (after re-run session; 850→848 B2, 848→845 B5, 845→677 timeout bug, 677→675 additional B2 re-confirm)
- [x] 4.2 **B3** ⚠️ PARTIAL — Gemini transcription path verified with `avAqWzH2PDw` (30s, captionless). First import took 19.9s (Gemini transcription). Credits consumed (7) then refunded (no stock tickers in test video). Captionless detection works: `[YouTubeExtractor] Transcript unavailable for avAqWzH2PDw`. Could not find a captionless finance video with stock tickers for full E2E post creation.
- [x] 4.3 **B2 re-confirm** ✅ PASS — Imported `z-EhNfOfLJg` (Meet Kevin, YouTube w/ captions). Balance 677→675 (Δ=-2). Post created, ticker CIRCLE. `onboardingQuotaUsed: false` (not first import).
- [x] 4.4 **B4** ✅ PASS — Re-imported `avAqWzH2PDw` (captionless). Second import 4.2s vs first 19.9s (4.7x faster). Transcript cache hit confirmed — Gemini transcription skipped.
- [x] 4.5 **BUG FOUND**: `processJobBatch` in `profile-scrape.service.ts:257` hardcodes `isOnboardingExempt = true`, meaning the **scrape flow never charges credits**. The batch import API (`/api/import/batch`) correctly checks `onboarding_import_used` flag, but the scrape continue flow bypasses it entirely.

## 5. Credit System — Re-roll & Edge Cases (B5, B7, B6)

- [x] 5.1 Record credit balance snapshot: **675**
- [x] 5.2 **B5** ✅ PASS — Re-roll on `_BhwdvCTEgA` content. Balance 848→845 (Δ=-3). Response: `sentiment=-1, confidence=0.7, usage.remaining=845`
- [x] 5.3 SKIPPED
- [x] 5.4 **B7** ✅ PASS — Imported `dQw4w9WgXcQ` (no stock tickers). Balance unchanged at 845 (credits refunded). Error: `no_tickers_identified`, no post created. Re-confirmed: `avAqWzH2PDw` also refunded (captionless, no tickers, balance 675→675).
- [x] 5.5 **B6** ⚠️ CODE VERIFIED — UI guard: `url-discovery-list.tsx:161,352` disables button when `totalEstimatedCredits > remainingBalance`. API guard: `consume_credits` RPC throws `INSUFFICIENT_CREDITS`, caught in `analyze/route.ts:29-43` → returns 429. `import-pipeline.service.ts:211-221` catches INSUFFICIENT_CREDITS and returns error. Not E2E tested (would require burning 675 credits first).

## 6. Edge Cases & UI (C1, A2, D1)

- [x] 6.1 **C1** ⚠️ CODE VERIFIED — Duration check at `import-pipeline.service.ts:189` + `gemini.client.ts:243`, both before Gemini call. Only fires on captionless videos (videos with captions bypass this, e.g. 54-min FKdVySZXq2U imported fine). Cannot E2E test: need captionless >45 min video + Gemini quota
- [x] 6.2 **A2** ✅ PASS — Warm load: page 643ms + API 3.9s = ~4.5s total. 20 post cards rendered. Cold load 20.1s (17.1s compile, expected in dev). Price enrichment working within timeout
- [x] 6.3 **D1** ✅ PASS — 375x812 mobile: sidebar hidden, "Toggle menu" hamburger visible, posts render single-column, stock tickers + sentiment tags visible, no layout overlap

## 7. Results

- [x] 7.1 Document pass/fail — see summary below
- [x] 7.2 Filed bug: `fix-scrape-progress-rendering` — ScrapeProgress live rendering race condition

---

## QA Results Summary

| ID | Scenario | Result | Evidence |
|----|----------|--------|----------|
| A4 | Discovery list credit tags | ✅ PASS | 7 URLs, `captionAvailable`, `estimatedCreditCost: 2`, footer total=14, button="開始擷取 (14 點)" |
| A1 | Scrape completion detection | ⚠️ PARTIAL | Backend: `status=completed`, `processed_urls=2=total_urls`. **UI BUG**: ScrapeProgress stuck on "排隊中 0/2" despite API returning completed |
| A3 | Duplicate post rejection | ✅ PASS | Re-scrape: `duplicate_count=1`, `imported=0`. Post count for URL = 1 |
| A2 | Posts page load <10s | ✅ PASS | Warm: 643ms page + 3.9s API = ~4.5s. 20 posts rendered |
| D1 | Mobile responsive | ✅ PASS | 375px: sidebar hidden, hamburger visible, single-column cards, no overlap |
| B1 | Text post = 1 credit | ⏭️ BLOCKED | Twitter API unavailable, only YouTube+Twitter extractors supported |
| B2 | YouTube w/ captions = 2 credits | ✅ PASS | Imported `z-EhNfOfLJg` (Meet Kevin). Balance 677→675 (Δ=-2). Post created, ticker CIRCLE. Also confirmed earlier: `_BhwdvCTEgA` 850→848 |
| B3 | Captionless YouTube = 7/min | ⚠️ PARTIAL | Gemini transcription works: `avAqWzH2PDw` (30s captionless) transcribed in 19.9s. Credits consumed (7) + refunded (no tickers). Could not find captionless finance video with tickers for full E2E |
| B4 | Transcript cache hit | ✅ PASS | Re-import `avAqWzH2PDw`: 4.2s (cache hit) vs 19.9s (first Gemini transcription). 4.7x speedup confirms cache working |
| B5 | Re-roll = 3 credits | ✅ PASS | Re-roll on `_BhwdvCTEgA`. Balance 848→845 (Δ=-3). Response: `sentiment=-1, confidence=0.7, usage.remaining=845` |
| B6 | Insufficient credits | ⚠️ CODE VERIFIED | UI guard at `url-discovery-list.tsx:161,352`. API guard: `consume_credits` RPC → INSUFFICIENT_CREDITS, caught in `import-pipeline.service.ts:211-221` + `analyze/route.ts:29-43` → 429. Not E2E tested |
| B7 | Zero-ticker refund | ✅ PASS | `dQw4w9WgXcQ`: balance unchanged at 845. Re-confirmed: `avAqWzH2PDw` (captionless, no tickers) balance 675→675 |
| C1 | Video >45 min rejected | ⚠️ CODE VERIFIED | Check at `import-pipeline.service.ts:189` + `gemini.client.ts:243`. Only fires on captionless videos |

### Bugs Found

1. **BUG: ScrapeProgress live rendering race condition** (A1)
   - ScrapeProgress component shows "排隊中 0/2" even after API returns `status: completed, processedUrls: 2`
   - Polling correctly stopped (status=completed), but UI didn't re-render with final data
   - After page reload, "最近的任務" section correctly shows "完成"
   - Root cause: likely React state not syncing with React Query cache update in ScrapeProgress
   - **Filed**: `fix-scrape-progress-rendering` change

2. **BUG: Scrape flow never charges credits** (NEW)
   - `processJobBatch` in `profile-scrape.service.ts:257` hardcodes `isOnboardingExempt = true`
   - All imports via the scrape flow (`/api/scrape/jobs/:id/continue`) bypass credit consumption entirely
   - Only `/api/import/batch` correctly checks `onboarding_import_used` and charges credits
   - **Impact**: HIGH — users can import unlimited content for free via the scrape flow
   - **Fix**: Pass correct `quotaExempt` based on `checkOnboardingImportUsed(userId)` in `processJobBatch`

3. **BUG: Batch import timeout too short for Gemini transcription** (from earlier session)
   - `BATCH_TIMEOUT_MS = 55_000` in `/api/import/batch/route.ts` but Gemini video transcription can take 120s+
   - Credits consumed before transcription but not refunded on timeout (168 credits lost for `qdnthSXoLaA`)
   - **Impact**: MEDIUM — credits lost on timeout, no post/transcript created
   - **Fix**: Increase timeout or move Gemini transcription to async processing

### Remaining Blockers

1. **Twitter API unavailable** — blocks text post credit test (B1)
   - **Recommendation**: Add a generic URL extractor for articles, or fix Twitter API integration
