# Proposal: yt-dlp Fallback for YouTube Audio Download

## Why

`@distube/ytdl-core` (v4.16.12, latest) fails with **"Failed to find any playable formats"** on all Gooaye YouTube videos (and likely many other channels). This is a known fragility — YouTube frequently changes its page structure, breaking JS-based extractors. The long-video-transcription spike (Phase 1.1) already documented this exact failure and validated `yt-dlp-exec` as the working alternative, but the final implementation used `@distube/ytdl-core` for the streaming Deepgram path.

**Impact**: 100% failure rate on Gooaye EP 601-650 seed scrape (43/43 videos failed). Any channel that triggers the captionless audio-download path is affected.

## What Changes

Add `yt-dlp-exec` (npm package bundling the `yt-dlp` binary) as a **fallback** in `youtube-audio.client.ts` when `@distube/ytdl-core` fails to extract formats.

**Strategy: try-fast-then-reliable**
1. Try `@distube/ytdl-core` first (fast, no binary spawn, works for most videos)
2. On failure, fall back to `yt-dlp-exec` (spawns binary, always works, ~2-5s overhead)
3. Return the same `AudioStreamResult` interface so the downstream Deepgram streaming path is unchanged

This is a minimal, surgical fix to `youtube-audio.client.ts` — no changes to the transcription service, import pipeline, or credit model.

## Scope

### In scope
- Add `yt-dlp-exec` dependency
- Add `downloadWithYtDlp()` function in `youtube-audio.client.ts`
- Wrap `downloadYoutubeAudioStream()` with try/catch fallback logic
- Unit tests for the fallback path
- Re-run Gooaye EP 601-650 scrape to validate

### Out of scope
- Removing `@distube/ytdl-core` entirely (still useful when it works — faster, no binary)
- Changing the Deepgram streaming transcription path
- Changing credit cost calculations
- Vercel deployment concerns (seed scraping runs locally via `npx tsx`, not on Vercel)

## Constraints

| Constraint | Value | Impact |
|-----------|-------|--------|
| `yt-dlp-exec` binary size | ~20 MB per platform | Acceptable for local scripts; not bundled in Vercel deployment |
| yt-dlp output | File-based (writes to /tmp) | Must convert to Readable stream for Deepgram |
| Deepgram expects streaming | `Readable` + `mimeType` | yt-dlp path creates a file stream from the downloaded file |
| Seed scraping runs locally | `npx tsx scripts/...` | No Vercel serverless constraints apply |
