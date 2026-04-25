## Why

GitHub Issue [#90](https://github.com/alan8983/baburra/issues/90) (D3 from `validate-podcast-pipeline-with-gooaye` baseline) reports that a transient `TypeError: fetch failed` from Supabase, raised inside `completeScrapeJob`, propagates out of `processJobBatch`, kills the seed script with exit code 1, and leaves the `scrape_jobs` row stuck in `status='processing'` despite all per-URL work having succeeded.

Observed during the §5.3 S2 baseline run on 2026-04-25:

```
scrape_jobs row: processed_urls=3/3, imported_count=2, error_count=1,
                 status='processing'  ← should be 'completed'
posts table:    all success rows committed
```

The problem isn't unique to `completeScrapeJob`. Every terminal-state transition in `src/infrastructure/repositories/scrape-job.repository.ts` is a single un-retried `supabase.from('scrape_jobs').update()` call:

| Function | Line | Terminal state written |
|---|---|---|
| `completeScrapeJob` | 193 | `status='completed'` |
| `failScrapeJob` | 288 | `status='failed'` |
| `markPermanentlyFailed` | 271 | `status='permanently_failed'` |
| `updateScrapeStatus` (kol-source.repository) | — | source `scrape_status='completed'` |

Any one of these can flap on a network blip, with the same outcome: in-process work succeeded, DB row says otherwise, downstream listeners (e.g., `handleValidationCompletion`) never fire, dashboards report partial.

## What Changes

- Add a small in-repository retry helper (`retryTerminalWrite`) — 3 attempts with exponential backoff (250ms / 500ms / 1000ms), retries only on network-shaped errors (`fetch failed`, `ETIMEDOUT`, `ECONNRESET`, HTTP 5xx via PostgREST), bails immediately on non-retryable errors (e.g., constraint violations).
- Wrap `completeScrapeJob`, `failScrapeJob`, `markPermanentlyFailed` in the helper. `updateScrapeStatus` (called from `profile-scrape.service.ts:571` right after `completeScrapeJob`) gets the same wrap.
- Add a `reconcileStuckJob(jobId)` helper that derives the correct terminal state from `scrape_job_items` (counts of `succeeded` / `failed` / `filtered` items vs `total_urls` on the parent job). Plumb a single call to this helper at the top of `processJobBatch` so a re-entry on a stuck job self-heals before doing any new work.
- Add a vitest covering the retry helper (mocked Supabase client, simulate one fetch failure → retry succeeds; simulate three failures → throws after exhausting retries).
- Add a vitest covering `reconcileStuckJob` (given a `processing` row whose items are all terminal, flips to `completed`; given partial items, leaves `processing` alone).

**Non-goals:**

- Do **not** change the on-disk schema. The `scrape_jobs` and `scrape_job_items` tables already carry enough information to reconcile.
- Do **not** add a background reconciler cron. Self-heal on `processJobBatch` re-entry covers the common case (script re-run); a periodic reconciler is a separate change if/when needed.
- Do **not** retry `updateScrapeJobProgress` mid-run. Progress writes are advisory and a later `flushProgress` call (or the terminal write itself, post-fix) carries the correct snapshot.

## Capabilities

### Modified Capabilities

- `pipeline-observability`: Terminal `scrape_jobs` state writes are now resilient to single-network-blip failures and self-heal on re-entry. New invariant: if all `scrape_job_items` for a job are terminal, the parent job will eventually reach a terminal state too (under happy-path operation).

## Impact

- **Code**:
  - `src/infrastructure/repositories/scrape-job.repository.ts` (new helper, three function wraps, new `reconcileStuckJob`).
  - `src/domain/services/profile-scrape.service.ts` (call `reconcileStuckJob` at `processJobBatch` entry; wrap `updateScrapeStatus('completed')` in the helper).
- **Tests**: New vitests for retry helper + reconciler.
- **DB**: No schema changes.
- **Specs**: `openspec/specs/pipeline-observability/spec.md` — add invariant about terminal-state convergence.
- **User-visible**: None directly. Indirectly: scripts no longer exit 1 on transient blips; dashboards stop showing zombie `processing` rows.
- **Dependencies**: None — independent of #89 / #91.
- **Independence**: Fully independent. Can ship in any order vs. the other two.
