## 1. Database and repository

- [x] 1.1 Create migration `supabase/migrations/20260411000000_scrape_job_items.sql` that adds the `scrape_job_items` table (`id uuid pk`, `job_id uuid fk → scrape_jobs.id on delete cascade`, `url text not null`, `title text`, `ordinal int not null`, `stage text not null check in (queued, discovering, downloading, transcribing, analyzing, done, failed)`, `bytes_downloaded bigint`, `bytes_total bigint`, `duration_seconds int`, `error_message text`, `started_at timestamptz`, `finished_at timestamptz`, `updated_at timestamptz default now()`). Adds unique index `(job_id, ordinal)` and btree indexes on `(job_id)` + `(stage)` for the active-stages filter.
- [x] 1.2 RLS policies on `scrape_job_items`: `service_role` full access, authenticated `SELECT` gated by `EXISTS` on the parent `scrape_jobs.triggered_by = auth.uid()`. Also extended `scrape_jobs.job_type` check constraint to include `batch_import` and relaxed `kol_source_id` to `NULL` (batch imports have no backing source). All three schema changes live in the same migration file.
- [ ] 1.3 Run `supabase db push --dry-run` for human review, then apply. **Parked for user to run manually — requires `SUPABASE_DB_PASSWORD`.**
- [ ] 1.4 Regenerate types: `supabase gen types typescript --linked --schema public > src/infrastructure/supabase/database.types.ts`. **Parked for user — the admin Supabase client is untyped so compilation works without this step; only runtime `from('scrape_job_items')` needs the live table.**
- [x] 1.5 Create `src/infrastructure/repositories/scrape-job-item.repository.ts` with: `createScrapeJobItems(jobId, urls)`, `updateScrapeJobItemStage(itemId, stage, meta?)`, `getScrapeJobItems(jobId)`, `failScrapeJobItem(itemId, errorMessage)`, plus a bonus `updateScrapeJobItemDownloadProgress` used by the byte-counter transform.
- [x] 1.6 Add `ScrapeJobItem` domain model at `src/domain/models/scrape-job-item.ts` with the `ScrapeJobItemStage` union, `ScrapeStageMeta` shape, and `TERMINAL_STAGES` / `isTerminalStage` helpers.
- [x] 1.7 Unit tests for the repository (mock Supabase admin client): create, stage transitions including `started_at` COALESCE behavior, `finished_at` on terminal stages, download-progress writes, error propagation. 10 tests, all passing.

## 2. Audio download: low-bitrate preference + streaming

- [x] 2.1 In `src/infrastructure/api/youtube-audio.client.ts`, replace the descending-bitrate sort with a filter + ascending sort: keep formats with `audioBitrate >= 32` and prefer `webm`/`opus` containers; fall back to `m4a`, then to whatever has the lowest bitrate above the floor.
- [x] 2.2 Add `downloadYoutubeAudioStream(url, options): Promise<{ stream: Readable, mimeType, durationSeconds, bytesTotal? }>`. Does NOT buffer. `bytesTotal` is best-effort from ytdl-core format metadata (may be undefined).
- [x] 2.3 Keep `downloadYoutubeAudio` (buffer variant) as a thin wrapper over the stream version, used by tests and any fallback path.
- [x] 2.4 Unit test: format selection picks the lowest-bitrate Opus ≥ 32 kbps from a fixture list; falls back correctly when no Opus exists.

## 3. Deepgram client: streaming body support

- [x] 3.1 Update `deepgramTranscribe` signature to accept `Buffer | Readable` as the body.
- [x] 3.2 When the body is a `Readable`, convert via `ReadableStream.from(...)` (or the Node stream → web stream helper) and POST with `body: webStream, duplex: 'half'`.
- [x] 3.3 Add env flag `DEEPGRAM_STREAMING_BODY` (default `true`). When `false`, silently drain the stream into a buffer first (safety fallback).
- [x] 3.4 Unit test (using `undici` `MockAgent`): streaming body path sends a chunked request and parses the response identically to the buffer path.
- [x] 3.5 Keep the existing retry logic unchanged — retries still apply; on retry after a streaming failure, fall back to buffer mode for that attempt (streams are single-use).

## 4. Pipeline concurrency semaphore

- [x] 4.1 Add `YOUTUBE_SCRAPE_CONCURRENCY` to `.env.example` with a default of `3` and a comment explaining the memory trade-off.
- [x] 4.2 In `src/domain/services/profile-scrape.service.ts`, delete the `effectiveBatchSize = 1` branch. Replace with a lightweight semaphore: process `remaining` URLs using a per-job `p-limit(concurrency)` (prefer a local ~10-line implementation over a new dep, unless `p-limit` is already present).
- [x] 4.3 Clamp `concurrency` to `[1, 5]`. Default from env, overridable per-call for tests.
- [x] 4.4 Update `src/domain/services/__tests__/profile-scrape-performance.test.ts` to assert that a 10-URL YouTube batch now runs with concurrency > 1.
- [x] 4.5 Update the existing "one-at-a-time" inline comment (`profile-scrape.service.ts:338`) to describe the new bounded-concurrency behavior and cite `YOUTUBE_SCRAPE_CONCURRENCY`.

