# Design: Fix Gemini YouTube Transcription

## Changes

All changes are in a single file: `src/infrastructure/api/gemini.client.ts`

### 1. Remove `mime_type` from YouTube file_data

```ts
// BEFORE
file_data: {
  mime_type: 'video/youtube',
  file_uri: youtubeUrl,
}

// AFTER (matches official Google REST API docs)
file_data: {
  file_uri: youtubeUrl,
}
```

The Gemini API auto-detects YouTube URLs from the `file_uri` field. No mime_type needed.

### 2. Add `mediaResolution: 'low'` to generationConfig

```ts
generationConfig: {
  temperature: 0.1,
  maxOutputTokens: 16384,
  mediaResolution: 'low',   // ← NEW: ~100 tokens/sec instead of ~300
}
```

For transcription we only need audio understanding. Low-res video still provides visual context if needed but at 66 tokens/frame instead of 258. Audio tokens (32/sec) are unaffected.

Token savings per second:
- Default: 300 (video) + 32 (audio) = 332 tokens/sec
- Low-res: 100 (video) + 32 (audio) = 132 tokens/sec → 60% fewer tokens

Dollar savings are ~41-43% because audio tokens cost $1.00/M vs video at $0.30/M.

### 3. Increase maxOutputTokens from 8192 to 16384

A 45-min video transcript can reach ~27K output tokens. 8192 would truncate anything over ~15 min.

16384 handles up to ~30 min comfortably. For 45-min videos it may still truncate, but this is a pragmatic middle ground that doesn't waste context window on shorter videos.

### 4. Keep enhanced error logging (already in place)

The catch block already logs `error.name`, `error.message`, `error.cause`, `error.stack`, `url`, and `youtubeUrl`. No changes needed.

## Token & Cost Model

```
Gemini 2.5 Flash (paid tier):
  Input (video/image): $0.30 / 1M tokens
  Input (audio):       $1.00 / 1M tokens  ← 3.3x more per token
  Output:              $2.50 / 1M tokens

Per second with mediaResolution: 'low':
  Video: 100 tokens × $0.30/1M = $0.000030/sec
  Audio:  32 tokens × $1.00/1M = $0.000032/sec
  Total input:                  = $0.000062/sec

Per minute:  $0.0037 input
Per 15 min:  $0.056 input + ~$0.023 output = ~$0.078 total
Per 45 min:  $0.167 input + ~$0.068 output = ~$0.234 total
```

Currently YouTube is free (preview). These costs apply when pricing starts.

## No other files affected

The `geminiTranscribeVideo()` function signature and return type are unchanged:
```ts
export async function geminiTranscribeVideo(
  youtubeUrl: string,
  durationSeconds?: number
): Promise<string>
```

All callers (`import-pipeline.service.ts`) continue to work without changes.
