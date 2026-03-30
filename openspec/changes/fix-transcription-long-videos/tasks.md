# Tasks: Fix Transcription for Long Videos Without Captions

## 1. Dynamic Timeout Scaling

- [ ] **1.1** Add `MAX_TRANSCRIPTION_TIMEOUT_MS = 600_000` constant in `gemini.client.ts`
- [ ] **1.2** Compute dynamic timeout in `geminiTranscribeVideo()` based on `durationSeconds`:
  - Formula: `max(180_000, min(600_000, 60_000 + durationSeconds × 4_000))`
  - Replace the flat `TRANSCRIPTION_TIMEOUT_MS` usage with the computed value
  - Fall back to `TRANSCRIPTION_TIMEOUT_MS` (180s) when `durationSeconds` is undefined

## 2. Retry with Exponential Backoff

- [ ] **2.1** Add retry logic in `geminiTranscribeVideo()` wrapping the fetch call:
  - Max 2 retries (3 total attempts)
  - Backoff delays: 5s, 15s
  - Retryable: AbortError (timeout), HTTP 429/500/503, TypeError "fetch failed"
  - Non-retryable: HTTP 400/403, validation errors, empty response
- [ ] **2.2** Log each retry attempt with: attempt number, error type, wait duration, video URL, duration

## 3. Dynamic maxOutputTokens

- [ ] **3.1** Compute `maxOutputTokens` based on `durationSeconds` in `geminiTranscribeVideo()`:
  - Formula: `min(65_536, max(16_384, Math.ceil(durationSeconds / 60) × 1_000))`
  - Fall back to `16_384` when `durationSeconds` is undefined

## 4. Batch Timeout Alignment

- [ ] **4.1** In `processJobBatch()` (`profile-scrape.service.ts`), increase timeout safeguard for YouTube batches:
  - Use `650_000` (650s) when `isYouTube` is true, otherwise keep the original `timeoutMs`

## 5. Improved Error Messages

- [ ] **5.1** Update timeout error message in `geminiTranscribeVideo()` to include video duration:
  - `"Video transcription timed out after Xs for a Y-min video. Try a shorter video or retry later."`
- [ ] **5.2** Add specific error message for HTTP 429 responses before retry

## 6. Verification

- [ ] **6.1** Run `npm run type-check` — no type errors
- [ ] **6.2** Run `npx vitest run` — existing tests pass
- [ ] **6.3** Review the complete `geminiTranscribeVideo()` function for correctness