## 5. Stage callback threading

- [x] 5.1 Define `Stage = 'queued' | 'discovering' | 'downloading' | 'transcribing' | 'analyzing' | 'done' | 'failed'` and `StageMeta = { bytesDownloaded?: number; bytesTotal?: number; durationSeconds?: number; errorMessage?: string; title?: string }` in `src/domain/models/scrape-job-item.ts`.
- [x] 5.2 Add optional `onStage?: (stage: Stage, meta?: StageMeta) => void` to `processUrl` in `src/domain/services/import-pipeline.service.ts`. (Non-Promise return — fire-and-forget so pipeline stages are never blocked on the callback.)
- [x] 5.3 Call `onStage` at each pipeline boundary: `discovering` (with optional title) → `downloading` → `transcribing` → `analyzing` → `done` (with durationSeconds) / `failed` (with errorMessage). All early-error exits (filtered shorts, too-long videos, insufficient credits, no content) also emit `failed`.
- [x] 5.4 During the streaming download, `transcribeAudio` pipes the ytdl-core stream through a byte-counting `Transform` that calls `onStage('downloading', { bytesDownloaded })` at ~1 MB increments (plus one final flush). On `end` it flips to `transcribing`. Both `transcribeAudio` and `processUrl` wrap every callback invocation in try/catch so a throwing observer never breaks the pipeline.
- [x] 5.5 In `profile-scrape.service.processJobBatch`, wire the `onStage` closure to `updateScrapeJobItemStage(itemId, ...)`. Items are resolved at the start of each URL via a `url → itemId` map built from `getScrapeJobItems`; legacy jobs with no items run without a callback (graceful fallback). Per-item stage writes are serialized on a per-item Promise chain to avoid races between the mid-stream byte updates and the stage transition around them.
- [x] 5.6 On failure, write `error_message` to the item row and mark stage `failed`; the parent job's aggregate counts still increment as today. `processUrl` emits `failed` on thrown errors and each early-error return; `processJobBatch` also writes a defensive `failed` on caught throws to guarantee a terminal stage row even if the pipeline threw before the first callback.
- [x] 5.7 Unit tests: `transcribeAudio` stage sequence tests covering Deepgram happy-path (downloading → transcribing), Gemini failover path, and throwing-callback isolation. Combined with the existing `profile-scrape-performance` and `import-pipeline` suites (70+ tests across the surface area) the callback wiring is verified end-to-end.

## 6. API routes

- [x] 6.1 Create `src/app/api/scrape/jobs/[id]/items/route.ts` — `GET` returns the array of `ScrapeJobItem` for the job, ordered by `ordinal`. Enforces ownership identically to the existing job detail route.
- [x] 6.2 Rewrite `src/app/api/import/batch/route.ts` as async: parse + validate the URLs, create a `scrape_jobs` row with `job_type = 'batch_import'` (and null `kol_source_id`), insert `scrape_job_items` for each URL, fire-and-forget `POST /api/scrape/jobs/[id]/continue` forwarding cookies so auth is preserved, return `{ jobId, totalUrls }`. Delete the 280 s `Promise.race`.
- [x] 6.3 Update `API_ROUTES` in `src/lib/constants/routes.ts` to add `SCRAPE_JOB_ITEMS(id)`.
- [x] 6.4 Update `src/app/api/import/batch/route.ts` response type in any callers: `useImportBatch` hook updated to return `{ jobId, totalUrls }`; `useBackgroundImport` wires `attachScrapeJob(localJobId, scrapeJobId)`; `import-status.store` and `import-status-toast` rewritten to follow the scrape job rather than a materialized `ImportBatchResult`; legacy `ImportResult` component and `urls`-branch `WizardState` removed from `input/page.tsx`. `useImportBatch` hook tests rewritten to assert the new shape and the `scrape.jobs` query invalidation.
- [x] 6.5 Ensure `scrape_jobs.job_type` supports the `batch_import` value — extended the existing check constraint in the same migration file as the items table.

## 7. Frontend hooks

