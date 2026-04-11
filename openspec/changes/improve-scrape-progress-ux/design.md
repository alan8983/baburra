## Context

### How we got here — faster-whisper note

This change started as an exploration of **faster-whisper / WhisperX** as a potential transcription replacement, on the theory that chunking long videos and transcribing chunks in parallel would cut wall-clock time. Tracing the current pipeline changed the picture entirely:

- A 60-min captionless podcast spends most of its wall-clock in **serial** pipeline stages that have nothing to do with the STT model: audio download (~30 s), over-sized buffer handling, and a per-job `effectiveBatchSize = 1` constraint for YouTube URLs.
- Deepgram Nova-3 (current primary vendor) transcribes pre-recorded audio at well over real-time and returns results in a single REST call. It is **not** the bottleneck.
- The user-reported pain — "feels frozen on big batches / long videos" — correlates with URL-level progress granularity and 5-second polling far more than with raw compute.

We did not need to swap vendors. We found a different, smaller solution by fixing the pipeline around the existing Deepgram path. Faster-whisper stays on the shelf as a future lever if per-minute cost or fine-tune quality ever becomes a constraint; it is explicitly **not** part of this change.

### Current-state summary (relevant files)

- `src/domain/services/profile-scrape.service.ts:342` — hard-codes `effectiveBatchSize = 1` for any job touching YouTube.
- `src/infrastructure/api/youtube-audio.client.ts:54` — sorts audio formats by bitrate descending; `streamToBuffer()` collects the entire audio into memory before returning.
- `src/infrastructure/api/deepgram.client.ts` — accepts a `Buffer`, posts in a single shot; no streaming body support.
- `src/components/scrape/scrape-progress.tsx:48` — reads `processedUrls / totalUrls`; ETA divides by `processed`, so a single-long-video job shows `NaN` / 0 % for minutes.
- `src/hooks/use-scrape.ts:127` — React Query `refetchInterval: 5000`; fires a fire-and-forget `/continue` from inside the query function (line 118).
- `src/app/api/import/batch/route.ts:39` — synchronous `Promise.race` with a 280 s timeout; returns nothing until the whole batch finishes.

## Goals / Non-Goals

**Goals:**

- Cut wall-clock on a 10-long-video batch from ~20 min to ~5 min using only pipeline-level changes (no new transcription vendor).
- Eliminate the "progress bar frozen at 0 %" experience. Users should always see *something* moving within 2 seconds.
- Unify `/api/import/batch` and profile-scrape behind one progress UX.
- Keep all existing credit costs, vendor selection, and retry semantics unchanged.

**Non-Goals:**

- Switching transcription vendors. Deepgram stays primary.
- Running faster-whisper / WhisperX anywhere. Documented above — different problem.
- Changing the download backend (keep `@distube/ytdl-core`; swapping to `yt-dlp-exec` is its own change if and when needed).
- Cross-chunk speaker-diarization stitching (we are not chunking; this stays as a "future lever" paragraph in the exploration notes).
- Any change to the AI analysis stage (Gemini) — unaffected.

## Decisions

### D1: Per-URL state machine lives in a new `scrape_job_items` table

**Decision:** One row per URL per scrape job. Stage enum: `queued | discovering | downloading | transcribing | analyzing | done | failed`. Rows carry download-byte progress, final duration, and error message. Indexed on `(job_id, ordinal)`.

**Alternatives considered:**

- **JSONB column on `scrape_jobs`.** Rejected — high write contention on the parent row, painful to query from Realtime filters, and painful to RLS.
- **Redis / ephemeral store.** Rejected — adds infra and loses history after the job finishes; we want to keep the per-URL outcome durable for debugging.

**Rationale:** A dedicated table gives us cheap Supabase Realtime filters (`filter: 'job_id=eq.<id>'`), a clean RLS policy (inherits ownership from the parent job via a `using` clause), and per-URL history that survives job completion.

### D2: Realtime push for job/item changes; polling is a 10 s fallback

**Decision:** `useScrapeJob` subscribes to `postgres_changes` on both `scrape_jobs` (UPDATE for the viewed row) and `scrape_job_items` (all events for rows with the viewed `job_id`). React Query gets `setQueryData` patches as events arrive. Polling stays on at `refetchInterval: 10_000` only while the job is active, as a resilience fallback if the channel drops.

**Alternatives considered:**

- **Pure polling at 1.5 s.** Works, but 1.5 s × (N open tabs) × (N active jobs) is a lot of GET traffic, and it still *feels* laggy on the first half-second after a stage change.
- **Server-Sent Events endpoint.** Would work, but Supabase Realtime is already in the stack with no new infra. No reason to add a second transport.

