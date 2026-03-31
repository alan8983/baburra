# Tasks: Fix Gemini YouTube Transcription

## Implementation

- [x] **1.1** Remove `mime_type: 'video/youtube'` from the `file_data` object in `geminiTranscribeVideo()`
  - File: `src/infrastructure/api/gemini.client.ts` (line ~260-263)
  - Change `file_data: { mime_type: 'video/youtube', file_uri: youtubeUrl }` to `file_data: { file_uri: youtubeUrl }`

- [x] **1.2** Add `mediaResolution: 'low'` to `generationConfig` in `geminiTranscribeVideo()`
  - File: `src/infrastructure/api/gemini.client.ts` (line ~268-271)
  - Add `mediaResolution: 'low'` to the existing generationConfig object

- [x] **1.3** Increase `maxOutputTokens` from `8192` to `16384` in `geminiTranscribeVideo()`
  - File: `src/infrastructure/api/gemini.client.ts` (line ~270)

## Verification

- [x] **2.1** Run `npm run type-check` — no type errors
- [x] **2.2** Run existing tests — `npx vitest run` passes (4 pre-existing failures in profile-scrape-performance.test.ts, unrelated)
- [x] **2.3** Test with a real captionless YouTube video via the scrape flow (task 4.3 from `youtube-transcript-gemini`)
  - ✅ Verified: "fetch failed" error is FIXED — `9hE5-98ZeCg` completed in 15.5s (200 OK)
  - ✅ Verified: `vfCMtaNiMDM` also passed transcription (10.5s), hit downstream `flash-lite` 429 rate limit
  - ⏳ Credit consumption & transcript save could not be fully verified — `gemini-2.5-flash-lite` free-tier daily quota (20 req) exhausted, blocking the AI analysis step downstream
- [ ] **2.4** Test transcript cache (task 4.4 from `youtube-transcript-gemini`)
  - Blocked: requires a full end-to-end import to succeed first (needs `flash-lite` quota to reset)
