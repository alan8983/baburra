## 1. Database and repository

- [ ] 1.1 Create migration `supabase/migrations/031_scrape_job_items.sql` that adds the `scrape_job_items` table (`id uuid pk`, `job_id uuid fk → scrape_jobs.id on delete cascade`, `url text not null`, `title text`, `ordinal int not null`, `stage text not null check in (queued, discovering, downloading, transcribing, analyzing, done, failed)`, `bytes_downloaded bigint`, `bytes_total bigint`, `duration_seconds int`, `error_message text`, `started_at timestamptz`, `finished_at timestamptz`, `updated_at timestamptz default now()`). Add unique index `(job_id, ordinal)` and btree index `(job_id)`.
- [ ] 1.2 Add RLS policies on `scrape_job_items`: `select` allowed when the parent `scrape_jobs.triggered_by = auth.uid()`; `insert/update` allowed for the service role only.
- [ ] 1.3 Run `supabase db push --dry-run` for human review, then apply.
- [ ] 1.4 Regenerate types: `supabase gen types typescript --linked --schema public > src/infrastructure/supabase/database.types.ts`.
- [ ] 1.5 Create `src/infrastructure/repositories/scrape-job-item.repository.ts` with: `createScrapeJobItems(jobId, urls): Promise<ScrapeJobItem[]>`, `updateScrapeJobItemStage(itemId, stage, meta?)`, `getScrapeJobItems(jobId): Promise<ScrapeJobItem[]>`, `failScrapeJobItem(itemId, errorMessage)`.
- [ ] 1.6 Add `ScrapeJobItem` domain model at `src/domain/models/scrape-job-item.ts` with the `ScrapeJobItemStage` union and type-level guarantees.
- [ ] 1.7 Unit tests for the repository (mock Supabase admin client): create, stage transitions, get by job id.

## 2. Audio download: low-bitrate preference + streaming

- [ ] 2.1 In `src/infrastructure/api/youtube-audio.client.ts`, replace the descending-bitrate sort with a filter + ascending sort: keep formats with `audioBitrate >= 32` and prefer `webm`/`opus` containers; fall back to `m4a`, then to whatever has the lowest bitrate above the floor.
- [ ] 2.2 Add `downloadYoutubeAudioStream(url, options): Promise<{ stream: Readable, mimeType, durationSeconds, bytesTotal? }>`. Does NOT buffer. `bytesTotal` is best-effort from ytdl-core format metadata (may be undefined).
- [ ] 2.3 Keep `downloadYoutubeAudio` (buffer variant) as a thin wrapper over the stream version, used by tests and any fallback path.
- [ ] 2.4 Unit test: format selection picks the lowest-bitrate Opus ≥ 32 kbps from a fixture list; falls back correctly when no Opus exists.

## 3. Deepgram client: streaming body support

- [ ] 3.1 Update `deepgramTranscribe` signature to accept `Buffer | Readable` as the body.
- [ ] 3.2 When the body is a `Readable`, convert via `ReadableStream.from(...)` (or the Node stream → web stream helper) and POST with `body: webStream, duplex: 'half'`.
- [ ] 3.3 Add env flag `DEEPGRAM_STREAMING_BODY` (default `true`). When `false`, silently drain the stream into a buffer first (safety fallback).
- [ ] 3.4 Unit test (using `undici` `MockAgent`): streaming body path sends a chunked request and parses the response identically to the buffer path.
- [ ] 3.5 Keep the existing retry logic unchanged — retries still apply; on retry after a streaming failure, fall back to buffer mode for that attempt (streams are single-use).

## 4. Pipeline concurrency semaphore

- [ ] 4.1 Add `YOUTUBE_SCRAPE_CONCURRENCY` to `.env.example` with a default of `3` and a comment explaining the memory trade-off.
- [ ] 4.2 In `src/domain/services/profile-scrape.service.ts`, delete the `effectiveBatchSize = 1` branch. Replace with a lightweight semaphore: process `remaining` URLs using a per-job `p-limit(concurrency)` (prefer a local ~10-line implementation over a new dep, unless `p-limit` is already present).
- [ ] 4.3 Clamp `concurrency` to `[1, 5]`. Default from env, overridable per-call for tests.
- [ ] 4.4 Update `src/domain/services/__tests__/profile-scrape-performance.test.ts` to assert that a 10-URL YouTube batch now runs with concurrency > 1.
- [ ] 4.5 Update the existing "one-at-a-time" inline comment (`profile-scrape.service.ts:338`) to describe the new bounded-concurrency behavior and cite `YOUTUBE_SCRAPE_CONCURRENCY`.

## 5. Stage callback threading

