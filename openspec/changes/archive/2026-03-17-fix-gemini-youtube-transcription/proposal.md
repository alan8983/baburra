# Proposal: Fix Gemini YouTube Transcription (Tasks 4.3/4.4)

## What

Fix `geminiTranscribeVideo()` which fails with "fetch failed" (TCP-level connection error) when calling the Gemini API with a YouTube URL. Also optimize token cost by ~43% and support longer transcripts.

## Why

During verification testing of the `youtube-transcript-gemini` change (tasks 4.3–4.4), Gemini video transcription fails immediately with a raw "fetch failed" error — not an HTTP error, not a timeout. This blocks all captionless YouTube video processing.

### Root Cause (from official docs investigation)

Our implementation uses `mime_type: 'video/youtube'` in the `file_data` object:

```ts
// CURRENT (broken)
file_data: {
  mime_type: 'video/youtube',   // ← NOT in any official Google documentation
  file_uri: youtubeUrl,
}
```

The official Gemini REST API documentation shows YouTube URLs passed **without any mime_type**:

```json
// Official Google REST example
{
  "file_data": {
    "file_uri": "https://www.youtube.com/watch?v=9hE5-98ZeCg"
  }
}
```

The `video/youtube` mime type does not appear anywhere in Google's official docs. It was likely hallucinated during the original implementation. The Go SDK example uses `video/mp4`, and the REST/JS examples omit it entirely.

### Additional optimizations discovered

1. **`mediaResolution: 'low'`** — reduces video tokens from ~300/sec to ~100/sec (we only need audio for transcription). Saves ~43% on input cost when YouTube pricing goes live.
2. **`maxOutputTokens: 8192`** — too low for 45-min videos. A 45-min transcript can easily exceed 8K tokens (~27K needed).

### Cost impact analysis (Gemini 2.5 Flash paid tier)

| Duration | Current design (A) | With low-res (A+C) | Savings |
|----------|-------------------|---------------------|---------|
| 5 min    | $0.044            | $0.025              | 43%     |
| 15 min   | $0.132            | $0.078              | 41%     |
| 45 min   | $0.396            | $0.234              | 41%     |

Note: YouTube is currently in **preview (free)**. These savings apply when Google begins charging.

## Scope

- Fix: Remove `mime_type` from YouTube `file_data` request
- Optimize: Add `mediaResolution: 'low'` to `generationConfig`
- Fix: Increase `maxOutputTokens` from 8192 to 16384
- Keep: Enhanced error logging (already added)
- Out of scope: Audio-only pipeline (Approach B) — only 35% additional savings over low-res, not worth the `yt-dlp` complexity now
