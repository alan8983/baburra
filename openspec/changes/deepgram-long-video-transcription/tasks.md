## 1. Environment & Cleanup

- [x] 1.1 Add `DEEPGRAM_API_KEY` to `.env.example` with description comment
- [x] 1.2 Add `DEEPGRAM_API_KEY` to `.env.local` in the vibrant-keller worktree
- [x] 1.3 Delete `src/infrastructure/api/gemini-file.client.ts`
- [x] 1.4 Remove `geminiTranscribeAudio()` function from `src/infrastructure/api/gemini.client.ts`
- [x] 1.5 Remove all imports of `gemini-file.client.ts` and `geminiTranscribeAudio` from `import-pipeline.service.ts`

## 2. Deepgram Client

- [x] 2.1 Create `src/infrastructure/api/deepgram.client.ts` with `deepgramTranscribe(buffer, mimeType)` function
- [x] 2.2 Implement Deepgram REST API call: `POST /v1/listen` with query params `model=nova-2`, `detect_language=true`, `smart_format=true`, `paragraphs=true`, `diarize=true`, `utterances=true`
- [x] 2.3 Implement transcript formatting: parse utterances into `[Speaker N, HH:MM:SS] text` lines
- [x] 2.4 Add 180s request timeout via `AbortController`
- [x] 2.5 Add error handling: missing API key, HTTP errors, timeout

## 3. Audio Format Update

- [x] 3.1 Update `youtube-audio.client.ts` to prefer Opus/WebM format (`-f ba[acodec=opus]` with fallback to `-f ba`)
- [x] 3.2 Update MIME type handling to support `audio/webm` alongside existing `audio/mp4`

## 4. Pipeline Integration

- [x] 4.1 Update `import-pipeline.service.ts` long-video path: replace Gemini File API upload+transcribe with yt-dlp download → `deepgramTranscribe()`
- [x] 4.2 Update log messages to reflect Deepgram (e.g., `[Deepgram] Transcribing audio...`)
- [x] 4.3 Remove `/tmp` cleanup for Gemini-uploaded files (no longer needed — only local audio buffer cleanup remains)
- [x] 4.4 Verify `import-pipeline.service.ts` compiles with no dead imports

## 5. Type Check & Unit Tests

- [x] 5.1 Run `npm run type-check` — fix any compilation errors from removed code
- [x] 5.2 Run `npm test` — fix any broken tests referencing removed functions
- [x] 5.3 Add unit test for `deepgramTranscribe()` transcript formatting (mock Deepgram response → verify `[Speaker N, HH:MM:SS]` output format)

## 6. E2E Validation (Preview/Dev Browser MCP)

- [x] 6.1 Start dev server and verify it boots without errors
- [x] 6.2 **T1.2** — Import short captionless video (V2: `nxnOFrp-OFU`, ~10 min) → duplicate (previously imported), no errors
- [x] 6.3 **T2.1** — Import long captionless video (V1: `YUGqy_McFeg`, ~50 min Mandarin) → Deepgram transcription succeeded (397 utterances, 68s total), sentiment=bullish, tickers=2330.TW/GOOGL/AMZN/NVDA/TSLA/SPY
- [x] 6.4 **T2.2** — Import Chinese captioned video (V3: `v58ms5EwvtE`) → caption path used correctly, no Deepgram call, tickers=SPY/QQQ/USO/GLD/TLT/2330.TW/SMH
- [x] 6.5 **T2.4** — Re-import V1 → duplicate detected instantly, no Deepgram call
- [x] 6.6 **T3.3** — Import invalid video URL → graceful error "Failed to fetch YouTube content after 3 attempts", no crash
- [x] 6.7 Deepgram Mandarin transcript quality: 26,974 chars, coherent Chinese text with [Speaker N, HH:MM:SS] format, Gemini extracted valid tickers and sentiment
- [x] 6.8 Scrape pipeline compatibility: `effectiveBatchSize=1` sequential processing confirmed, each processUrl() independent, Deepgram on separate host — no shared socket state
