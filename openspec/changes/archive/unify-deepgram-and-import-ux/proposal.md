## Why

The import pipeline has two transcription paths (Gemini file_uri for short videos, Deepgram Nova-3 for long videos) creating unnecessary complexity and a known Gemini socket bug risk for edge cases. Deepgram is 2-7× cheaper, produces richer output (speaker labels + timestamps), and has a simpler dependency chain. Separately, the import UX blocks the entire screen with a fake progress overlay, preventing users from browsing or queuing more work while waiting. Credit costs (7/min) don't reflect the lower Deepgram pricing, and there's no time estimation shown to users.

## What Changes

- **Unify all video transcription on Deepgram Nova-3** — remove Gemini `file_uri` / `geminiTranscribeVideo` path entirely; all captionless YouTube videos (short and long) go through yt-dlp audio download → Deepgram
- **Add retry logic to Deepgram client** — 2 retries with 5s/15s exponential backoff for transient errors (503, 429, network, timeout)
- **Replace full-screen import overlay with non-blocking toast** — users can navigate freely during import; persistent toast shows per-URL real-time status with actual progress
- **Add time estimation** — show estimated processing time alongside credit cost before user confirms import
- **Adjust credit economy (Option C)** — lower video transcription cost from 7 to 5 credits/min; lower free tier pool from 850 to 700 credits/week
- **Post-transcription credit reconciliation** — use Deepgram utterance timestamps to reconcile actual duration vs estimated, adjusting credit charge
- **Fix Nova-2 → Nova-3 comment mismatch** in 3 locations
- **Fix null duration routing** — when `durationSeconds` is null, default to Deepgram (moot once unified, but needed during transition)

## Capabilities

### New Capabilities
- `import-time-estimation`: Estimate and display processing time per URL based on platform, duration, and content type before import confirmation
- `non-blocking-import`: Replace full-screen overlay with persistent toast showing real-time per-URL import status; user can navigate SPA freely during import

### Modified Capabilities
- `ai-pipeline`: Unify transcription on Deepgram Nova-3 for all captionless videos; add retry with exponential backoff; remove Gemini video transcription path; add post-transcription credit reconciliation using actual duration from Deepgram utterances
- `data-models`: Update `CREDIT_COSTS.video_transcription_per_min` from 7 to 5; update `CREDIT_LIMITS.free` from 850 to 700

## Impact

- **Deleted code**: `geminiTranscribeVideo()` in `gemini.client.ts` (function + retry logic + dynamic timeout/token scaling)
- **Modified files**: `deepgram.client.ts` (retry logic, comment fixes), `import-pipeline.service.ts` (remove dual-path routing, add reconciliation), `ai-usage.repository.ts` (reconciliation function), `user.ts` (credit constants), `tiers.ts` (free tier limit)
- **New UI components**: `ImportToast` (replaces `ImportLoadingOverlay`), time estimation display in `ImportForm`
- **New store**: Zustand import-status store (persists across SPA navigation)
- **Dependencies**: No new dependencies; removes dependency on Gemini for video transcription
- **DB migration**: Update `credit_balance` default and `consume_credits` function for new free tier (700)
- **API contract**: No breaking changes; `/api/import/batch` response unchanged
