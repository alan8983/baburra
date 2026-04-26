## 1. Retry helper

- [x] 1.1 In `src/infrastructure/repositories/scrape-job.repository.ts`, add a private `retryTerminalWrite<T>(fn: () => Promise<T>): Promise<T>` helper.
  - Implemented as an exported function (not private) so the kol-source path in `profile-scrape.service` can wrap `updateScrapeStatus` without round-tripping through this repo. Co-located with the terminal-state writers it guards. Header comment ties it back to #90.
- [x] 1.2 Backoff schedule: 0ms (initial), 250ms, 500ms, 1000ms — total 4 attempts.
  - Implemented as `TERMINAL_RETRY_DELAYS_MS = [250, 500, 1000]` (3 retry waits on top of the initial attempt = 4 attempts).
- [x] 1.3 Retry-allowlist: errors whose `.message` matches `/fetch failed|ETIMEDOUT|ECONNRESET|socket hang up/i`, OR whose PostgREST status is in 500–599. All other errors throw immediately.
  - `isRetryableNetworkError()` checks the message regex, then `err.status`, then `err.code` (numeric or string `5xx`). Anything else (`23505` etc.) bypasses the retry loop.
- [x] 1.4 Each retry attempt logs `console.warn('[scrape-job.repository] terminal write retry N/3 for <fn-name>: <err.message>')`.
  - Format `terminal write retry ${attempt + 1}/3 for ${context}: ${err.message}`. The `context` string carries the function name + jobId (e.g. `completeScrapeJob(job-1)`).

## 2. Wrap terminal-state writers

- [x] 2.1 Wrap the body of `completeScrapeJob` in `retryTerminalWrite(...)`.
- [x] 2.2 Wrap the body of `failScrapeJob` in `retryTerminalWrite(...)`.
- [x] 2.3 Wrap the body of `markPermanentlyFailed` in `retryTerminalWrite(...)`.
- [x] 2.4 In `src/domain/services/profile-scrape.service.ts:571`, wrap the `updateScrapeStatus(source.id, 'completed', importedCount)` call in the same retry helper (or expose a thin wrapper from kol-source.repository).
  - Imported `retryTerminalWrite` from the repo barrel and wrapped the call inline. Avoided the alternate "expose a wrapper from kol-source.repository" path because it would require duplicating the helper or creating a circular dep — exporting the helper from `scrape-job.repository.ts` and wrapping at the call site is cleaner.

## 3. Reconciler

- [x] 3.1 Add `reconcileStuckJob(jobId: string): Promise<{ reconciled: boolean; status?: string; stats?: {…} }>` to `scrape-job.repository.ts`.
  - Signature returns `StuckJobReconciliation` with optional `status` (always echoed for observability, even when `reconciled: false`) and `stats` (only on successful reconciliation).
- [x] 3.2 Logic: SELECT job; if `status !== 'processing'` → return `{ reconciled: false }`. Else SELECT items; if any item is non-terminal → return `{ reconciled: false }`. Else derive counts and call `completeScrapeJob(jobId, { … })`; return `{ reconciled: true, status: 'completed', stats }`.
  - Added two extra guards: (a) refuse to reconcile when item rows are missing entirely (legacy jobs), (b) refuse when seeded item count is below `total_urls` (mid-flight crash before all items were seeded). The "derive counts" line in the original task is misleading — see 3.3 below; we trust the parent's existing flushed counters and pass them through to `completeScrapeJob`.