- [ ] 5.1 Define `Stage = 'queued' | 'discovering' | 'downloading' | 'transcribing' | 'analyzing' | 'done' | 'failed'` and `StageMeta = { bytesDownloaded?: number; bytesTotal?: number; durationSeconds?: number; errorMessage?: string }` in `src/domain/models/scrape-job-item.ts`.
- [ ] 5.2 Add optional `onStage?: (stage: Stage, meta?: StageMeta) => Promise<void>` to `processUrl` in `src/domain/services/import-pipeline.service.ts`.
- [ ] 5.3 Call `onStage` at each pipeline boundary: `discovering` → `downloading` (with `bytesTotal` when known) → `transcribing` → `analyzing` → `done` / `failed`.
- [ ] 5.4 During the streaming download, pipe through a counter transform that calls `onStage('downloading', { bytesDownloaded })` at ~1 MB increments (throttled; do not update on every chunk).
- [ ] 5.5 In `profile-scrape.service.processJobBatch`, wire the `onStage` closure to `updateScrapeJobItemStage(itemId, ...)`. Resolve the `itemId` at the start of each URL.
- [ ] 5.6 On failure, write `error_message` to the item row and mark stage `failed`; the parent job's aggregate counts still increment as today.
- [ ] 5.7 Unit tests: `processUrl` emits the expected stage sequence for a captioned URL, a captionless short, and a captionless long video.

## 6. API routes

- [ ] 6.1 Create `src/app/api/scrape/jobs/[id]/items/route.ts` — `GET` returns the array of `ScrapeJobItem` for the job. Enforces ownership identically to the existing job detail route.
- [ ] 6.2 Rewrite `src/app/api/import/batch/route.ts` as async: parse + validate the URLs, create a `scrape_jobs` row with `job_type = 'batch_import'`, insert `scrape_job_items` for each URL, fire-and-forget `POST /api/scrape/jobs/[id]/continue`, return `{ jobId }`. Delete the 280 s `Promise.race`.
- [ ] 6.3 Update `API_ROUTES` in `src/lib/constants/routes.ts` to add `SCRAPE_JOB_ITEMS(id)`.
- [ ] 6.4 Update `src/app/api/import/batch/route.ts` response type in any callers (search for `executeBatchImport` consumers and migrate to the new shape).
- [ ] 6.5 Ensure `scrape_jobs.job_type` supports the `batch_import` value — extend the existing check constraint if needed in a follow-up migration (or in 031 above).

## 7. Frontend hooks

- [ ] 7.1 Add `useScrapeJobItems(jobId)` hook in `src/hooks/use-scrape.ts`. Initial fetch via `GET /api/scrape/jobs/[id]/items`; subscribes to Supabase Realtime `postgres_changes` on `scrape_job_items` filtered by `job_id=eq.${jobId}`; applies `setQueryData` patches on insert/update.
- [ ] 7.2 Update `useScrapeJob` to subscribe to Realtime on `scrape_jobs` `UPDATE` for the viewed row. Drop the polling interval from 5 s to a 10 s fallback. Keep the fire-and-forget `/continue` trigger for cold loads.
- [ ] 7.3 Unsubscribe cleanly on unmount; share the channel between hooks if both are mounted for the same job.
- [ ] 7.4 Unit tests for the hooks (using React Query test utilities and a fake Supabase channel): initial hydration + patch application.

## 8. UI rewrite

- [ ] 8.1 Rewrite `src/components/scrape/scrape-progress.tsx` to render a per-URL checklist. Each row: title (or URL fallback), stage icon, stage label, inline progress bar. Bar is `bytes_downloaded / bytes_total` for the `downloading` stage, and stage-based (0/25/50/75/100) for other stages.
- [ ] 8.2 Keep the existing job-level summary card (counts, status badge, error message) at the top.
- [ ] 8.3 Replace the "frozen at 0 %" ETA with a stage-aware estimate: "about N minutes remaining" computed from completed items' average duration + remaining items' count.
- [ ] 8.4 Add translations for each new stage label in `src/messages/zh-TW/scrape.json` and `src/messages/en/scrape.json`.
- [ ] 8.5 Update `src/components/import/import-status-toast.tsx` and `src/app/(app)/input/page.tsx` to transition to the jobs-based progress flow for both batch import and profile scrape.

## 9. Tests and validation

- [ ] 9.1 `src/domain/services/__tests__/profile-scrape-performance.test.ts` — update expectations for concurrency > 1.
- [ ] 9.2 New `src/domain/services/__tests__/scrape-stage-callback.test.ts` — asserts the stage sequence emitted by `processUrl`.
- [ ] 9.3 New `src/infrastructure/api/__tests__/youtube-audio-format.test.ts` — asserts the low-bitrate preference and fallback chain.
- [ ] 9.4 Update `src/infrastructure/api/__tests__/deepgram.client.test.ts` to cover both `Buffer` and `Readable` body paths.
- [ ] 9.5 Run `npm run type-check` and `npm test` green.
- [ ] 9.6 Manual smoke: a 10-URL batch of long captionless podcasts shows progress updating within 2 s on every stage change. Wall-clock should be ≲ 6 min on a typical connection.
- [ ] 9.7 Manual smoke: `/api/import/batch` with 5 URLs returns within ~500 ms and the UI transitions straight to the per-URL progress view.

## 10. Specs and archive

- [ ] 10.1 Write `specs/scrape-progress/spec.md` with the new capability requirements.
- [ ] 10.2 Write `specs/ai-pipeline/spec.md` deltas for concurrency, streaming, and format preference.
- [ ] 10.3 Update `docs/WEB_DEV_PLAN.md` if this closes any listed friction item.
- [ ] 10.4 Update `docs/ARCHITECTURE.md` Realtime section (or add one) mentioning the new channel.
- [ ] 10.5 Archive with `/opsx:archive improve-scrape-progress-ux` after all tasks are complete and the smoke tests pass.
