# Proposal: Fix Transcription for Long Videos Without Captions

## What

Harden the Gemini video transcription pipeline so that long YouTube videos (10–45 min) without captions complete reliably instead of timing out or failing silently.

## Why

Users report that long videos with no captions return errors during the SCRAPE flow. The current implementation has several issues that compound for longer videos:

1. **Flat 180s timeout** — Gemini must download + process the entire video before responding. Short videos (~5 min) complete in 10–15s, but 30–45 min videos can exceed 180s easily.
2. **Zero retries** — A single transient failure (timeout, 503, 429) kills the URL permanently. No retry logic exists in `geminiTranscribeVideo()`.
3. **16,384 maxOutputTokens may truncate** — Dense/fast-talking 45-min videos can produce transcripts exceeding this limit.
4. **50s batch timeout misalignment** — `processJobBatch` has a 50s safeguard, but a single Gemini call for a long video can exceed this. The current mitigation (batchSize=1 for YouTube) helps but doesn't fully solve it.

### Impact

- Users with YouTube KOLs who post long-form content (podcasts, livestreams, deep-dives) cannot import those videos
- Credits are consumed before the Gemini call, then refunded on failure — wasteful churn
- Error messages are generic ("fetch failed", "timed out") — not actionable for users

## Scope

### In scope
- Dynamic timeout scaling based on video duration
- Retry with exponential backoff for transient errors
- Dynamic maxOutputTokens scaling for long videos
- Better error messages surfaced to users
- Batch timeout alignment for long transcription jobs

### Out of scope
- Audio-only pipeline (yt-dlp extraction) — separate optimization
- Chunked/segmented transcription — too complex for this change, revisit if single-call still fails after fixes
- Changes to the credit cost model
- UI/UX changes beyond error message improvements
