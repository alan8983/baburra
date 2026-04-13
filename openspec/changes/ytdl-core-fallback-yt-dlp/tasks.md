# Tasks: yt-dlp Fallback for YouTube Audio Download

## Phase 1 — Add yt-dlp-exec dependency

- [x] **1.1** Install `yt-dlp-exec` and verify binary is available
  - `npm install yt-dlp-exec`
  - Verified: `exec('--version')` returns `2026.03.17`
  - API: `require('yt-dlp-exec').exec(url, opts)` returns `{ stdout, stderr }`

## Phase 2 — Modify youtube-audio.client.ts

- [x] **2.1** Extract existing ytdl-core logic into private `downloadWithYtdlCore()`

- [x] **2.2** Add `downloadWithYtDlp()` private function
  - Uses `yt-dlp-exec` `exec()` API with camelCase options
  - Step 1: `dumpJson` to get duration, enforce `maxDurationSeconds`
  - Step 2: `format: 'bestaudio[ext=webm]/bestaudio'` + `output: tmpFile`
  - Step 3: `fs.createReadStream(tmpFile)` with cleanup on end/error/close
  - Returns same `AudioStreamResult` interface

- [x] **2.3** Rewrite `downloadYoutubeAudioStream()` with fallback
  - Try `downloadWithYtdlCore()` first
  - On catch: log warning, call `downloadWithYtDlp()` (except duration-limit errors)
  - Both failures → throw the yt-dlp error

## Phase 3 — Tests

- [x] **3.1** Type-check passes: `npm run type-check` ✅

- [x] **3.2** Existing tests pass: `npm test` — 860/860 pass ✅

- [x] **3.3** Manual integration test: download audio from a Gooaye video
  - ytdl-core failed → fell back to yt-dlp → 44.5 MB webm in ~27s
  - duration=3020s (~51 min), mimeType=audio/webm, stream readable ✅

## Phase 4 — Validation: Re-run Gooaye scrape

- [ ] **4.1** Re-run `npx tsx scripts/scrape-gooaye-yt-601-650.ts`
  - Success criteria: >=30/43 videos imported (>70% pass rate)
  - Expect some filtered (non-investment content) but no format-extraction errors
