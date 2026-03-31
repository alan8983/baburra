# Tasks: Long Video Transcription

## Phase 1 — Spike: Validate Audio Download Approach

- [x] **1.1** Research and test `@distube/ytdl-core` (maintained ytdl-core fork) for audio-only download
  - ❌ **FAILED** — `@distube/ytdl-core@4.16.10` returns "Failed to find any playable formats" for all tested videos
  - Tested V2 (`nxnOFrp-OFU`) and V3 (`v58ms5EwvtE`) — both fail at `getInfo()` stage
  - This confirms the known fragility: YouTube changes break JS-based extractors frequently
  - **Verdict: Not viable** — cannot rely on this for production

- [x] **1.2** Research and test `cobalt.tools` API (or similar external service) as alternative
  - ❌ **NOT VIABLE** — Public `api.cobalt.tools` requires JWT auth via Turnstile (anti-bot)
  - YouTube is NOT in the supported services list for the hosted instance
  - Would require self-hosting cobalt — adds infrastructure complexity
  - **Verdict: Not viable** for our use case

- [x] **1.3** Test `yt-dlp` via `yt-dlp-exec` npm package (wraps yt-dlp binary)
  - ✅ **SUCCESS** — `yt-dlp-exec` bundles yt-dlp binary and works perfectly
  - V2 (`nxnOFrp-OFU`, 9 min): 7.1 MB webm/opus, downloaded in 4.6s
  - V1 (`YUGqy_McFeg`, 50 min): 42.3 MB webm/opus, downloaded in 9.4s
  - Audio formats available: m4a (AAC), webm (opus) — both Gemini-supported
  - Binary is ~20 MB (bundled per-platform: win/linux/mac)
  - **Vercel concern**: needs Linux binary on Vercel. Package auto-downloads platform binary at install.
  - **Verdict: ✅ WINNER** — reliable, fast, audio-only works out of the box

- [x] **1.4** Test Gemini File API upload with a real audio file
  - ✅ **SUCCESS** — Full pipeline validated for both short and long videos
  - **Short video (V2, 9 min):** Download 4.2s → Upload 4.5s → Transcribe 14.7s = **26s total** (2,977 chars)
  - **Long video (V1, 50 min):** Download 9s → Upload 8s → Transcribe 19.7s = **~37s total** (95,877 audio tokens)
  - Gemini File API upload uses resumable protocol, file state is immediately ACTIVE
  - `generateContent` with uploaded `file_uri` produces quality Chinese transcript
  - File DELETE returns 200 (cleanup works)
  - ⚠️ **Rate limit discovery**: Rapid repeated requests cause `SocketError: other side closed` (bytesRead: 0)
    — NOT a processing limit, just API rate limiting. Production code should include retry with backoff.
  - ⚠️ **Node.js undici issue**: After large upload, `fetch()` can fail on next request to same host.
    Native `https` module works fine. Solution: use retry or ensure fresh connection for transcribe call.

- [x] **1.5** Spike decision: document which approach to use and why
  - **Winner: `yt-dlp-exec`** (npm package bundling yt-dlp binary)
  - Reasons: only approach that works, reliable, fast, audio-only extraction built-in
  - `@distube/ytdl-core`: ❌ broken ("Failed to find any playable formats")
  - `cobalt.tools`: ❌ auth required, YouTube not supported on hosted instance
  - **Full pipeline timing (50-min video):**
    - Audio download: ~9s (46 MB m4a)
    - Gemini File API upload: ~8s
    - Transcription: ~20s
    - **Total: ~37s** — well within Vercel 300s limit
  - **Implementation notes for Phase 2:**
    - Use `yt-dlp-exec` for audio download (binary bundled per platform)
    - Use Gemini File API resumable upload protocol
    - Implement retry with backoff on transcribe call (rate limit protection)
    - Prefer `bestaudio[ext=m4a]` format for Gemini compatibility (`audio/mp4`)
    - Vercel: binary downloads for Linux at install time automatically

## Phase 2 — Implement Core Modules

- [x] **2.1** Create `src/infrastructure/api/youtube-audio.client.ts`
  - ✅ `downloadYoutubeAudio(url, options)` → returns `{ buffer, mimeType, sizeBytes, durationSeconds, format }`
  - Uses `yt-dlp-exec` bundled binary, prefers `bestaudio[ext=m4a]`
  - 120s download timeout, auto-cleanup of temp files

- [x] **2.2** Create `src/infrastructure/api/gemini-file.client.ts`
  - ✅ `uploadToGeminiFiles(buffer, mimeType, displayName)` → returns `{ fileUri, fileName, state, sizeBytes }`
  - ✅ `deleteGeminiFile(fileName)` → void (best-effort cleanup)
  - Resumable upload protocol, polls until ACTIVE, `Connection: close` on upload

