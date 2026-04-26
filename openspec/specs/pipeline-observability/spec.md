# pipeline-observability Specification

## Purpose

The scrape pipeline writes its progress and final outcome to the `scrape_jobs` and `scrape_job_items` tables. Downstream consumers — the per-URL progress UI, the dashboard's job list, the validation-completion handler, the retry-stuck-jobs cron — read this state to decide what to do next. If the recorded state diverges from the actual outcome (e.g. all per-URL items succeeded but the parent row is stuck in `processing`), every downstream consumer makes the wrong call and a class of "ghost" failures becomes invisible to operators.

This spec codifies the invariants that keep the recorded state aligned with the actual work, plus the resilience strategy that makes those invariants hold under transient infrastructure failures.

## Requirements

### Requirement: Terminal-state convergence (R1)

For every `scrape_jobs` row whose `status = 'processing'` and where every linked `scrape_job_items.stage` is in the terminal set (`done`, `failed`), the next `processJobBatch(jobId)` invocation for that job_id MUST transition the parent's `status` to a terminal value (`completed` / `failed` / `permanently_failed`) before returning.

**Rationale:** Without this guarantee, a job whose per-URL work has fully completed but whose terminal write was lost (transient Supabase blip, process crash) sits indefinitely in `processing`. Downstream listeners (`handleValidationCompletion`, the stuck-jobs cron, the UI) silently never fire. Issue [#90](https://github.com/alan8983/baburra/issues/90) (D3) made this concrete: a `TypeError: fetch failed` from Supabase aborted `completeScrapeJob`, killed the seed script, and left the row in zombie state.

The convergence is achieved by `reconcileStuckJob`, called at the top of every `processJobBatch` invocation. The call is idempotent and a no-op when no inconsistency is present.

#### Scenario: Stuck job re-entered via processJobBatch
- **WHEN** `processJobBatch(jobId)` is invoked for a job that is in `processing` and whose item rows are all terminal
- **THEN** the parent row is updated to `status = 'completed'`, the function returns the reconciled stats without re-running per-URL work, and (for `validation_scrape` jobs) `handleValidationCompletion(kolId)` is invoked

#### Scenario: Stuck job with in-flight items
- **WHEN** `processJobBatch(jobId)` is invoked for a `processing` job where some items are still in non-terminal stages (e.g. `analyzing`)
- **THEN** the reconciler reports `reconciled: false`, the function continues into the normal per-URL processing loop, and the job converges through the standard `completeScrapeJob` path

#### Scenario: Healthy completed job re-entered
- **WHEN** `processJobBatch(jobId)` is invoked for a job already in `completed` or `failed` state
- **THEN** the reconciler is a no-op, the function returns immediately with the recorded stats, and no DB write is issued

### Requirement: Terminal-state writes are blip-tolerant (R2)

Repository functions that write a terminal `scrape_jobs.status` value (`completeScrapeJob`, `failScrapeJob`, `markPermanentlyFailed`) and the corresponding final `kol_sources.scrape_status` write (`updateScrapeStatus(..., 'completed', ...)` invoked from `processJobBatch`) MUST be wrapped in a narrow retry helper that retries up to 3 times (4 attempts total) on network-shaped errors only.

**Retry conditions:**
- Error message matches `/fetch failed|ETIMEDOUT|ECONNRESET|socket hang up/i`
- OR the error carries an HTTP status in the 500–599 range
- OR the error carries a numeric/string code in the 500–599 range

**Backoff schedule:** 250ms → 500ms → 1000ms (total worst-case latency added: ~1.75s).

**Non-retryable errors** (e.g. PostgreSQL `23505` unique violation, `23503` FK violation, any non-network application error) MUST surface immediately without retrying. The retry helper must not mask programmer errors.

**Rationale:** A 1.75s additional latency budget on a once-per-batch write is a great trade against zombie `processing` rows. Constraint violations represent a different bug class entirely — silently retrying them would hide real issues.

#### Scenario: Single transient blip during terminal write
- **WHEN** the first attempt to `completeScrapeJob(jobId)` throws `Error: fetch failed` and the second attempt succeeds
- **THEN** the helper waits 250ms, retries, the write succeeds, and the caller observes a normal resolution

#### Scenario: Persistent network outage
- **WHEN** four consecutive `completeScrapeJob` attempts all throw network-shaped errors
- **THEN** the helper exhausts its retry budget after ~1.75s and re-throws the last error to the caller; the next `processJobBatch` invocation will use `reconcileStuckJob` (R1) to self-heal

#### Scenario: Constraint violation
- **WHEN** the wrapped write throws an error whose code is `23505` (unique violation)
- **THEN** the helper does not retry, throws the original error on the first attempt, and the caller sees the constraint violation surfaced immediately

### Requirement: Reconciliation derives status from items, counts from parent (R3)

`reconcileStuckJob` MUST decide whether to flip the parent's status based on the terminal-vs-non-terminal split of the linked `scrape_job_items` rows. It MUST NOT recompute the parent's `imported_count` / `duplicate_count` / `error_count` / `filtered_count` columns from the items — those counters are written incrementally by `updateScrapeJobProgress` during the original `processJobBatch` run and represent the authoritative tally of fan-out outcomes that item stages alone cannot distinguish (item stage `done` covers imported, duplicate, mirror_linked, and filtered URLs).

When the reconciler does flip the status, the parent's existing counters are passed verbatim into `completeScrapeJob`, which sets `status = 'completed'` and `completed_at = now()` and persists the counters as-is.

**Rationale:** `scrape_job_items.stage` carries `done`/`failed` only — it can answer "did this URL finish?" but not "imported or duplicate or filtered?". The fan-out outcomes are a property of `processUrl`'s return value, not the item's stage. Re-deriving the counters from items would lose information; trusting the parent's last flushed counters preserves it.

#### Scenario: Reconciler completes a stuck job
- **WHEN** the reconciler flips a stuck job to `completed`
- **THEN** the parent's `imported_count`, `duplicate_count`, `error_count`, `filtered_count`, and `processed_urls` are unchanged (they reflect the values written by the last `flushProgress` call of the original run); only `status` and `completed_at` change

#### Scenario: Reconciler observes completed_at relative to original work
- **WHEN** the reconciler completes a job whose original work finished an hour ago (e.g. process crashed before the terminal write)
- **THEN** the recorded `completed_at` reflects the reconciliation time, not the original work time — operators should treat `completed_at` as "first time the row was observed terminal", not "wall-clock time the work ended"
