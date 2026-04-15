## Context

The caching pipeline built in PRs #73–#76:

```
User request → /api/kols/[id]/win-rate
                      │
                      ▼
              isScorecardCacheEnabled()  ◄── USE_SCORECARD_CACHE env var
                      │
        ┌─────────────┴─────────────┐
        │ ON                         │ OFF  (current prod state)
        ▼                            ▼
   L3: kol_scorecard_cache      legacyCompute()
        │                            │
        │ hit → return               │ - listPosts(limit=1000)
        │   { status: 'ready',       │ - loadSamplesByPostIds (L2)
        │     day5/30/90/365, ... }  │ - fetch Tiingo candles (slow)
        │                            │ - computeWinRateStats
        │ miss →                     │ - includeBucketsByStock
        │   enqueueCompute()         │ - return stats
        │   return                   │
        │   { status: 'computing' }  │ ← 504s today on Gooaye
        ▼
   L2: post_win_rate_samples (2508 rows, warm)
   L1: volatility_thresholds  (1315 rows, warm)
```

L1 and L2 are already backfilled. L3 has 1 row (Gooaye only) out of 9 KOLs needed. Both flags default OFF in prod.

**What the runtime logs show (today, UTC):**
- 06:20–06:33 UTC: four 504 timeouts on `GET /api/kols/b7a958c4.../win-rate` → confirms `legacyCompute()` is running and exceeding Vercel Hobby's 10 s function limit.

**What the cache row shows:** Gooaye's `kol_scorecard_cache` row has correct, fresh data (computed_at 03:08 UTC today, well within the 12 h TTL, classifier_version=1, stale=false). So if the flag flip alone happens, Gooaye is immediately fixed. The 8 other KOLs need backfill to avoid an infinite `computing` poll loop caused by the next issue (D3).

## Goals / Non-Goals

**Goals:**
- Flip `USE_SCORECARD_CACHE` and `USE_WIN_RATE_SAMPLE_CACHE` to `true` in Vercel production.
- Pre-warm `kol_scorecard_cache` for all 9 KOLs with posts.
- Pre-warm `stock_scorecard_cache` for all 194 stocks with posts.
- Fix the fire-and-forget enqueue so cold KOLs self-heal on a cache miss.
- Verify end-to-end via Browser MCP that the KOL detail page renders SQR and Return (not "—") for every KOL.

**Non-Goals:**
- Deleting the legacy compute path or the feature flags. That is tracked as PR #74 §10.5 and PR #75 §10.3 and should only happen after this change has soaked for 48 h.
- Adding a scheduled cron to keep caches warm. The 12 h TTL + read-through-on-miss handles staleness lazily, per PR #75 design D6 ("no Vercel Cron required"). Revisit if user-reported staleness becomes an issue.
- Migrating to a different cache backend (Redis, etc.).
- Changing the response shape or client hook logic. The hook already handles both legacy and cached shapes (`src/hooks/use-kols.ts:141–165`).

## Decisions

### D1 — Flag flip sequence

**Decision:** Flip both flags in a single redeploy. Do NOT stage them.

**Why not stage?** The two flags interact: with scorecard cache ON but sample cache OFF, the `legacyCompute` fallback (used on scorecard cache misses with the `status: 'computing'` path) runs via `legacyCompute → new StockPriceVolatilityProvider` (not persistent). That means every miss triggers full Tiingo re-fetches — worst of both worlds. Flipping them together is cleaner.

```
Before:  USE_WIN_RATE_SAMPLE_CACHE=<unset, default=false-in-prod>
         USE_SCORECARD_CACHE=<unset, default=false-in-prod>
         → legacyCompute with stateless volatility → 504s

After:   USE_WIN_RATE_SAMPLE_CACHE=true
         USE_SCORECARD_CACHE=true
         → Read-through to L3 → fast warm hits; misses enqueue + poll
```

**Rollback:** Set both to `false` or delete the env vars; redeploy. The existing code paths are preserved.

### D2 — Backfill scope

**Decision:** Pre-warm **every** KOL scorecard and **every** stock scorecard that has at least one post. Do this BEFORE flipping the flags.