**Rationale:** Realtime gives sub-second push updates with zero new infrastructure; the 10 s poll is cheap insurance.

### D3: Concurrency is a bounded semaphore, default 3, env-overridable

**Decision:** Remove the hardcoded YouTube branch. Instead, `processJobBatch` uses a `p-limit`-style semaphore with `YOUTUBE_SCRAPE_CONCURRENCY` (default `3`). Non-YouTube URLs keep their existing batch size. The semaphore is per-job, not global.

**Alternatives considered:**

- **Unbounded `Promise.all`.** Rejected — would spike memory and risk Vercel function OOM when running 10 × 50 MB buffers at once. (Still a risk even with D4 below; the semaphore is the actual safeguard.)
- **Per-user global limit.** Overkill — we only have a handful of concurrent users and YouTube's per-IP rate limit is the natural governor.

**Rationale:** 3 concurrent URLs is empirically safe on Vercel's default 1 GB function memory after D4 streaming lands (3 × ~8 MB peak streaming buffer ≈ 24 MB). An env var lets us tune per environment without a deploy.

### D4: Streaming download → Deepgram, no intermediate buffer

**Decision:** Add a `downloadYoutubeAudioStream()` variant that returns `{ stream: ReadableStream, mimeType, durationSeconds }` instead of a buffer. Update `deepgramTranscribe()` to accept either a `Buffer` (current API, kept for tests) or a `ReadableStream`. When streaming, the Deepgram POST uses `body: stream` with `duplex: 'half'` so Node's `fetch` emits bytes as they arrive.

**Alternatives considered:**

- **Chunked audio + parallel Deepgram POSTs.** Same idea as faster-whisper chunking. Rejected for this change — diarization would re-number speakers per chunk, and our timestamp formatting depends on stable ordering. Park as a future optimization if single-stream streaming still isn't fast enough.
- **Keep the buffer, just overlap with `Promise.all([download, noop])`.** Doesn't help — the buffer is produced all-at-once.

**Rationale:** Streaming is the lowest-risk way to overlap download and transcribe time on a single long video. We keep diarization correctness because a single Deepgram request sees the whole audio, just over a longer body transfer.

### D5: Audio format preference flips to lowest-viable bitrate

**Decision:** `youtube-audio.client.ts` selects Opus/WebM formats with bitrate ≥ 32 kbps, preferring the **lowest** matching option. If no Opus is available, fall back to `m4a`. The current highest-bitrate sort is deleted.

**Alternatives considered:**

- **Keep highest-bitrate but transcode to 48 kbps locally.** Requires bundling ffmpeg. Out of scope.
- **Use `audioQuality=AUDIO_QUALITY_LOW` from the ytdl-core itag mapping.** Equivalent, but format filtering is clearer and covers edge cases where `audioBitrate` is missing.

**Rationale:** Deepgram's Nova-3 transcribes 48 kbps Opus indistinguishably from 160 kbps for speech, per their own docs. Lower bitrate means less bandwidth, less memory, and faster time-to-first-byte — a compounding win across the pipeline.

### D6: `/api/import/batch` becomes async, reusing the scrape-jobs machinery

**Decision:** The route creates a scrape job with `job_type = 'batch_import'`, seeds `scrape_job_items` for each user-supplied URL, calls `/api/scrape/jobs/[id]/continue` (fire-and-forget), and returns `{ jobId }` within ~200 ms. The frontend navigates to the same `ScrapeProgress` component used for profile scrapes. The 280 s `Promise.race` is deleted.

**Alternatives considered:**

- **Keep the sync endpoint, just add a progress channel.** Adds two code paths doing the same thing. Rejected.
- **New dedicated `batch_import_jobs` table.** Duplicates `scrape_jobs`. Rejected — adding a `job_type` enum is cleaner.

**Rationale:** One unified job flow; batch import automatically inherits every progress improvement from this change.

### D7: Stage transitions are emitted via a callback, not a service-layer import

**Decision:** `import-pipeline.service.processUrl()` gains an optional `onStage?: (stage: Stage, meta?: StageMeta) => Promise<void>` parameter. The caller in `profile-scrape.service.processJobBatch` supplies a closure that writes to `scrape_job_items`. Unit tests can pass a noop.

**Rationale:** Keeps `import-pipeline.service` free of direct repository dependencies for the new table. Mirrors how the existing code already threads cost hooks.

## Data Flow

