## Context

The `long-video-transcription` change built a working pipeline: yt-dlp audio download → Gemini File API upload → `geminiTranscribeAudio()`. Steps 1-2 work perfectly but step 3 fails due to a Google server-side stale socket bug (all HTTPS connections to `generativelanguage.googleapis.com` die after a large upload). This design replaces only the transcription step with Deepgram, keeping everything else intact.

Current pipeline on `claude/vibrant-keller`:

```
import-pipeline.service.ts
  │
  ├─ captioned video ──▶ youtube-transcript-plus (unchanged)
  ├─ short video (≤30m) ──▶ Gemini file_uri direct (unchanged)
  └─ long video (>30m) ──▶ yt-dlp → Gemini File API → geminiTranscribeAudio() ❌ BLOCKED
```

Scrape pipeline context: `profile-scrape.service.ts` processes YouTube URLs sequentially (`effectiveBatchSize=1`, `effectiveTimeout=650s`). Each URL goes through `processUrl()` → `import-pipeline.service.ts`. A single KOL scrape job may queue 10-50 YouTube URLs. The Gemini stale socket would poison all requests after the first long video in a job. Deepgram on a separate host eliminates this.

## Goals / Non-Goals

**Goals:**
- Unblock long-video (>30 min) captionless YouTube transcription
- Ensure scrape pipeline can reliably process multiple long videos in a single job
- Produce transcripts with timestamps and speaker diarization for richer LLM context
- Minimize file sizes via Opus audio format
- Clean-remove dead Gemini File API code

**Non-Goals:**
- Changing the short-video path (≤30 min Gemini `file_uri` works fine)
- Changing the captioned video path (`youtube-transcript-plus`)
- Evaluating Deepgram accuracy vs Gemini for this change (validation will check if Nova-2 is sufficient for Chinese Mandarin; model upgrade is a separate decision)
- Adding Deepgram as a general-purpose transcription service (scoped to long-video path only)

## Decisions

### D1: Deepgram Nova-2 model

**Choice:** `nova-2` at $0.0043/min

**Alternatives considered:**
- Nova-3 ($0.0059/min) — newer, better accuracy, but 37% more expensive. Unknown if the improvement matters for Chinese Mandarin KOL content.
- OpenAI Whisper API ($0.006/min) — 25 MB file limit requires chunking logic. More complex.
- Self-hosted Whisper — free, but requires GPU infra, can't run on Vercel.

**Rationale:** Start cheap, validate accuracy as part of this change. If Chinese Mandarin quality is insufficient, upgrading to Nova-3 is a one-line model string change.

### D2: Audio format — Opus in WebM container

**Choice:** Configure yt-dlp to prefer Opus/WebM (`-f ba[acodec=opus]` with m4a fallback)

**Rationale:**
- YouTube stores audio natively in Opus — no transcoding needed
- ~50% smaller than m4a (50-min file: ~20-25 MB vs ~46 MB)
- Deepgram supports `audio/webm` natively
- Smaller files = faster download, faster upload to Deepgram, less `/tmp` usage on Vercel

**Fallback:** If Opus isn't available (rare), fall back to best available audio (`-f ba`), typically m4a.

### D3: Transcript format — timestamps + diarization as structured text

**Choice:** Request `paragraphs=true`, `diarize=true`, `utterances=true` from Deepgram. Format the transcript as:

```
[Speaker 0, 00:01:23] 今天我們來聊聊台積電最近的表現...
[Speaker 0, 00:02:45] 我認為目前的估值已經反映了...
[Speaker 1, 00:03:30] 但是你看第四季的營收...
```

**Rationale:** This gives the downstream Gemini analysis richer context (who said what, when) without adding complexity. The LLM prompt for `analyzeDraftContent()` already handles free-form transcript text — timestamped speaker-labeled text is strictly more informative. If it causes issues during validation, we can strip it down to plain text.

### D4: Clean delete `gemini-file.client.ts`

**Choice:** Delete entirely, don't keep as fallback.

**Rationale:** The stale socket bug is a Google server-side issue with no workaround found after exhaustive testing (6+ approaches including separate processes). Keeping dead code creates confusion. If Google fixes the bug in the future, restoring from git history is trivial.

### D5: Single `fetch()` POST — no SDK dependency

**Choice:** Call Deepgram REST API directly via `fetch()`. No `@deepgram/sdk` package.

**Rationale:**
- One function, one HTTP call — the Deepgram pre-recorded API is `POST /v1/listen` with audio body
- Avoids adding a dependency for a single endpoint
- Consistent with existing pattern (Tiingo client uses raw `fetch()` too)

### D6: Architecture for scrape pipeline compatibility

**Choice:** No architectural changes to scrape pipeline. The existing sequential processing (`effectiveBatchSize=1`) naturally works with Deepgram because:
1. Each `processUrl()` call is independent — downloads audio, POSTs to Deepgram, gets transcript
2. Deepgram is a different host from Gemini — no cross-request socket poisoning
3. The 650s `effectiveTimeout` per job batch is sufficient (yt-dlp download ~10s + Deepgram transcription ~30-60s per video)
4. After Deepgram returns the transcript, the Gemini `analyzeDraftContent()` call is a normal-sized request (just text, no large upload) — no socket issue

```
Scrape job with 5 long YouTube videos:
  URL1 → yt-dlp (10s) → Deepgram (40s) → Gemini analysis (15s) ✅
  URL2 → yt-dlp (10s) → Deepgram (40s) → Gemini analysis (15s) ✅
  URL3 → yt-dlp (10s) → Deepgram (40s) → Gemini analysis (15s) ✅
  ...sequential, each independent, no shared socket state
```

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| Deepgram Nova-2 Mandarin accuracy insufficient | Transcript quality too low for meaningful sentiment analysis | Validation test T2.1 checks this explicitly. Fallback: upgrade to Nova-3 (one-line change) |
| Deepgram API downtime | Long-video imports fail | Graceful error handling with clear message. Short videos and captioned videos unaffected (different paths) |
| yt-dlp Opus format not available for some videos | Download fails or falls back to larger format | Fallback to `ba` (best audio any format). Deepgram accepts m4a, mp3, wav too |
| Deepgram rate limits under heavy scraping | Scrape job stalls mid-batch | Sequential processing (1 video at a time) naturally stays within limits. Deepgram's rate limits are generous for pre-recorded audio |
| Transcript with timestamps/diarization confuses LLM analysis | Gemini misinterprets speaker labels as content | Validation checks analysis quality. Easy to strip formatting if needed |
| `/tmp` disk pressure on Vercel during scrape jobs | Multiple audio files accumulate | Audio buffer is deleted immediately after Deepgram POST completes. Sequential processing means only one file in `/tmp` at a time |
