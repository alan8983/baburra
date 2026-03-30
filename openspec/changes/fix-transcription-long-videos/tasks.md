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

- [ ] **7.1** Start the dev server (`npm run dev`)
- [ ] **7.2** Navigate to the Scrape page via Browser MCP
- [ ] **7.3** Submit a YouTube channel URL that contains a long video (>10 min) without captions
- [ ] **7.4** Proceed through the discovery step — verify the URL list shows correct duration and credit estimates
- [ ] **7.5** Select a long captionless video and start processing
- [ ] **7.6** Monitor the scrape progress via Browser MCP — verify:
  - No immediate error/timeout on the long video
  - Progress UI updates as the video is being transcribed
  - Job completes with status `success` (or `error` with a clear, actionable message — not a generic "fetch failed")
- [ ] **7.7** If the video imported successfully, verify the resulting post has transcript-derived content (navigate to the post detail page via Browser MCP)
- [ ] **7.8** Check server logs (terminal) for retry attempts, timeout values, and token config to confirm dynamic scaling is active
