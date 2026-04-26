## Context

The bug surfaces at the boundary between in-process scrape work and the persistent record of that work. `processJobBatch` does the heavy lifting (per-URL `processUrl` calls, per-item state writes), then issues exactly one `completeScrapeJob` call to flip the parent row terminal. That last write is a single point of failure for the whole batch's observability — succeed and the system is consistent; fail and you have an inconsistent state that no other code path heals.

The issue's "long-term" suggestion of an idempotent `tick-job` reconciler is the right model. We're picking a minimal slice of it: reconcile-on-entry. Combined with retry-on-write, this gives us two independent layers of defense (the write usually succeeds; if it doesn't, the next entry into `processJobBatch` for the same job sees the inconsistency and fixes it).

Stakeholder: pipeline owners (need terminal state to actually be terminal), seed-script users (don't want exit 1 on transient flaps), validation-completion handler (`handleValidationCompletion` is downstream of `status='completed'` and silently never fires today on a flap).

## Goals / Non-Goals

**Goals:**

- One in-flight network blip during terminal write does not leave a job stuck.
- A previously-stuck job self-heals on the next `processJobBatch` invocation for the same job, without requiring an operator to intervene.
- The retry helper is narrow enough that it can't accidentally mask programmer errors (e.g., constraint violations should still fail fast, loud).

**Non-Goals:**

- Distributed-systems-grade exactly-once semantics. We're targeting the 99.9% case (single transient blip), not Byzantine failure.
- A general-purpose retry library. We have one identifiable failure pattern (Supabase `fetch failed` on terminal job writes); we wrap it surgically.
- Cron-based background reconciliation. Re-entry self-heal handles the common case; if we ever need to heal jobs that nothing ever re-enters, we can add a cron in a follow-up.

## Decisions

### D1. Retry shape: 3 attempts, exponential backoff, narrow error allowlist

**Chosen:** `retryTerminalWrite(fn)` with attempts at 0ms / 250ms / 500ms / 1000ms (i.e., 3 retries on top of the initial attempt). Retry only on errors whose `.message` contains `fetch failed`, `ETIMEDOUT`, `ECONNRESET`, `socket hang up`, or whose `.code` is in the PostgREST 5xx range.

**Rationale:**

- 3 retries fits Supabase's typical edge-flap profile (sub-second recoveries) without blocking pipeline shutdown for too long if the outage is real.
- Backoff is short because terminal writes are tiny (~1 row UPDATE), and the calling pipeline is already at its end — burning 1.75s of total budget to save a stuck job is a great trade.
- The allowlist (vs. retry-all) is critical: a 23505 unique-violation or a 23503 FK-violation must surface immediately and is not a network problem.

**Alternative considered:** Retry-all-errors with a `--retry-on=` config knob. Rejected as over-engineered for the failure class we observed.

### D2. Reconciliation source: `scrape_job_items`, not in-memory counters

**Chosen:** `reconcileStuckJob(jobId)` reads `scrape_job_items` filtered by `scrape_job_id = jobId`, counts items with `stage IN ('completed', 'failed', 'filtered')` vs `total_urls` on the parent. If all items are terminal and parent is `processing`, derive the parent's `imported_count` / `duplicate_count` / `error_count` / `filtered_count` from the items and call `completeScrapeJob` (which now retries).

**Rationale:** `scrape_job_items` is the authoritative per-URL audit trail; counting it is purely declarative and idempotent. In-memory counters are only available within a single `processJobBatch` invocation and can't reconcile across script re-runs.

**Alternative considered:** Trust the parent row's existing `processed_urls` counter. Rejected because if the parent's counter is stale, it can't tell us what individual items succeeded — we still need to read the items table to derive `imported_count` etc. Reading items once is cheaper than reading both and reconciling them.

### D3. Reconciliation placement: `processJobBatch` entry, before `startScrapeJob`

**Chosen:** Call `reconcileStuckJob(jobId)` as the first DB-touching step in `processJobBatch`. If it transitions the job to terminal, log and return early with the reconciled stats (no new work to do).

**Rationale:** This makes the script re-run idempotent — running the seed script a second time after a crash just observes the prior run completed and exits cleanly. It also means no new code path needs the reconciler; everyone goes through `processJobBatch`.

**Alternative considered:** Inline the reconciliation into `getScrapeJobById`. Rejected because reads shouldn't have write side-effects, and most callers of `getScrapeJobById` (UI, dashboard) don't want to mutate state on a read.

### D4. No-op-safe reconciliation

**Chosen:** `reconcileStuckJob` is a no-op if (a) the job isn't in `processing`, or (b) any item is non-terminal. In the second case, the prior run was probably interrupted mid-flight; the new run will redo unfinished items via the existing `processJobBatch` loop and naturally hit the (now-retried) `completeScrapeJob` at the end.

## Risks / Trade-offs

- **[R1]** Retry budget (~1.75s max) elongates terminal write latency in the steady-state-flaky case. Acceptable because terminal writes happen at most once per batch.
- **[R2]** Reconciler-on-entry adds one extra `SELECT` per `processJobBatch` invocation. Cheap (single indexed query on `scrape_job_id`), and only runs at job-start once.
- **[R3]** If the retry helper masks a real systemic Supabase outage, errors will still surface after the third attempt — they'll just take ~1.75s longer to surface. Mitigation: log a warning on each retry attempt so operators can spot patterns.
- **[R4]** Reconciler may flip a job to `completed` whose items finished after the original crash — by design correct, but means the parent's `completed_at` will reflect the reconciliation time, not the original work time. Document this in the spec.

## Migration Plan

1. Implement `retryTerminalWrite` in `scrape-job.repository.ts`.
2. Wrap `completeScrapeJob`, `failScrapeJob`, `markPermanentlyFailed` in the helper.
3. Implement `reconcileStuckJob`.
4. Wire `reconcileStuckJob(jobId)` at top of `processJobBatch`. Wrap `updateScrapeStatus(source.id, 'completed', importedCount)` in the helper too.
5. Add vitests for both helpers using mocked Supabase client.
6. Run the seed script with `--limit 1` against a staging-like env, verify normal-path still completes cleanly.
7. (Manual smoke test, optional) Use `tc qdisc` or similar to inject a brief network drop during terminal write; verify retry kicks in and job completes.
8. Update `openspec/specs/pipeline-observability/spec.md` with the new invariant.

**Rollback:** Revert the commit. No DB schema changes, no migration. Any reconciliations already performed are correct end-state and should not be undone.

## Open Questions

- Should `reconcileStuckJob` also fire `handleValidationCompletion` if the reconciliation flipped a `validation_scrape` job to terminal? **Decision:** Yes — the original `processJobBatch` would have called it, so the reconciler should too. Captured in tasks.md.
- Should the retry helper log to a structured channel (Sentry, etc.) or just `console.warn`? **Decision:** `console.warn` for now; the project doesn't have a structured error reporter wired into repositories yet, and adding one is out of scope.