```
┌─────────────┐
│ user clicks │  POST /api/import/batch  or  POST /api/scrape/profile
│  "Scrape"   │
└──────┬──────┘
       │
       ▼
┌──────────────────────────────────┐
│ API route                        │
│  - create scrape_jobs row        │
│  - seed scrape_job_items rows    │
│  - fire-and-forget /continue     │
│  - return { jobId }              │
└──────┬───────────────────────────┘
       │                              ← instant (~200 ms)
       ▼
┌──────────────────────────────────┐
│ /api/scrape/jobs/[id]/continue   │
│ processJobBatch(jobId, {         │
│   concurrency: 3                 │
│ })                               │
└──────┬───────────────────────────┘
       │
       ▼  (semaphore, up to 3 in flight)
┌──────────────────────────────────┐
│ processUrl(url, onStage)         │
│  1. onStage('discovering')       │
│  2. onStage('downloading',       │
│     { bytes_total })             │
│     stream = downloadAudioStream │
│  3. onStage('transcribing')      │
│     deepgramTranscribe(stream)   │ ← stream body, duplex: half
│  4. onStage('analyzing')         │
│     geminiAnalyze(text)          │
│  5. onStage('done')              │
└──────┬───────────────────────────┘
       │ every onStage() call →
       ▼
┌──────────────────────────────────┐
│ UPDATE scrape_job_items          │
│   SET stage = ?,                 │
│       bytes_downloaded = ?       │
│  WHERE id = ?                    │
└──────┬───────────────────────────┘
       │ postgres_changes event
       ▼
┌──────────────────────────────────┐
│ Supabase Realtime channel         │
│  scrape-job-<jobId>              │
└──────┬───────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│ useScrapeJob / useScrapeJobItems │
│  setQueryData(patch)             │
└──────┬───────────────────────────┘
       ▼
┌──────────────────────────────────┐
│ <ScrapeProgress /> re-renders    │
│   [1/5] Title  ✓ discover        │
│          ▣▣▣░░ downloading 42%   │
│          ○ transcribe            │
│          ○ analyze               │
└──────────────────────────────────┘
```

## Risks / Trade-offs

**[Risk] Realtime subscription race on cold load.** If the UI subscribes after the first stage has already fired, it misses that event. Mitigation: on subscription, do an initial `GET /api/scrape/jobs/[id]/items` to hydrate state, then apply subsequent patches. React Query handles this naturally with `initialData` + deltas.

**[Risk] Concurrent YouTube scraping triggers rate limits.** YouTube is aggressive about per-IP throttling on audio-format endpoints. Mitigation: default concurrency of 3, exponential backoff on `429`/`403` inside `downloadYoutubeAudio`, and a per-job fail-open — one URL's rate-limit error doesn't fail the whole job.

**[Risk] Vercel function memory with 3× streaming buffers.** Each in-flight stream peaks at maybe 8 MB (ytdl-core internal + Deepgram fetch body chunk). 3 × 8 MB ≈ 24 MB is well under the 1 GB limit, but worth watching. Mitigation: `YOUTUBE_SCRAPE_CONCURRENCY` env var lets us drop to 2 or 1 without a deploy if we see OOMs.

**[Risk] Streaming body support in Node `fetch`.** Node 18+ supports `duplex: 'half'`, but some combinations of runtime version and polyfill have quirks. Mitigation: feature-flag `DEEPGRAM_STREAMING_BODY=true` (default `true`); fall back to the existing buffer path on failure, logged as a warning.

**[Trade-off] `scrape_job_items` roughly doubles the row count on the scrape tables.** For a system with a handful of KOLs and ~10 URLs per job, this is negligible (tens of thousands of rows after a year). No storage concern.

**[Trade-off] The Realtime channel has a small per-connection cost on Supabase.** At our current scale this is free; if we hit free-tier limits later, we throttle to 1 channel per open scrape page.

**[Trade-off] The `/api/import/batch` rewrite is a breaking API change** for any caller that relies on the old `{ results: [...] }` shape. Mitigation: the only caller is `use-upload.ts` in our own frontend; updated in the same PR.

## Migration Plan

1. Migration `031_scrape_job_items.sql` creates the table and RLS policies. **Backfill** is not required — existing completed jobs have no items, and the API hides the items list when empty (falls back to the legacy `processedUrls / totalUrls` display).
2. Ship pipeline changes (D3, D4, D5) first, gated by `YOUTUBE_SCRAPE_CONCURRENCY` env var. These are safe in isolation — even without the UI work they cut wall-clock for existing users.
3. Ship the items repository + API route + stage callbacks (D1, D7). `scrape_job_items` rows start being populated.
4. Ship the Realtime subscription + UI rewrite (D2, D6). User-visible phase.
5. Delete the legacy synchronous `/api/import/batch` body after we confirm all callers use the new job path.

No rollback plan for the DB migration — the table is additive and safe to leave in place if we revert the code.
