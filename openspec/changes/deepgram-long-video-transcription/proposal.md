## Why

The `long-video-transcription` change (branch `claude/vibrant-keller`) successfully built an audio-only download pipeline for YouTube videos >30 min, but is **blocked by a Gemini server-side bug**: after uploading ~46 MB to `generativelanguage.googleapis.com`, all subsequent HTTPS connections to that host fail with `SocketError: other side closed`. This was exhaustively validated — fresh processes, delays, alternate HTTP clients all fail. The Gemini File API upload path is permanently unusable for this workflow.

Replacing only the transcription step with **Deepgram Nova-2** unblocks long-video support while keeping everything else already built (yt-dlp download, duration routing, `maxDuration=300`). Deepgram operates on a different host (`api.deepgram.com`), avoiding the stale socket entirely. It's also cheaper ($0.0043/min vs ~$0.025/min) and simpler (one POST vs upload+poll+cleanup).

This also affects the **scrape pipeline**: when scraping a KOL's YouTube channel, the job processes videos sequentially (`effectiveBatchSize=1`). If any video is >30 min and captionless, the Gemini socket bug causes it to fail and potentially poison subsequent requests in the same job. Deepgram eliminates this risk.

## What Changes

- **Add `deepgram.client.ts`** — New REST API client for speech-to-text transcription via Deepgram Nova-2. Single `fetch()` POST with audio body, returns transcript with timestamps and speaker diarization.
- **Remove `gemini-file.client.ts`** — Clean delete. The Gemini File API upload/poll/delete module is unusable due to the stale socket bug.
- **Remove `geminiTranscribeAudio()`** from `gemini.client.ts` — No longer needed; Deepgram replaces it.
- **Update `import-pipeline.service.ts`** — Swap the long-video path from Gemini File API upload+transcribe to yt-dlp download → Deepgram transcription. Duration routing (>30 min threshold) stays.
- **Update `youtube-audio.client.ts`** — Switch preferred audio format from m4a to **Opus (WebM)** for ~50% smaller files while maintaining Deepgram compatibility.
- **Transcript format** — Deepgram output includes timestamps and speaker diarization, formatted as structured text for downstream LLM analysis.
- **Add `DEEPGRAM_API_KEY`** to `.env.example` and `.env.local`.

## Capabilities

### New Capabilities

- `deepgram-transcription`: Deepgram Nova-2 REST API client for speech-to-text. Handles audio upload, model selection, language detection, and response parsing with timestamps + diarization.

### Modified Capabilities

- `ai-pipeline`: The long-video transcription path changes from Gemini File API to Deepgram. Short videos (≤30 min) and captioned videos are unaffected — Gemini `file_uri` and `youtube-transcript-plus` paths remain.

## Impact

- **New files**: `src/infrastructure/api/deepgram.client.ts`
- **Deleted files**: `src/infrastructure/api/gemini-file.client.ts`
- **Modified files**: `gemini.client.ts` (remove `geminiTranscribeAudio`), `import-pipeline.service.ts` (swap transcriber), `youtube-audio.client.ts` (opus format preference)
- **Dependencies**: No new npm packages (Deepgram is a single `fetch` call). `yt-dlp-exec` stays.
- **Environment**: New `DEEPGRAM_API_KEY` env var required.
- **Scrape pipeline**: Sequential YouTube processing (`effectiveBatchSize=1`) now uses Deepgram for long videos — no socket poisoning risk across sequential requests in the same job.
