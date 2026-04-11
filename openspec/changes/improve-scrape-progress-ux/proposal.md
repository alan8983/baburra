## Why

Users hit friction in two specific scraping scenarios:

1. **Scraping a large batch of URLs at once** (e.g. 10 videos selected from a profile)
2. **Scraping a single long post** (e.g. a 60-min Gooaye podcast episode)

Both get dramatically worse when combined: a batch of 10 long captionless YouTube videos currently takes **~20 minutes** wall-clock, during which the progress bar sits near 0% for minutes at a time. Users legitimately cannot tell whether the app is working or frozen.

An early hypothesis was "the transcription model is slow — let's try faster-whisper" (see note in design.md). After tracing the actual pipeline, **transcription is not the bottleneck**. The real friction comes from four interacting problems, none of which involve the speech-to-text model:

- **Serial YouTube processing.** `profile-scrape.service.ts` forces `effectiveBatchSize = 1` for any job containing YouTube URLs — a holdover from the pre-Deepgram Gemini era that no longer applies. A 10-long-video batch therefore runs strictly sequentially.
- **Oversized audio downloads.** `youtube-audio.client.ts` sorts candidate audio formats by bitrate **descending**, so it always picks the largest available Opus stream (~160 kbps). For speech transcription, 48–64 kbps is indistinguishable at Deepgram's ear; we're downloading and buffering 3× more bytes than needed on every video.
- **Download blocks transcription.** The downloader buffers the full audio into memory before POSTing to Deepgram. Download time and transcription time stack instead of overlapping.
- **Progress tracking has URL-level granularity only.** The UI shows `processedUrls / totalUrls`; for a 1-long-video job that's `0/1` for 3 minutes, then `1/1`. There's no sub-URL state (`downloading`, `transcribing`, `analyzing`), no per-URL percentage, and polling at 5 s adds another layer of perceived lag. `/api/import/batch` is even worse — it's fully synchronous with a 280 s timeout, returning nothing to the client until the whole batch completes.

This change targets all four, biased toward the "medium-effort" tier from the exploration — per-URL state machine with a Supabase Realtime push channel, because that's the single fix users will feel the most.

## What Changes

- **Lift the YouTube serial-processing block.** Replace the hardcoded `effectiveBatchSize = 1` branch with a configurable cap (default `3`). Long-video batches process concurrently subject to a `p-limit`-style semaphore that also bounds peak memory.
- **Flip the audio-format preference.** `youtube-audio.client.ts` selects the **lowest-bitrate** Opus/WebM format ≥ 32 kbps (instead of the highest). Fall back to `m4a` only if no Opus is available.
- **Stream audio from ytdl-core straight into the Deepgram POST.** Eliminate the intermediate `streamToBuffer` step so download and transcription overlap.
- **Add a per-URL state machine.** New `scrape_job_items` table: one row per URL in a job, with `stage` ∈ `queued | discovering | downloading | transcribing | analyzing | done | failed`, plus `bytes_downloaded`, `bytes_total`, `duration_seconds`, `error_message`, and `ordinal`. The import pipeline updates this row at every stage boundary.
- **Expose per-URL progress via a new API route.** `GET /api/scrape/jobs/[id]/items` returns the per-URL breakdown. The existing `GET /api/scrape/jobs/[id]` endpoint is unchanged for backwards compatibility.
- **Replace polling with Supabase Realtime.** `useScrapeJob` subscribes to `postgres_changes` on both `scrape_jobs` and `scrape_job_items` for the viewed job. Polling stays as a 10 s fallback in case the channel drops. The fire-and-forget `/continue` call stays where it is — still needed to drive work forward on cold page loads.
- **Redesign `scrape-progress.tsx` as a per-URL checklist.** Each row shows the URL's title, current stage, and an inline progress bar (for `downloading`, the bar is fed by `bytes_downloaded / bytes_total`; for the other stages it's indeterminate or stage-based). The existing job-level summary stays at the top.
- **Rewrite `/api/import/batch` as a queued job.** Instead of blocking for 280 s, the route creates a `scrape_jobs` row (or reuses an existing one), seeds `scrape_job_items`, kicks off `/continue`, and returns `{ jobId }`. The frontend flow transitions straight into the scrape-progress UI — unifying batch-import and profile-scrape UX.

## Capabilities

### New Capabilities

- **`scrape-progress`** — Per-URL state machine for scrape jobs, with a dedicated `scrape_job_items` table, a stage-aware API, a Supabase Realtime push channel, and a UI that surfaces sub-URL progress (download bytes, current stage).

### Modified Capabilities

- **`ai-pipeline`** — Long-video transcription gains bounded concurrency (default 3 parallel YouTube URLs per batch), streaming audio download→transcribe, and an explicit low-bitrate-first audio format preference. The existing single-vendor Deepgram path is unchanged.
- **`api-contracts`** — `POST /api/import/batch` becomes asynchronous, returning `{ jobId }` instead of per-URL results. A new `GET /api/scrape/jobs/[id]/items` endpoint is added.

## Impact

- **Domain services**:
  - `src/domain/services/profile-scrape.service.ts` — replace `effectiveBatchSize = 1` with a concurrency semaphore; emit per-URL stage updates at each pipeline boundary.
  - `src/domain/services/import-pipeline.service.ts` — accept an optional `onStage(stage, meta)` callback and thread it through the YouTube → download → transcribe → analyze path.
- **Infrastructure**:
  - `src/infrastructure/api/youtube-audio.client.ts` — flip format sort; expose a streaming variant that returns a `ReadableStream` instead of a `Buffer`.
  - `src/infrastructure/api/deepgram.client.ts` — accept a `ReadableStream` body and pass it through `fetch` with `duplex: 'half'`.
  - `src/infrastructure/repositories/scrape-job-item.repository.ts` — **new** repository for the new table.
- **API routes**:
  - `src/app/api/scrape/jobs/[id]/items/route.ts` — **new**.
  - `src/app/api/import/batch/route.ts` — rewritten as async job creation.
- **Hooks / UI**:
  - `src/hooks/use-scrape.ts` — Supabase Realtime subscription; new `useScrapeJobItems(jobId)` hook.
  - `src/components/scrape/scrape-progress.tsx` — per-URL checklist rendering.
  - `src/components/import/import-status-toast.tsx` — transition to use the job-based flow.
- **Database**:
  - New migration `031_scrape_job_items.sql` creating the `scrape_job_items` table with RLS (owner of `scrape_jobs.triggered_by` can select).
- **Tests**:
  - Unit tests for the concurrency semaphore and stage-callback threading.
  - Unit tests for low-bitrate format preference.
  - Integration tests for the new items endpoint (shape + RLS).
  - Existing `profile-scrape-performance.test.ts` expectations updated for the new concurrency behavior.
- **No vendor changes.** Deepgram remains the primary transcription vendor. The credit cost model is untouched.
- **Depends on nothing** — all existing services (`rework-credit-cost-lego`, `deepgram-keyword-boost`) continue to work unchanged.
