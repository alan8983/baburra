# Validation: Long Video Transcription

## Test Videos

| ID | Video | URL | Duration | Captions | Language | Expected Path |
|----|-------|-----|----------|----------|----------|---------------|
| V1 | Gooaye 股癌 EP508 | `https://www.youtube.com/watch?v=YUGqy_McFeg` | ~50 min | ❌ | 中文 | Audio download → File API → transcribe |
| V2 | Short captionless | `https://www.youtube.com/watch?v=nxnOFrp-OFU` | ~10 min | ❌ | — | Direct `file_uri` (existing path) |
| V3 | Chinese captioned | `https://www.youtube.com/watch?v=v58ms5EwvtE` | — | ✅ | 中文 | `youtube-transcript-plus` (no Gemini) |
| V4 | English captioned | TBD — confirm during spike (task 1.1) | ~15 min | ✅ | English | `youtube-transcript-plus` (no Gemini) |

> **V4 selection criteria:** Pick a stable English finance/investing video with CC captions from a major channel (CNBC, TED, Bloomberg). Confirm URL during Phase 1 spike and update this table.

**Auth:** All tests use `DEV_USER_ID` (bypass login). Ensure dev user has sufficient credits (~500+) before starting.

---

## Tier 1 — Smoke Test (run after every phase)

Quick checks that nothing is broken.

### T1.1: Type check + unit tests

```bash
npm run type-check
npm test
```

**Pass criteria:** Zero new errors. Pre-existing failures in `profile-scrape-performance.test.ts` are acceptable.

### T1.2: Browser MCP — Short captionless video (V2) imports successfully

**Purpose:** Verify the existing short-video `file_uri` path still works (regression).

```
Browser MCP Steps:
──────────────────
1. navigate("http://localhost:3000/input")
2. Wait for page to load (textarea visible)
3. fill(textarea, "https://www.youtube.com/watch?v=nxnOFrp-OFU")
4. Wait for URL detection badge to appear
5. click(Import button — button with ArrowRight icon)
6. WAIT for loading overlay to disappear (timeout: 120s)
   - Overlay selector: div.fixed.inset-0.z-50
   - Poll every 5s until overlay is gone OR results appear
7. ASSERT: Results page (Step 3) is visible
8. ASSERT: Green checkmark icon visible (svg with text-green-500 class)
   OR success badge visible
9. ASSERT: No red error icons (svg with text-red-500 class)
10. Screenshot final state
```

**Pass criteria:**
- Import completes without error
- Post created with sentiment analysis
- Total time < 60s

---

## Tier 2 — Feature Validation (run after Phase 3 integration)

Core feature tests for the new audio download path.

### T2.1: Browser MCP — Long captionless video (V1, ~50 min) imports via new path

**Purpose:** This is THE test. The exact scenario from Issue #40 that was previously failing.

```
Browser MCP Steps:
──────────────────
1. navigate("http://localhost:3000/input")
2. Wait for page to load
3. fill(textarea, "https://www.youtube.com/watch?v=YUGqy_McFeg")
4. Wait for URL detection badge to appear
5. click(Import button)
6. WAIT for loading overlay to disappear (timeout: 300s)
   - This WILL take 60-180s — audio download + upload + transcription
   - Poll every 10s, log progress
7. ASSERT: Results page visible
8. ASSERT: Green success icon — NOT red error
9. ASSERT: Sentiment indicator visible (bullish/bearish/neutral badge)
10. ASSERT: Stock tickers identified (if any)
11. Screenshot final state
```

**Server log verification (check terminal output):**
```
Expected log sequence:
  [Audio] Downloading audio: https://www.youtube.com/watch?v=YUGqy_McFeg
  [Audio] Download complete: ~XX MB, audio/mp4
  [Gemini] Uploading file to Gemini Files API...
  [Gemini] File uploaded: files/xxx (state: ACTIVE)
  [Gemini] Transcribing audio: files/xxx | duration=50min
  [Gemini] Transcription complete (XX tokens)
  [Gemini] File cleanup: files/xxx deleted
```

**Pass criteria:**
- Import completes successfully (no `fetch failed` error)
- Transcript is generated and non-empty
- AI analysis produces sentiment + tickers
- Post appears in posts list
- Total time < 300s

### T2.2: Browser MCP — Chinese captioned video (V3) uses caption path

**Purpose:** Regression — captioned videos should NOT use the audio download path.

```
Browser MCP Steps:
──────────────────
1. navigate("http://localhost:3000/input")
2. fill(textarea, "https://www.youtube.com/watch?v=v58ms5EwvtE")
3. Wait for URL detection badge
4. click(Import button)
5. WAIT for results (timeout: 60s — caption path is fast)
6. ASSERT: Success
7. Screenshot
```

