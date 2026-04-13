# Design: yt-dlp Fallback for YouTube Audio Download

## Architecture Overview

```
downloadYoutubeAudioStream(url)
    │
    ▼
┌──────────────────────────────┐
│  Try @distube/ytdl-core      │  ← fast path (pure JS, no binary)
│  ytdl.getInfo() + stream     │
└──────────┬───────────────────┘
           │ success? ──▶ return AudioStreamResult
           │ fail?
           ▼
┌──────────────────────────────┐
│  Fallback: yt-dlp-exec      │  ← reliable path (binary spawn)
│  spawn yt-dlp → tmp file    │
│  → fs.createReadStream()    │
└──────────┬───────────────────┘
           │
           ▼
    return AudioStreamResult   (same interface, downstream unchanged)
           │
           ▼
    deepgramTranscribe(stream)  (no changes needed)
```

## Modified: `youtube-audio.client.ts`

### New import + helper

```ts
import { createReadStream, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
```

### New function: `downloadWithYtDlp()`

```ts
async function downloadWithYtDlp(
  youtubeUrl: string,
  options?: { maxDurationSeconds?: number }
): Promise<AudioStreamResult> {
  // 1. Get video info (duration) via yt-dlp --dump-json
  const ytDlpPath = require('yt-dlp-exec').getBinaryPath();
  const { stdout: jsonStr } = await execFileAsync(ytDlpPath, [
    '--dump-json', '--no-playlist', youtubeUrl,
  ], { timeout: 30_000 });
  const info = JSON.parse(jsonStr);
  const durationSeconds = info.duration ?? 0;

  if (options?.maxDurationSeconds && durationSeconds > options.maxDurationSeconds) {
    throw new Error(
      `Video too long (${Math.ceil(durationSeconds / 60)} min). ` +
      `Maximum is ${Math.ceil(options.maxDurationSeconds / 60)} minutes.`
    );
  }

  // 2. Download audio to temp file
  const tmpFile = join(tmpdir(), `ytdlp-audio-${Date.now()}.webm`);
  await execFileAsync(ytDlpPath, [
    '-f', 'bestaudio[ext=webm]/bestaudio',
    '--no-playlist',
    '-o', tmpFile,
    youtubeUrl,
  ], { timeout: DOWNLOAD_TIMEOUT_MS });

  // 3. Create read stream + cleanup on close
  const stream = createReadStream(tmpFile);
  const mimeType = 'audio/webm';
  const format = 'webm';

  // Auto-cleanup temp file when stream is consumed or destroyed
  const cleanup = () => {
    try { if (existsSync(tmpFile)) unlinkSync(tmpFile); } catch {}
  };
  stream.once('end', cleanup);
  stream.once('error', cleanup);
  stream.once('close', cleanup);

  return { stream, mimeType, durationSeconds, format };
}
```

### Modified: `downloadYoutubeAudioStream()`

Wrap existing logic in try/catch, fall back to yt-dlp:

```ts
export async function downloadYoutubeAudioStream(
  youtubeUrl: string,
  options?: { maxDurationSeconds?: number }
): Promise<AudioStreamResult> {
  // Fast path: @distube/ytdl-core (pure JS)
  try {
    return await downloadWithYtdlCore(youtubeUrl, options);
  } catch (ytdlErr) {
    const msg = ytdlErr instanceof Error ? ytdlErr.message : String(ytdlErr);
    console.warn(`[Audio] ytdl-core failed, falling back to yt-dlp: ${msg}`);
  }

  // Reliable fallback: yt-dlp binary
  return await downloadWithYtDlp(youtubeUrl, options);
}
```

The existing ytdl-core logic moves into a private `downloadWithYtdlCore()` function (rename, no logic change).

### bytesTotal

The yt-dlp fallback path doesn't provide `bytesTotal` upfront (unknown until download completes). The `wrapWithByteCounter` in `transcription.service.ts` already handles `bytesTotal: undefined` gracefully — stage callbacks just won't show a percentage.

## Dependency: `yt-dlp-exec`

```bash
npm install yt-dlp-exec
```

- Bundles platform-specific yt-dlp binary (~20 MB)
- Provides `getBinaryPath()` to locate the binary
- Used only as a fallback — not on the critical path for videos where ytdl-core works

## Temp file cleanup

The yt-dlp path writes audio to a temp file, then streams it. Cleanup happens via stream event listeners (`end`/`error`/`close`). If the process crashes mid-stream, the OS cleans up `/tmp` on reboot (acceptable for local scripts).

## Files to modify

| File | Action |
|------|--------|
| `src/infrastructure/api/youtube-audio.client.ts` | **MODIFY** — add yt-dlp fallback |
| `package.json` | **MODIFY** — add `yt-dlp-exec` dependency |
| `src/infrastructure/api/__tests__/youtube-audio.test.ts` | **NEW** — test fallback logic |

## Error handling

- If ytdl-core fails → log warning, try yt-dlp
- If yt-dlp also fails → throw (same as today, but now both paths have been tried)
- Duration check runs in both paths before download starts
- Temp file cleanup is best-effort (stream event listeners)