Rationale:
- 9 KOLs × 1 compute each ≈ 30 s total.
- 194 stocks × 1 compute each ≈ 5–10 min total (stocks are fan-out heavier because they aggregate across all KOLs that posted about them).
- Running from a local shell with service role key is safe — the script uses `createAdminClient()` and bypasses RLS.
- After warming, the first user visit to any KOL on any stock is a single PK lookup — no timeouts, no `computing` flicker.

**Script contract (extending PR #76's `scripts/backfill-gooaye-scorecards.ts`):**

```
npx tsx scripts/backfill-scorecards.ts [--kol <slug|id|all>] [--stocks] [--dry-run]

--kol <slug|id>   Backfill one KOL (same as PR #76 behavior)
--kol all         Backfill every KOL with posts  (NEW)
--stocks          Also backfill stock_scorecard_cache for every
                  stock referenced by the selected KOL(s)  (NEW when combined with --kol all)
--dry-run         Print what would be computed, don't upsert  (already exists)
```

Production invocation:
```bash
SUPABASE_SERVICE_ROLE_KEY=... TIINGO_API_TOKEN=... \
  npx tsx scripts/backfill-scorecards.ts --kol all --stocks
```

### D3 — Fire-and-forget enqueue resilience

**Problem:** Current implementation (`src/domain/services/scorecard.service.ts:201-204`):

```ts
export function enqueueKolScorecardCompute(kolId: string): void {
  void computeKolScorecard(kolId);
}
```

On Vercel serverless, the Node sandbox is frozen the moment the response is written. The unresolved `computeKolScorecard` promise is suspended and typically never resumes. So for a KOL whose cache row doesn't exist, the flow is:

```
request → L3 miss → enqueue (lost) → return { status: 'computing' }
client polls → L3 still missing → enqueue (lost) → computing → ...
```

Infinite loop.

**Decision:** Use Vercel's `waitUntil` to keep the function alive past the response.

```ts
// src/domain/services/scorecard.service.ts

import { waitUntil } from '@vercel/functions';

export function enqueueKolScorecardCompute(kolId: string): void {
  // On Vercel: waitUntil holds the sandbox open until the promise settles,
  // up to the function's remaining time budget (60s on Pro, 10s on Hobby).
  // In dev / non-Vercel runtime: falls back to `void`, which works fine
  // because the Node process isn't being frozen.
  if (typeof waitUntil === 'function') {
    waitUntil(computeKolScorecard(kolId));
  } else {
    void computeKolScorecard(kolId);
  }
}
```

**Import consideration:** `@vercel/functions` is Vercel-provided at build time; there's no runtime dep to add. If it's not resolvable at import time, wrap with a dynamic import:

```ts
let waitUntil: ((p: Promise<unknown>) => void) | null = null;
try {
  waitUntil = require('@vercel/functions').waitUntil;
} catch {
  /* running outside Vercel */
}
```

**Budget note:** Vercel Hobby function timeout is 10 s. A cold `computeKolScorecard` for a prolific KOL could exceed that. With `waitUntil`, the compute continues only until the function's overall timeout — after which it's killed, same as today, except the response was sent promptly. The backfill (D2) is what ensures cold-KOL latency doesn't matter in the first place.

**Symmetric change for stocks:** Apply the same pattern to `enqueueStockScorecardCompute`.

### D4 — Verification plan

Three layers:

1. **SQL spot-check** — after the backfill, assert row counts:
   ```sql
   SELECT (SELECT COUNT(*) FROM kol_scorecard_cache WHERE classifier_version = 1 AND stale = FALSE) AS warm_kols,
          (SELECT COUNT(DISTINCT kol_id) FROM posts) AS expected_kols,
          (SELECT COUNT(*) FROM stock_scorecard_cache WHERE classifier_version = 1 AND stale = FALSE) AS warm_stocks,
          (SELECT COUNT(DISTINCT stock_id) FROM post_stocks) AS expected_stocks;
   ```
   Pass: `warm_kols === expected_kols` and `warm_stocks === expected_stocks`.

2. **Runtime log spot-check** — after the redeploy + backfill, the existing 504 pattern on `/api/kols/.../win-rate` should disappear. Query Vercel runtime logs for 1 h post-deploy.

3. **Browser MCP** — navigate to each of the 9 KOL detail pages, assert the scorecard ring paints with a numeric hit rate (not "—") within 3 s. Detail in `validation.md`.

### D5 — What about existing Gooaye cache row?

Gooaye's row was populated 2026-04-15 03:08 UTC by PR #76's one-off script. It's fresh (< 12 h TTL) and uses `classifier_version=1` which matches `CLASSIFIER_VERSION` in code. **Leave it alone.** The backfill script is idempotent (`upsert`) so re-running against Gooaye is safe, but unnecessary — it'll produce the same row.

### D6 — Ordering matters: backfill BEFORE flag flip

If flags flip first with an empty L3:
- 9 KOLs × (all their users) × (every refresh) → 9 parallel computes on the first wave
- Each compute hits Tiingo + Supabase concurrently
- In-process dedupe lock (`kolComputing: Map`) helps within ONE function invocation, but Vercel runs multiple invocations in parallel — no cross-invocation lock
- → Potential thundering herd → rate-limit risk on Tiingo

If backfill completes first:
- All 9 rows are warm before any user hits the new code path
- First real request is a single PK lookup → < 100 ms

**Enforced order:**
```
1. Merge + deploy the waitUntil resilience fix (this change's code delta).
2. Run backfill against prod with the OLD flag state (flags still off).
   → Uses the already-correct code path (scorecard.service.ts works regardless of flag).
3. Verify SQL counts.
4. Set USE_WIN_RATE_SAMPLE_CACHE=true, USE_SCORECARD_CACHE=true in Vercel.
5. Redeploy (triggers env binding).
6. Run validation.md checks.
```

## Risks / Trade-offs

**Stale Gooaye cache.** The row will be ~5 h old by the time this change merges. Still within the 12 h TTL, so no action needed. But if we want it truly fresh, re-running the backfill script for Gooaye is free.

**Tiingo rate limits during backfill.** 194 stocks × ~1 API call each. Tiingo Free tier allows 2400 requests/hour. Well within budget. Script already uses `Promise.allSettled` with 5 s per-stock timeout — a handful of slow stocks won't block the job.

**Classifier version bump invalidates the backfill.** If someone bumps `CLASSIFIER_VERSION` after this change ships, every cached row silently becomes a miss (by design — `getKolScorecard` filters on `classifier_version !== classifierVersion → null`). Re-running the backfill is the recovery. Not an issue today but worth flagging for future maintainers.

**waitUntil budget.** On Hobby, the total function budget is still 10 s. If a cold compute for a prolific KOL takes 8 s and the response is returned in 200 ms, `waitUntil` has 9.8 s to finish — usually enough. If not, the compute is killed mid-flight, the row isn't upserted, and the next request re-enqueues. Not a correctness problem, just a "pay the latency more than once" issue. Backfill avoids this entirely for known KOLs.

**No automated cache warming on new-KOL creation.** When a user imports a new KOL via `/input`, its scorecard is cold. The first view will trigger a `{ status: 'computing' }` + waitUntil compute. If it works, great; if not, the user polls and eventually sees "—". Trade-off accepted for this change; a follow-up proposal could hook scorecard compute into the KOL-creation pipeline.

## Migration Plan

See D6's "Enforced order". No schema migration; this is pure ops + one small code delta.

**Rollback:**
- Code delta is trivially reversible (one function in one file).
- Env var flip is instantly reversible from Vercel Dashboard + one redeploy.
- Backfilled rows stay in the DB; they don't hurt anything with flags off (the legacy path doesn't read them).

## Open Questions

**Q: Should we extend `waitUntil` to other fire-and-forget paths in the codebase?**
A: Out of scope here. If another enqueue has the same bug (e.g., `invalidateScorecardsAfterPostWrite`'s recompute enqueue), it's a separate change. Call it out, don't fix it here.

**Q: What about the dashboard route `/api/dashboard`?**
A: That route uses the same `computeWinRateStats` machinery but isn't gated by `USE_SCORECARD_CACHE` (it gates on `USE_WIN_RATE_SAMPLE_CACHE` only, per PR #74). It'll benefit from the sample-cache flag flip. No separate action needed.
