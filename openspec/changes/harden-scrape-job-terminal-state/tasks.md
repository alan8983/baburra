## 1. Retry helper

- [ ] 1.1 In `src/infrastructure/repositories/scrape-job.repository.ts`, add a private `retryTerminalWrite<T>(fn: () => Promise<T>): Promise<T>` helper.
- [ ] 1.2 Backoff schedule: 0ms (initial), 250ms, 500ms, 1000ms — total 4 attempts.
- [ ] 1.3 Retry-allowlist: errors whose `.message` matches `/fetch failed|ETIMEDOUT|ECONNRESET|socket hang up/i`, OR whose PostgREST status is in 500–599. All other errors throw immediately.
- [ ] 1.4 Each retry attempt logs `console.warn('[scrape-job.repository] terminal write retry N/3 for <fn-name>: <err.message>')`.

## 2. Wrap terminal-state writers

- [ ] 2.1 Wrap the body of `completeScrapeJob` in `retryTerminalWrite(...)`.
- [ ] 2.2 Wrap the body of `failScrapeJob` in `retryTerminalWrite(...)`.
- [ ] 2.3 Wrap the body of `markPermanentlyFailed` in `retryTerminalWrite(...)`.
- [ ] 2.4 In `src/domain/services/profile-scrape.service.ts:571`, wrap the `updateScrapeStatus(source.id, 'completed', importedCount)` call in the same retry helper (or expose a thin wrapper from kol-source.repository).

## 3. Reconciler

- [ ] 3.1 Add `reconcileStuckJob(jobId: string): Promise<{ reconciled: boolean; status?: string; stats?: {…} }>` to `scrape-job.repository.ts`.
- [ ] 3.2 Logic: SELECT job; if `status !== 'processing'` → return `{ reconciled: false }`. Else SELECT items; if any item is non-terminal → return `{ reconciled: false }`. Else derive counts and call `completeScrapeJob(jobId, { … })`; return `{ reconciled: true, status: 'completed', stats }`.
- [ ] 3.3 Item terminal stages: `completed`, `failed`, `filtered`. Anything else (`extracting`, `transcribing`, `analyzing`, etc.) is non-terminal.

## 4. Wire reconciler into processJobBatch

- [ ] 4.1 At the top of `processJobBatch` (after the `getScrapeJobById` call), invoke `reconcileStuckJob(jobId)`. If it returns `reconciled: true`, log the reconciliation and return early with the reconciled stats.
- [ ] 4.2 If the reconciled job is a `validation_scrape` and `kolId` is known, also call `handleValidationCompletion(kolId)` before returning (mirror the post-`completeScrapeJob` logic).

## 5. Tests

- [ ] 5.1 New vitest file `src/infrastructure/repositories/__tests__/scrape-job.retry.test.ts`:
  - 5.1.1 Single-blip case: mock Supabase client to throw `fetch failed` once, then succeed → assert retry helper resolves with the success value, exactly 2 attempts.
  - 5.1.2 Persistent failure: mock to throw `fetch failed` 4 times → assert helper throws after 4 attempts.
  - 5.1.3 Non-retryable error: mock to throw a 23505 unique violation → assert helper throws on first attempt (no retries).
- [ ] 5.2 New vitest file `src/infrastructure/repositories/__tests__/scrape-job.reconcile.test.ts`:
  - 5.2.1 All items terminal + parent processing → reconciles to completed, returns derived stats.
  - 5.2.2 Some items non-terminal → returns `reconciled: false`, parent unchanged.
  - 5.2.3 Parent already completed → returns `reconciled: false`, no writes.
- [ ] 5.3 Existing `profile-scrape.service.test.ts`: add a case where the first `processJobBatch` call crashes between item-success and `completeScrapeJob`, then a second `processJobBatch` call self-heals via the reconciler.

## 6. Spec update

- [ ] 6.1 Update `openspec/specs/pipeline-observability/spec.md`:
  - Add invariant: "If `scrape_jobs.status = 'processing'` and every linked `scrape_job_item.stage` is in {`completed`, `failed`, `filtered`}, then the next `processJobBatch` invocation for that job_id MUST transition the parent to a terminal status."
  - Add note: terminal-state writes are retried up to 3 times on network-shaped errors; constraint violations are not retried.

## 7. Validation

- [ ] 7.1 `npm run type-check` clean.
- [ ] 7.2 `npm run lint` clean.
- [ ] 7.3 `npx vitest run src/infrastructure/repositories src/domain/services/__tests__/profile-scrape*` all green.
- [ ] 7.4 (Manual) Run `npx tsx scripts/scrape-guyi-podcast-ep501-600.ts --limit 1`; confirm normal completion (no behaviour regression).

## 8. Archive

- [ ] 8.1 PR merge → close GitHub issue #90 with reference to this change.
- [ ] 8.2 Run `/opsx:archive harden-scrape-job-terminal-state`.
- [ ] 8.3 Update `openspec/changes/validate-podcast-pipeline-with-gooaye/baseline.md` D3 row to mark resolved.
