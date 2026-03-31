# Proposal: Long Video Transcription via Audio Download + Gemini File API

## What

Enable transcription of YouTube videos up to **2 hours** (currently capped at 45 min) by downloading the audio track and uploading it to the Gemini File API, bypassing Gemini's server-side YouTube download bottleneck.

## Why

Many high-value KOLs publish long-form content that the current pipeline silently rejects:
- **Gooaye (股癌)**: 40–60 min episodes
- **All-In Podcast**: 80–100 min episodes
- Any captionless video >~30 min fails with `TypeError: fetch failed` even when under the 45-min cap

**Root cause**: When we pass a YouTube URL via `file_data.file_uri`, Gemini downloads the video server-side. For videos >~30 min, Gemini's internal download/ingestion times out (0 input tokens consumed in AI Studio dashboard — never reaches inference). This is a Gemini-side limitation, not our timeout.

### Why audio-only?

We only need the spoken content for transcript → sentiment analysis. Downloading audio-only:
- **~10x smaller** than video (50-min audio ≈ 30–50 MB vs 500+ MB video)
- **Faster download + upload** — fits within Vercel function timeouts
- **Gemini supports audio natively** — mp3, m4a, opus, wav all supported, up to 8 hours
- **No wasted tokens** — eliminates all video tokens (currently ~100/sec even at low-res)

## Scope

### In scope
- **Phase 1 — Spike**: Validate audio download approach (yt-dlp binary vs ytdl-core vs cobalt API vs other) on both local dev and Vercel serverless
- **Phase 2 — Implement**: Audio download → Gemini File API upload → transcription pipeline
- **Phase 3 — Integrate**: Wire into `import-pipeline.service.ts` as the path for long/captionless videos
- Raise `MAX_VIDEO_DURATION_SECONDS` from 45 min to 120 min
- Update timeout and token calculations for new duration range
- Cleanup uploaded files from Gemini after transcription (48h auto-expiry exists, but explicit delete is cleaner)

### Out of scope
- Chunked video splitting (fallback if audio download fails entirely — defer to separate change)
- Caption extraction improvements (already handled by `youtube-transcript-plus`)
- Changing the short-video path (<30 min) — keep `file_uri` for those since it works

## Constraints

| Constraint | Value | Impact |
|-----------|-------|--------|
| Vercel function timeout (Pro) | 300s max | Must complete download + upload + transcription in one invocation, OR use job continuation pattern |
| Vercel `/tmp` storage | 512 MB | 50-min audio ≈ 30–50 MB — fits, but 2-hour video could reach 100+ MB |
| Current `maxDuration` on batch import | 180s | May need to increase, or use scrape job continuation for long videos |
| Gemini File API max file size | 2 GB | Not a concern for audio-only |
| Gemini File API storage quota | 20 GB / project | Need to clean up after transcription |
| Gemini audio processing | Up to 8 hours | Comfortable for 2-hour target |

## Approach options (for spike)

### Option A: `ytdl-core` / `@distube/ytdl-core` (pure JS)
- ✅ Runs on Vercel serverless (no binary)
- ❌ Notoriously fragile — YouTube frequently breaks it
- ❌ `@distube/ytdl-core` maintained fork is better but still can lag behind YouTube changes

### Option B: `yt-dlp` binary
- ✅ Most reliable YouTube extractor
- ❌ Python binary — needs bundling for Vercel (e.g., via Lambda layer or standalone binary)
- ❌ Adds ~20 MB to deployment

### Option C: External API service (cobalt.tools, etc.)
- ✅ No binary, no fragile JS library — just an HTTP call
- ✅ Handles YouTube changes server-side (maintained by service)
- ❌ External dependency — availability, rate limits, possible cost
- ❌ Privacy/ToS considerations

### Option D: Supabase Edge Function for download
- ✅ Offload heavy download to Deno runtime (no Vercel constraints)
- ❌ Adds architectural complexity
- ❌ Still needs one of A/B/C inside the edge function

The spike (Phase 1) will test Options A, B, and C to determine which is viable.
