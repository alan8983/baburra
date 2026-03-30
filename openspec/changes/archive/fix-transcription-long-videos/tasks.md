# Tasks: Fix Transcription for Long Videos Without Captions

## 1. Dynamic Timeout Scaling

- [x] **1.1** Add `MAX_TRANSCRIPTION_TIMEOUT_MS = 600_000` constant in `gemini.client.ts`
- [x] **1.2** Compute dynamic timeout in `geminiTranscribeVideo()` based on `durationSeconds`:
  - Formula: `max(180_000, min(600_000, 60_000 + durationSeconds × 4_000))`
  - Replace the flat `TRANSCRIPTION_TIMEOUT_MS` usage with the computed value
  - Fall back to `TRANSCRIPTION_TIMEOUT_MS` (180s) when `durationSeconds` is undefined

## 2. Retry with Exponential Backoff

- [x] **2.1** Add retry logic in `geminiTranscribeVideo()` wrapping the fetch call:
  - Max 2 retries (3 total attempts)
  - Backoff delays: 5s, 15s
  - Retryable: AbortError (timeout), HTTP 429/500/503, TypeError "fetch failed"
  - Non-retryable: HTTP 400/403, validation errors, empty response
- [x] **2.2** Log each retry attempt with: attempt number, error type, wait duration, video URL, duration

## 3. Dynamic maxOutputTokens

- [x] **3.1** Compute `maxOutputTokens` based on `durationSeconds` in `geminiTranscribeVideo()`:
  - Formula: `min(65_536, max(16_384, Math.ceil(durationSeconds / 60) × 1_000))`
  - Fall back to `16_384` when `durationSeconds` is undefined

## 4. Batch Timeout Alignment

- [x] **4.1** In `processJobBatch()` (`profile-scrape.service.ts`), increase timeout safeguard for YouTube batches:
  - Use `650_000` (650s) when `isYouTube` is true, otherwise keep the original `timeoutMs`

## 5. Improved Error Messages

- [x] **5.1** Update timeout error message in `geminiTranscribeVideo()` to include video duration:
  - `"Video transcription timed out after Xs for a Y-min video. Try a shorter video or retry later."`
- [x] **5.2** Add specific error message for HTTP 429 responses before retry

## 6. Verification

- [x] **6.1** Run `npm run type-check` — no type errors
- [x] **6.2** Run `npx vitest run` — existing tests pass
- [x] **6.3** Review the complete `geminiTranscribeVideo()` function for correctness

## 7. E2E Smoke Test (Browser MCP)

- [x] **7.1** Start the dev server (`npm run dev`)
- [x] **7.2** Navigate to the Scrape page via Browser MCP
- [x] **7.3** Submit a YouTube video URL (34-min video without captions: `BOQjKB64xgM`) via `/input` page (channel discovery requires `YOUTUBE_DATA_API_KEY` not configured)
- [x] **7.4** _(Skipped — channel discovery flow requires `YOUTUBE_DATA_API_KEY`; tested via direct video import which uses the same `processUrl()` pipeline)_
- [x] **7.5** Video processed via Gemini transcription — no captions detected, triggered transcription path
- [x] **7.6** Monitor the scrape progress via Browser MCP — verified:
  - No immediate error/timeout on the 34-min video
  - Progress UI updated ("正在匯入 KOL 文章" → "完成匯入..." → "匯入完成！")
  - Attempt 1 failed with "fetch failed", retry succeeded on attempt 2
  - Job completed with status `success` — KOL "阿林的美股笔记" created, stock ONDS identified, sentiment "強烈看多"
- [x] **7.7** Post verified with transcript-derived content — full 34-min video transcript converted to structured Chinese investment analysis
- [x] **7.8** Server logs confirmed dynamic scaling is active:
  - `[Gemini] Transcribing video: ...BOQjKB64xgM | duration=34min | timeout=600s | maxTokens=34000`
  - `[Gemini] Transcription attempt 1 failed for ...BOQjKB64xgM: fetch failed. Retrying in 5s...`
  - `[Gemini] Transcription succeeded on attempt 2 for ...BOQjKB64xgM`

### Batch 2: Additional E2E Tests (3 more videos)

- [x] **7.9** `OD9aUfpuCGg` (阿林的美股笔记, 24-min, **no captions**) — **Success**
  - Gemini transcription: `duration=24min | timeout=600s | maxTokens=24000`
  - Attempt 1 failed ("fetch failed"), retry succeeded on attempt 2
  - Sentiment: 看空, stocks: MSTR, BTC
- [x] **7.10** `OcS1VPihU0E` (Money or Life 美股频道, **has captions**) — **Success**
  - Used caption extraction path (no Gemini transcription needed)
  - Sentiment: 看多, stocks: MSTR, SBET, BMNR, BTC, ETH, AAPL, CVX
- [x] **7.11** `cnsLcRD2TMs` (Gooaye 股癌, 51-min, **no captions** — stress test) — **Correctly rejected**
  - Pipeline guard at `MAX_VIDEO_DURATION_SECONDS = 45 * 60` caught it
  - Clear error: "Video too long (51 min). Maximum is 45 minutes."
  - Did NOT produce a generic "fetch failed" — error is actionable