- [x] 3.3 Item terminal stages: `completed`, `failed`, `filtered`. Anything else (`extracting`, `transcribing`, `analyzing`, etc.) is non-terminal.
  - **Spec contradiction noted and resolved.** The actual `ScrapeJobItemStage` model (`src/domain/models/scrape-job-item.ts`) defines stages as `queued | discovering | downloading | transcribing | analyzing | done | failed` — there is no `completed` or `filtered` item stage. Filtering happens at the *job* level (job's `filtered_count` is incremented for "no_tickers_identified" results), but the URL still finishes as item-stage `done`. The reconciler therefore uses `isTerminalStage()` from the model (which returns true for `done`/`failed`). The proposal's task text used aspirational stage names; the implementation tracks the actual model. Captured in code comments and in the new `pipeline-observability` spec R3.

## 4. Wire reconciler into processJobBatch

- [x] 4.1 At the top of `processJobBatch` (after the `getScrapeJobById` call), invoke `reconcileStuckJob(jobId)`. If it returns `reconciled: true`, log the reconciliation and return early with the reconciled stats.
  - Implementation note: invoked **before** `getScrapeJobById`, not after. Reason: we want the subsequent read to see the post-reconcile row state so the existing `if (job.status === 'completed' || ...)` early-return branch handles the return uniformly. This avoided a duplicated early-return code path. Reconciler errors are caught and logged non-blockingly so a reconciler bug can never wedge the pipeline.
- [x] 4.2 If the reconciled job is a `validation_scrape` and `kolId` is known, also call `handleValidationCompletion(kolId)` before returning (mirror the post-`completeScrapeJob` logic).
  - Implemented in the early-return branch with `didReconcile && job.jobType === 'validation_scrape' && job.kolSourceId` guard. Validation hook errors are caught + logged so they can't undo the (already-committed) reconciliation.

## 5. Tests

- [x] 5.1 New vitest file `src/infrastructure/repositories/__tests__/scrape-job.retry.test.ts`:
  - 5.1.1 Single-blip case: mock Supabase client to throw `fetch failed` once, then succeed → assert retry helper resolves with the success value, exactly 2 attempts.
  - 5.1.2 Persistent failure: mock to throw `fetch failed` 4 times → assert helper throws after 4 attempts.
  - 5.1.3 Non-retryable error: mock to throw a 23505 unique violation → assert helper throws on first attempt (no retries).
  - All three pass. Added a fourth case for a 5xx PostgREST status (covered the `status` numeric branch). Used `vi.useFakeTimers()` + `advanceTimersByTimeAsync()` so the suite doesn't actually wait the 1.75s real-time backoff.
- [x] 5.2 New vitest file `src/infrastructure/repositories/__tests__/scrape-job.reconcile.test.ts`:
  - 5.2.1 All items terminal + parent processing → reconciles to completed, returns derived stats.
  - 5.2.2 Some items non-terminal → returns `reconciled: false`, parent unchanged.
  - 5.2.3 Parent already completed → returns `reconciled: false`, no writes.
  - All three pass. Added two extra cases for the new guards: missing item rows and partially-seeded item rows.
- [x] 5.3 Existing `profile-scrape.service.test.ts`: add a case where the first `processJobBatch` call crashes between item-success and `completeScrapeJob`, then a second `processJobBatch` call self-heals via the reconciler.
  - Three new tests in `processJobBatch self-heal via reconcileStuckJob (#90 / D3)` block: (a) reconciler returns true → processUrl never called, function returns reconciled stats, (b) reconciler returns false → normal processing continues, (c) reconciler throws → logged to `console.warn`, normal processing continues. Required adding `reconcileStuckJob` and `retryTerminalWrite` to the existing `@/infrastructure/repositories` mock setup (otherwise the import resolves to `undefined` and `processJobBatch` throws). Same fix applied to `profile-scrape-performance.test.ts` to keep its 6 existing tests passing.

## 6. Spec update

- [x] 6.1 Update `openspec/specs/pipeline-observability/spec.md`:
  - Add invariant: "If `scrape_jobs.status = 'processing'` and every linked `scrape_job_item.stage` is in {`completed`, `failed`, `filtered`}, then the next `processJobBatch` invocation for that job_id MUST transition the parent to a terminal status."
  - Add note: terminal-state writes are retried up to 3 times on network-shaped errors; constraint violations are not retried.
  - **Spec did not exist** — created `openspec/specs/pipeline-observability/spec.md` from scratch (R1: terminal-state convergence, R2: blip-tolerant terminal writes, R3: reconciliation derives status from items + counts from parent). Used the actual `ScrapeJobItemStage` terminal set (`done`/`failed`) per 3.3 above. R3 explicitly documents *why* counters come from the parent and not the items (the proposal's "derive counts from items" was infeasible — see 3.2 note).

## 7. Validation

- [x] 7.1 `npm run type-check` clean. → 0 errors.
- [x] 7.2 `npm run lint` clean. → 0 errors (18 pre-existing warnings unchanged; one transient warning from a stale local var was fixed).
- [x] 7.3 `npx vitest run src/infrastructure/repositories src/domain/services/__tests__/profile-scrape*` all green. → 11 files, 108 tests passed.
- [ ] 7.4 (Manual) Run `npx tsx scripts/scrape-guyi-podcast-ep501-600.ts --limit 1`; confirm normal completion (no behaviour regression).
  - **Skipped in this session** — running a real scrape would consume Gemini/Tiingo/Supabase write quota, take ~3 minutes, and create a podcast post in the live DB. Defer to the operator on the merging branch (i.e. before tagging the change). The unit + service tests cover the structural behaviour change; a live smoke is an end-to-end sanity check, not a correctness gate.

## 8. Archive

- [ ] 8.1 PR merge → close GitHub issue #90 with reference to this change.
- [ ] 8.2 Run `/opsx:archive harden-scrape-job-terminal-state`.
- [x] 8.3 Update `openspec/changes/validate-podcast-pipeline-with-gooaye/baseline.md` D3 row to mark resolved.