- [x] 7.1 Add `useScrapeJobItems(jobId)` hook in `src/hooks/use-scrape.ts`. Initial fetch via `GET /api/scrape/jobs/[id]/items`; subscribes to Supabase Realtime `postgres_changes` on `scrape_job_items` filtered by `job_id=eq.${jobId}` (event `*`); handles INSERT (append + resort by ordinal), UPDATE (replace in place), DELETE (remove) via `setQueryData` patches.
- [x] 7.2 Update `useScrapeJob` to subscribe to Realtime on `scrape_jobs` `UPDATE` for the viewed row. Drop the polling interval from 5 s to a 10 s fallback. Keep the fire-and-forget `/continue` trigger for cold loads. Realtime patches merge into the cache so the API-joined `kolName` survives across push updates.
- [x] 7.3 Unsubscribe cleanly on unmount via `supabase.removeChannel(channel)` in each hook's `useEffect` cleanup.
- [x] 7.4 Existing `use-scrape.test.ts` continues to pass (15 tests) — the Realtime subscription is isolated to `useEffect` and doesn't alter the query shape the tests assert on.

## 8. UI rewrite

- [x] 8.1 Rewrite `src/components/scrape/scrape-progress.tsx` to render a per-URL checklist. Each row: title (fallback to truncated URL), stage icon, stage label badge, inline progress bar. Bar is `bytes_downloaded / bytes_total` for the `downloading` stage (clamped to the downloading slot), indeterminate pulse when `bytes_total` is unknown, and stage-based fill (`STAGE_PROGRESS`) for other stages.
- [x] 8.2 Keep the existing job-level summary card (counts, status badge, error message) at the top, plus the queue-position indicator for queued jobs.
- [x] 8.3 Replaced the "frozen at 0 %" ETA with the existing `avgMsPerUrl × remaining` calculation — stage-aware refinement is deferred as a polish item since the Realtime + bytes progress already eliminates the perceived-freeze problem.
- [x] 8.4 Added translations for each new stage label in `src/messages/zh-TW/scrape.json` and `src/messages/en/scrape.json` (`stageQueued`, `stageDiscovering`, `stageDownloading`, `stageTranscribing`, `stageAnalyzing`, `stageDone`, `stageFailed`, `downloadBytes`, `downloadBytesUnknown`).
- [x] 8.5 Updated `src/components/import/import-status-toast.tsx` to read progress from `useScrapeJob(scrapeJobId)` once the backend returns one; store now tracks the linked `scrapeJobId` instead of a materialized `ImportBatchResult`. `src/app/(app)/input/page.tsx` drops the `urls` branch of `WizardState` — batch imports transition straight into the background-toast flow, with profile scrapes continuing to use the same unified `ScrapeProgress` component.

## 9. Tests and validation

- [x] 9.1 `profile-scrape-performance.test.ts` — added three YouTube-specific tests: default concurrency > 1, `YOUTUBE_SCRAPE_CONCURRENCY=1` rolls back to serial, `=99` clamps to 5. Existing tests still pass.
- [x] 9.2 Stage callback coverage lives in `transcription.service.test.ts` (new `stage callbacks` describe block with happy-path, Gemini failover, and throwing-callback isolation) and the repository tests in `scrape-job-item.repository.test.ts`.
- [x] 9.3 New `src/infrastructure/api/__tests__/youtube-audio.client.test.ts` — 7 tests asserting the low-bitrate preference, fallback chain, and error cases.
- [x] 9.4 `src/infrastructure/api/__tests__/deepgram.client.test.ts` updated with a new `streaming body` describe block covering `duplex: 'half'`, the `DEEPGRAM_STREAMING_BODY=false` drain path, and stream-exhaustion-on-retry behavior.
- [x] 9.5 `npm run type-check` clean. `npm test` green: 48 test files, 822 tests passing.
- [ ] 9.6 Manual smoke: a 10-URL batch of long captionless podcasts shows progress updating within 2 s on every stage change. Wall-clock should be ≲ 6 min on a typical connection. **Deferred — needs a live environment with Deepgram credentials and the migration applied.**
- [ ] 9.7 Manual smoke: `/api/import/batch` with 5 URLs returns within ~500 ms and the UI transitions straight to the per-URL progress view. **Deferred — same reason as 9.6.**

## 10. Specs and archive

- [x] 10.1 `specs/scrape-progress/spec.md` — written during the propose step.
- [x] 10.2 `specs/ai-pipeline/spec.md` — written during the propose step.
- [ ] 10.3 Update `docs/WEB_DEV_PLAN.md` if this closes any listed friction item. **Skip unless the phase table changes — small-scope UX fix.**
- [ ] 10.4 Update `docs/ARCHITECTURE.md` Realtime section (or add one) mentioning the new channel. **Follow-up — docs are consistent with the architectural pattern described in this change's design.md.**
- [ ] 10.5 Archive with `/opsx:archive improve-scrape-progress-ux` after all tasks are complete and the smoke tests pass. **Pending 1.3, 1.4, 9.6, 9.7 — user-run DB migration + live smoke tests.**
