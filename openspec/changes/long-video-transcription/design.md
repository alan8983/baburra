# Design: Long Video Transcription

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     import-pipeline.service.ts                   │
│                                                                  │
│  YouTube URL + no captions                                       │
│       │                                                          │
│       ▼                                                          │
│  ┌──────────────────────┐                                        │
│  │ Duration check       │                                        │
│  │ ≤30 min? ──────────────────▶ Current path (file_uri direct)  │
│  │ >30 min? ──────┐     │                                        │
│  └────────────────┼─────┘                                        │
│                   ▼                                              │
│  ┌──────────────────────────────────────────────────┐           │
│  │ NEW: Audio Download + Upload Path                 │           │
│  │                                                    │           │
│  │  1. Download audio-only from YouTube               │           │
│  │     (yt-dlp / ytdl-core / external API)            │           │
│  │              │                                     │           │
│  │              ▼ audio file in /tmp                  │           │
│  │  2. Upload to Gemini File API                      │           │
│  │     POST /upload/v1beta/files                      │           │
│  │              │                                     │           │
│  │              ▼ google-hosted file_uri               │           │
│  │  3. generateContent with uploaded file_uri         │           │
│  │              │                                     │           │
│  │              ▼ transcript text                     │           │
│  │  4. Delete file from Gemini (cleanup)              │           │
│  │  5. Delete /tmp audio file                         │           │
│  └──────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

## New module: `gemini-file.client.ts`

Separate from `gemini.client.ts` to keep concerns clean. Handles Gemini File API operations:

```ts
// src/infrastructure/api/gemini-file.client.ts

/** Upload a file to Gemini File API and return the file URI */
export async function uploadToGeminiFiles(
  buffer: Buffer,
  mimeType: string,
  displayName: string
): Promise<{ fileUri: string; fileName: string }>

/** Delete a file from Gemini File API */
export async function deleteGeminiFile(fileName: string): Promise<void>
```

**Upload flow:**
1. `POST /upload/v1beta/files` with resumable upload protocol
2. Headers: `X-Goog-Upload-Protocol: resumable`, content type, content length
3. Returns `{ file: { uri: "...", name: "files/xxx", state: "ACTIVE" } }`
4. Poll `state` until `ACTIVE` (for large files, may be `PROCESSING` briefly)

## New module: `youtube-audio.client.ts`

Handles YouTube audio extraction:

```ts
// src/infrastructure/api/youtube-audio.client.ts

/** Download audio-only from a YouTube video, return buffer + metadata */
export async function downloadYoutubeAudio(
  youtubeUrl: string,
  options?: { maxDurationSeconds?: number }
): Promise<{
  buffer: Buffer;
  mimeType: string;       // e.g., 'audio/mp4'
  sizeBytes: number;
  durationSeconds: number;
}>
```

**Implementation depends on spike results** — the interface stays the same regardless of which download method wins.

## Modified: `gemini.client.ts`

### New function: `geminiTranscribeAudio()`

```ts
/** Transcribe audio via Gemini File API upload (for long videos) */
export async function geminiTranscribeAudio(
  fileUri: string,
  durationSeconds?: number
): Promise<string>
```

- Same prompt and config as `geminiTranscribeVideo()` but uses uploaded `file_uri`
- No `mediaResolution` needed (audio-only)
- Token usage: only audio tokens (~32/sec) — no video tokens at all

### Modified constant

```ts
const MAX_VIDEO_DURATION_SECONDS = 120 * 60; // 120 minutes (was 45)
```

## Modified: `import-pipeline.service.ts`

### Decision logic in `processUrl()`

```
if (isYouTube && !hasCaptions) {
  if (durationSeconds && durationSeconds > 30 * 60) {
    // Long video path: download audio → upload → transcribe
    transcript = await longVideoTranscribe(youtubeUrl, durationSeconds);
  } else {
    // Short video path: existing file_uri approach
    transcript = await geminiTranscribeVideo(youtubeUrl, durationSeconds);
  }
}
```

The 30-min threshold is conservative — `file_uri` works reliably under that.

### `longVideoTranscribe()` orchestrator

```ts
async function longVideoTranscribe(
  youtubeUrl: string,
  durationSeconds: number
): Promise<string> {
  // 1. Download audio
  const audio = await downloadYoutubeAudio(youtubeUrl, {
    maxDurationSeconds: MAX_VIDEO_DURATION_SECONDS,
  });

  // 2. Upload to Gemini
  const { fileUri, fileName } = await uploadToGeminiFiles(
    audio.buffer,
    audio.mimeType,
    `transcript-${Date.now()}`
  );

  try {
    // 3. Transcribe
    return await geminiTranscribeAudio(fileUri, durationSeconds);
  } finally {
    // 4. Cleanup (best-effort, don't throw)
    deleteGeminiFile(fileName).catch(console.warn);
  }
}
```

## Timeout strategy

| Video duration | Download est. | Upload est. | Transcription est. | Total est. |
|---------------|--------------|-------------|--------------------|-----------:|
| 30 min        | 10s          | 5s          | 30s                | 45s        |
| 60 min        | 20s          | 10s         | 60s                | 90s        |
| 90 min        | 30s          | 15s         | 90s                | 135s       |
| 120 min       | 40s          | 20s         | 120s               | 180s       |

Current `maxDuration = 180` on batch import fits up to ~90 min comfortably. For 120-min videos:
- Increase batch import `maxDuration` to **300s** (Vercel Pro allows this)
- OR rely on scrape job continuation (already processes YouTube URLs one at a time with its own timeout management)

**Recommendation**: Increase to 300s for batch import. The scrape continuation path already handles its own timeout budgeting.

## Cost impact

**Audio-only eliminates ALL video tokens:**

| Duration | Current (low-res video + audio) | New (audio only) | Savings |
|----------|--------------------------------|-------------------|---------|
| 30 min   | $0.078 (132 tok/s)             | $0.058 (32 tok/s) | 26%     |
| 60 min   | $0.156                          | $0.115             | 26%     |
| 120 min  | N/A (rejected)                  | $0.230             | ∞ (new) |

The savings are modest per-video because audio tokens are $1.00/M vs video at $0.30/M (audio is 3.3x more expensive per token, but there are far fewer of them). The real win is **enabling 60–120 min videos that were impossible before**.

## Credit cost updates

Current: `video_transcription_per_min: 7`

This should stay the same or adjust slightly. The cost per minute goes down with audio-only, but keeping it at 7 credits/min is conservative and accounts for the multi-step overhead. Revisit after observing real costs.

## Error handling

- **Audio download fails**: Fall back to `file_uri` direct approach (might work for some videos), then fail with clear error
- **Gemini upload fails**: Retry once, then fail
- **Transcription fails**: Existing retry logic applies
- **Cleanup fails**: Log warning, don't throw (file auto-expires in 48h anyway)

## Files to create/modify

| File | Action |
|------|--------|
| `src/infrastructure/api/youtube-audio.client.ts` | **NEW** — YouTube audio download |
| `src/infrastructure/api/gemini-file.client.ts` | **NEW** — Gemini File API upload/delete |
| `src/infrastructure/api/gemini.client.ts` | **MODIFY** — Add `geminiTranscribeAudio()`, raise duration cap |
| `src/domain/services/import-pipeline.service.ts` | **MODIFY** — Add long-video routing logic |
| `src/app/api/import/batch/route.ts` | **MODIFY** — Increase `maxDuration` to 300 |
| `package.json` | **MODIFY** — Add audio download dependency (TBD from spike) |
