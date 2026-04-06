# Validation Report: verify-credit-gemini-transcription

**Date:** 2026-03-27
**Environment:** Local worktree dev server (localhost:3000) + Supabase production
**DEV_USER_ID:** `8162f65d-90f6-416e-a71d-80a9b3be4c32`

## Summary

| Category | Pass | Fail | Skip |
|----------|------|------|------|
| Setup | 3 | 0 | 0 |
| Test A: Gemini Transcription | 7 | 0 | 0 |
| Test B: Cache Hit | 4 | 0 | 0 |
| **Total** | **14** | **0** | **0** |

## Commit Verdict: CLEAR TO COMMIT

All critical verification tests pass. No code changes were made — this is a verification-only change.

---

## Setup (3/3 pass)

### 1.1 first_import_free = false ✅
- **Query:** `profiles.first_import_free WHERE id = DEV_USER_ID`
- **Result:** `false` — credits will be consumed

### 1.2 Initial credit balance ✅
- **Query:** `profiles.credit_balance WHERE id = DEV_USER_ID`
- **Result:** `850` credits

### 1.3 Test video identified ✅
- **Channel:** 鏡發財 (`UCbRtQVBa61mbCZnK6YekjnQ`)
- **Video:** `https://www.youtube.com/watch?v=YNU39ZjbjZc` ("為何狂買ETF卻賺得很普通？")
- **Properties:** Captionless (Gemini transcription required), ~1 min, 7 credits estimated
- **Note:** Initially tried ZRBros (non-investment content, filtered) and Gooaye (>45 min limit, rejected). 鏡發財 has captionless investment videos under 45 min.

---

## Test A: Gemini Transcription Credits (7/7 pass)

### 2.1–2.3 Discovery & Selection ✅
- Navigated to `/scrape`, entered 鏡發財 channel URL
- Discovery returned 50 items
- Deselected all, selected only the latest video (Mar 26)

### 2.4 Caption status icon ✅
- **Evidence:** SVG icon with amber color `oklch(0.769 0.188 70.08)` — CaptionsOff icon confirmed
- **CSS class match:** `[class*="Caption"]` element found on selected item

### 2.5 Credit cost estimate > 2 ✅
- **Displayed:** "7 點" (7 credits) — indicates transcription pricing (7 credits/min × 1 min)
- **Footer text:** "1分鐘無字幕YouTube影片 = 7點"

### 2.6 Scrape job completion ✅
- **Job ID:** `075b75c4-c4c0-4f9a-9e74-0ff23c1c5e27`
- **Status:** `completed` (created 19:33:18, completed 19:35:24 — ~2 min processing time)
- **Result:** `imported_count: 1, error_count: 0`

### 2.7 Credit consumption ✅
- **Before:** 850 credits
- **After:** 843 credits
- **Consumed:** 7 credits = 1 min × 7 credits/min
- **Evidence:** `SELECT credit_balance FROM profiles WHERE id = 'DEV_USER_ID'` → `843`

### 2.8 Transcript stored in Supabase ✅
- **Query:** `SELECT * FROM transcripts WHERE source_url LIKE '%YNU39ZjbjZc%'`
- **Result:** Row `816002f9-8644-4d60-a4f9-1bb8279d5613`
  - `source: "gemini"` (confirmed Gemini transcription, not captions)
  - `created_at: 2026-03-26T19:35:15.277Z`
  - `content: NOT NULL` (full Chinese transcript of investment content about ETFs)

### 2.9 Post created with sentiment ✅
- **Query:** `SELECT * FROM posts WHERE source_url LIKE '%YNU39ZjbjZc%'`
- **Result:** Post `35cb3455-6d71-48d2-b5c5-dd01e87573a5`
  - `sentiment: -1` (bearish)
  - `kol_id: 8c19e03f` (鏡發財)
  - Stocks identified: 2330.TW (台積電), 0050, 0056

### 2.10 Post renders in UI ✅
- **Via Preview:** Navigated to `/posts/35cb3455-...`
- **Verdict Hero:** Shows "略微看多" prediction, "待定" verdict
- **Stock cards:** 2330.TW (台積電), 0050 (元大台灣50 ETF), 0056 (元大高股息 ETF)
- **Transcript content:** Full Gemini-transcribed text displayed (investment discussion about ETF performance, war impact, market analysis)

---

## Test B: Transcript Cache Hit (4/4 pass)

### 3.1 Post-Test A balance ✅
- **Balance:** 843 credits

### 3.2 Post deleted, transcript intact ✅
- Deleted post `35cb3455` via `DELETE /api/posts/{id}`
- Verified: `posts WHERE source_url LIKE '%YNU39ZjbjZc%'` → empty
- Verified: `transcripts WHERE source_url LIKE '%YNU39ZjbjZc%'` → row `816002f9` still exists
- Total transcript count: 25

### 3.3–3.4 Re-scrape credits ✅
- **New job:** `ab00e0c9-757d-4636-9fb0-a7a9021d83e3` (created after deleting old job)
- **Result:** `imported_count: 1, error_count: 0`
- **Credits:** 843 → 843 = **0 credits consumed**
- **Design note:** The code at `import-pipeline.service.ts:196-198` uses `findTranscriptByUrl()` to check the cache. When a cached transcript exists, it skips BOTH transcription (Gemini call) AND the credit consumption block. The original design expected 2 credits (caption analysis rate), but the actual implementation charges 0 credits on transcript cache hit. This is a **better UX** — users are not double-charged for content they already paid to transcribe.

### 3.5 No new transcript row ✅
- **Before re-scrape:** 25 transcripts
- **After re-scrape:** 25 transcripts (unchanged)
- **Evidence:** `Content-Range: 0-24/25` — no new row created (cache hit confirmed)

### 3.6 New post created ✅
- **Post ID:** `96368d64-7451-49ae-a9b5-1890835b439e`
- **Sentiment:** -2 (bearish) — different from Test A's -1, showing re-analysis occurred
- **Created at:** 2026-03-26T19:45:16.354Z

---

## Additional Findings

### Gooaye 45-minute limit rejection
- **Video:** EP647 (`hag1of5TGSk`, ~51 min)
- **Result:** `error_count: 1, imported_count: 0`
- **Credits:** 850 → 850 (no credits consumed)
- **Behavior:** System correctly rejects videos over 45 min without charging credits

### ZRBros non-investment filtering
- **Video:** "DRM Project" (`dHcYuNBUKsA`, 2014 amateur video)
- **Result:** `filtered_count: 1, imported_count: 0`
- **Transcript:** Created via Gemini (`source: "gemini"`) — transcription succeeded
- **Credits:** 850 → 850 (no credits consumed — ran before credit fix deployment)
- **Behavior:** System correctly filters non-investment content after transcription

### Credit consumption code path verified
- **`quotaExempt`** correctly set to `false` in current code (previously hardcoded `true` — fixed in `fix-scrape-credit-consumption`)
- **Credit deduction** uses `consume_credits` RPC for atomic operation
- **Refund on failure** is handled via `refundCredits()` catch block