**Server log verification:**
```
Expected: NO "[Audio] Downloading" or "[Gemini] Uploading file" logs
Expected: youtube-transcript-plus caption extraction used
```

**Pass criteria:**
- Completes in < 30s (caption extraction is fast)
- No audio download triggered
- Credit cost = 2 (caption analysis, not 7/min video transcription)

### T2.3: Browser MCP — English captioned video (V4) uses caption path

**Purpose:** Same as T2.2 but English language — verifies cross-language caption support.

```
Browser MCP Steps:
──────────────────
1. navigate("http://localhost:3000/input")
2. fill(textarea, "<V4 URL — update when confirmed>")
3. Wait for URL detection badge
4. click(Import button)
5. WAIT for results (timeout: 60s)
6. ASSERT: Success
7. Screenshot
```

**Pass criteria:** Same as T2.2.

### T2.4: Transcript cache hit (re-import V1)

**Purpose:** Verify that re-importing the same long video hits the cache and is fast + free.

```
Browser MCP Steps:
──────────────────
1. navigate("http://localhost:3000/input")
2. fill(textarea, "https://www.youtube.com/watch?v=YUGqy_McFeg")
3. click(Import button)
4. WAIT for results (timeout: 60s — should be fast from cache)
5. ASSERT: Result shows "duplicate" status badge
   OR if new KOL context: fast completion with no audio download log
6. Screenshot
```

**Server log verification:**
```
Expected: "[Transcript] Cache hit for https://www.youtube.com/watch?v=YUGqy_McFeg"
Expected: NO "[Audio] Downloading" logs (cached transcript reused)
```

**Pass criteria:**
- Completes in < 30s (no download/upload/transcription)
- No additional credits consumed for transcription

---

## Tier 3 — Stress & Edge Cases (run before merge)

### T3.1: Browser MCP — Near upper-bound video (~90 min)

**Purpose:** Test close to the new 120-min limit. Use an All-In Podcast episode or similar.

```
Video: TBD — find a ~90 min captionless video during spike
Steps: Same as T2.1 but with 90-min video
Timeout: 300s (Vercel Pro max)
```

**Pass criteria:**
- Completes within 300s
- Transcript quality is reasonable (spot-check a few sentences)

### T3.2: Gemini File API cleanup verification

**Purpose:** Verify uploaded files are cleaned up after transcription.

```
After T2.1 completes:
1. Check server logs for "[Gemini] File cleanup: files/xxx deleted"
2. Optionally: call Gemini Files API list endpoint to verify file is gone
   GET https://generativelanguage.googleapis.com/v1beta/files?key=<API_KEY>
3. Confirm the file_uri from upload is no longer in the list
```

**Pass criteria:**
- Cleanup log present
- File no longer listed in Gemini Files API

### T3.3: Error resilience — invalid/private video URL

**Purpose:** Verify graceful failure for videos that can't be downloaded.

```
Browser MCP Steps:
──────────────────
1. navigate("http://localhost:3000/input")
2. fill(textarea, "https://www.youtube.com/watch?v=INVALID_ID_12345")
3. click(Import button)
4. WAIT for results (timeout: 60s)
5. ASSERT: Error badge visible (red icon)
6. ASSERT: No crash, no unhandled exception
7. Screenshot
```

**Pass criteria:**
- Graceful error message shown to user
- Credits refunded (if consumed before failure)
- No server crash

### T3.4: Duration limit enforcement — reject >120 min video

**Purpose:** Verify the new upper bound is enforced.

```
Test via API (not Browser MCP — hard to find a >120 min test video reliably):

curl -X POST http://localhost:3000/api/import/batch \
  -H "Content-Type: application/json" \
  -d '{"urls": ["<URL of a 3+ hour video>"]}'

OR: Mock test with durationSeconds > 7200 in unit test
```

**Pass criteria:**
- Error message: "Video too long (XXX min). Maximum is 120 minutes."
- No download attempt initiated

---

## Test Execution Checklist

| Test | Tier | Status | Notes |
|------|------|--------|-------|
| T1.1 | 1 | ☐ | Type check + unit tests |
| T1.2 | 1 | ☐ | Short captionless (V2) |
| T2.1 | 2 | ☐ | **Long captionless (V1) — THE test** |
| T2.2 | 2 | ☐ | Chinese captioned (V3) |
| T2.3 | 2 | ☐ | English captioned (V4) |
| T2.4 | 2 | ☐ | Transcript cache hit (re-import V1) |
| T3.1 | 3 | ☐ | Near upper-bound (~90 min) |
| T3.2 | 3 | ☐ | Gemini file cleanup |
| T3.3 | 3 | ☐ | Invalid video URL |
| T3.4 | 3 | ☐ | Duration limit >120 min |
