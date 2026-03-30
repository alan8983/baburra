# Design: Fix Transcription for Long Videos Without Captions

## Overview

Three targeted changes to `gemini.client.ts` and one to `profile-scrape.service.ts` to make long-video transcription reliable.

## 1. Dynamic Timeout Scaling

**File:** `src/infrastructure/api/gemini.client.ts`

Current: flat `TRANSCRIPTION_TIMEOUT_MS = 180_000` (3 min)

**New formula:**
```
timeout = max(180_000, min(600_000, 60_000 + durationSeconds × 4_000))
```

| Video length | Timeout |
|-------------|---------|
| ≤30s (short) | 180s (floor) |
| 5 min | 180s (floor) |
| 10 min | 300s (5 min) |
| 20 min | 540s (9 min) |
| 45 min | 600s (10 min cap) |

Rationale: Gemini needs roughly 2–4× real-time to download and process video. The floor of 180s covers short videos + network jitter; the cap of 600s prevents indefinite hangs.

**Implementation:**
- Keep `TRANSCRIPTION_TIMEOUT_MS` as the default/floor
- Add `MAX_TRANSCRIPTION_TIMEOUT_MS = 600_000`
- Compute dynamic timeout inside `geminiTranscribeVideo()` based on `durationSeconds`

## 2. Retry with Exponential Backoff

**File:** `src/infrastructure/api/gemini.client.ts`

Add retry logic wrapping the fetch call inside `geminiTranscribeVideo()`:

- **Max retries:** 2 (3 total attempts)
- **Backoff:** 5s, then 15s
- **Retryable conditions:**
  - `AbortError` (timeout)
  - HTTP 429 (rate limit)
  - HTTP 503 (service unavailable)
  - HTTP 500 (internal server error)
  - Network errors (`TypeError` with "fetch failed")
- **Non-retryable (fail immediately):**
  - HTTP 400 (bad request — won't succeed on retry)
  - HTTP 403 (auth error)
  - Empty response / parse errors
  - Video too long validation error

**Implementation:**
- Extract the fetch + response parsing into an inner function
- Wrap with a retry loop
- Log each retry attempt with attempt number and wait duration

## 3. Dynamic maxOutputTokens

**File:** `src/infrastructure/api/gemini.client.ts`

Current: flat `16_384`

**New formula:**
```
maxOutputTokens = min(65_536, max(16_384, durationMinutes × 1_000))
```

| Video length | maxOutputTokens |
|-------------|----------------|
| ≤16 min | 16,384 (floor) |
| 20 min | 20,000 |
| 30 min | 30,000 |
| 45 min | 45,000 |

Rationale: Typical speech is ~150 words/min ≈ 200 tokens/min. 1,000 tokens/min gives 5× headroom for fast speakers, non-English languages with higher token counts, and Gemini's tokenization overhead.

## 4. Batch Timeout Alignment

**File:** `src/domain/services/profile-scrape.service.ts`

Current: `timeoutMs = 50_000` (50s) — too short for long video transcription.

**Change:** When processing YouTube URLs (already detected via `isYouTube` flag), increase the timeout safeguard to allow for transcription:

```
const effectiveTimeout = isYouTube ? 650_000 : timeoutMs;
```

This gives 650s (>10 min) for YouTube batches, accommodating the max Gemini timeout (600s) + overhead. Non-YouTube batches keep the 50s limit.

Note: This timeout is a *safeguard* for the polling loop, not a hard API timeout. The actual Vercel function timeout is managed by the caller. Since YouTube batches are already processed one URL at a time (batchSize=1), the polling mechanism (`/continue` endpoint) will simply pick up the next URL in the next poll cycle.

## 5. Improved Error Messages

**File:** `src/infrastructure/api/gemini.client.ts`

Enhance error messages to include actionable context:

- Timeout: `"Video transcription timed out after Xs for a Y-min video. Try a shorter video or retry later."`
- Rate limit (429): `"Gemini API rate limit reached. The video will be retried automatically."`
- Include video duration in all error logs for debugging

## Architecture Decision

**Why not chunked transcription?**

Gemini's `file_uri` approach sends the whole video to Google's servers for processing. There's no API to specify "transcribe minutes 10–20 only" via `file_uri`. Chunked transcription would require:
1. Downloading the video locally (yt-dlp)
2. Splitting into segments (ffmpeg)
3. Uploading each segment to Gemini File API
4. Transcribing each segment separately
5. Concatenating results

This is a fundamentally different architecture (audio-only pipeline) and is out of scope. The timeout + retry approach should handle the vast majority of long-video failures. If it doesn't, we revisit with the audio pipeline.