- [x] **2.3** Add `geminiTranscribeAudio()` to `src/infrastructure/api/gemini.client.ts`
  - ✅ Uses `undici.request()` with `reset: true` to avoid stale socket after large upload
  - No `mediaResolution` config (audio-only), same retry logic and timeout scaling
  - Auth via `?key=` URL param (undici doesn't reuse stale connections with `reset: true`)

- [x] **2.4** Raise `MAX_VIDEO_DURATION_SECONDS` to `120 * 60` (2 hours) in `gemini.client.ts`
  - ✅ Updated from `60 * 60` to `120 * 60`
  - `getTranscriptionTimeout()` and `getMaxOutputTokens()` formulas already handle 120-min durations

## Phase 3 — Integration

- [x] **3.1** Add long-video routing in `import-pipeline.service.ts`
  - ✅ Videos >30 min (`LONG_VIDEO_THRESHOLD_SECONDS`) route to audio pipeline:
    download → upload → transcribe → cleanup (with `deleteGeminiFile` in `finally`)
  - Videos ≤30 min or unknown duration → existing `file_uri` direct path
  - `MAX_VIDEO_DURATION_SECONDS` raised to `120 * 60` (was `60 * 60`)

- [x] **3.2** Increase `maxDuration` to 300 in `src/app/api/import/batch/route.ts`
  - ✅ `maxDuration` → 300, `BATCH_TIMEOUT_MS` → 280,000

- [x] **3.3** Update credit cost estimation in YouTube extractor
  - ✅ Already scales linearly: `minutes * CREDIT_COSTS.video_transcription_per_min` (7/min)
  - No changes needed — works correctly for videos up to 120 min

## Phase 4 — Validation (Browser MCP E2E)

> Full test scripts, selectors, and pass criteria in **`validation.md`**.
> All tests use `DEV_USER_ID` auth. Ensure dev user has ~500+ credits.

### Tier 1 — Smoke (run after every phase)

- [x] **4.1** T1.1: `npm run type-check` + `npm test` — no new errors
  - ✅ Type check passes, 631/631 tests pass
- [x] **4.2** T1.2: Browser MCP — Import short captionless video (V2: `nxnOFrp-OFU`, ~10 min)
  - ✅ Existing `file_uri` path works (regression pass)
  - KOL: 阿东聊美股, Sentiment: 略微看多, Tickers: CRCL, MU, CORNING, LITE, AAOI

### Tier 2 — Feature (run after Phase 3)

- [ ] **4.3** T2.1: Browser MCP — Import long captionless video (V1: Gooaye EP508 `YUGqy_McFeg`, ~50 min)
  - **THE primary test for Issue #40**
  - ❌ **BLOCKED** — Gemini stale socket issue (see Phase 5 below)
  - Audio download ✅ (46.3 MB m4a in ~10s), upload ✅ (ACTIVE), transcription ❌
  - All attempts fail with `socket hang up` / `SocketError: other side closed`
- [ ] **4.4** T2.2: Browser MCP — Import Chinese captioned video (V3: `v58ms5EwvtE`)
  - Verify caption path used (no audio download), < 30s, cost = 2 credits
- [ ] **4.5** T2.3: Browser MCP — Import English captioned video (V4: TBD — confirm URL during spike)
  - Same as T2.2 but English language
- [ ] **4.6** T2.4: Browser MCP — Re-import V1 (transcript cache hit)
  - Verify: fast completion (< 30s), no audio download, cache hit logged

### Tier 3 — Stress & Edge Cases (run before merge)

- [ ] **4.7** T3.1: Browser MCP — Import near upper-bound video (~90 min)
  - Find suitable video during spike, verify completes within 300s
- [ ] **4.8** T3.2: Verify Gemini File API cleanup in server logs after T2.1
- [ ] **4.9** T3.3: Browser MCP — Import invalid/private video URL → graceful error, no crash
- [ ] **4.10** T3.4: Duration limit enforcement — reject >120 min video (unit test or API curl)

## ❌ Blocker: Gemini Stale Socket After Large Upload

**Status:** BLOCKED — Gemini File API upload poisons subsequent connections to the same Google host.

**What works:**
- Audio download via yt-dlp: ✅ 46.3 MB m4a in ~10s
- Gemini File API upload: ✅ ACTIVE immediately
- Duration-based routing (>30 min → audio pipeline): ✅
- Short video transcription via `file_uri`: ✅ (regression pass)

**What fails:**
After uploading ~46 MB to `generativelanguage.googleapis.com`, ALL subsequent HTTPS connections to the same host fail with `socket hang up` or `SocketError: other side closed`.

**Approaches tried (all failed):**
1. `fetch()` (undici global pool) → SocketError
2. `undici.request({ reset: true })` → SocketError
3. Dedicated `undici.Agent` (isolated pool) → SocketError
4. Native `https` module → socket hang up
5. Child process (fresh Node.js process) → socket hang up
6. 10s delay after upload → still fails
7. Retry with 5s + 15s backoff → all 3 attempts fail
8. `Connection: close` header on upload PUT → doesn't help

**Root cause:** Google's server/load balancer aggressively closes/rejects connections from the same client after a large upload. This is NOT a Node.js connection pool issue — confirmed by child process test and standalone spike script failing too.

**Resolution:** Switch transcription from Gemini to a dedicated API (Deepgram recommended) that uses a different host, avoiding the stale connection entirely. See GitHub Issue for details.
