# Validation: Rollout Scorecard Cache to Production

Final gatekeeper. Runs across three surfaces: SQL, Vercel runtime logs, and Browser MCP. All Tier 1 + Tier 2 + Tier 3 must pass before marking the rollout successful.

## Prerequisites

- Backfill has run to completion (tasks.md §5 complete).
- Redeploy with new env vars has reached `READY` (tasks.md §6 complete).
- Local shell has access to `mcp__4979d5c0-...__execute_sql` (Supabase MCP) and Vercel MCP.

---

## Tier 1 — SQL row-count sanity (run immediately after §5 backfill)

### T1.1: Warm-row counts match expected

```sql
SELECT
  (SELECT COUNT(*) FROM kol_scorecard_cache
     WHERE classifier_version = 1 AND stale = FALSE
       AND computed_at > NOW() - INTERVAL '1 hour') AS warm_kols_fresh,
  (SELECT COUNT(DISTINCT kol_id) FROM posts) AS expected_kols,
  (SELECT COUNT(*) FROM stock_scorecard_cache
     WHERE classifier_version = 1 AND stale = FALSE
       AND computed_at > NOW() - INTERVAL '1 hour') AS warm_stocks_fresh,
  (SELECT COUNT(DISTINCT stock_id) FROM post_stocks) AS expected_stocks;
```

**Pass:** `warm_kols_fresh >= expected_kols` AND `warm_stocks_fresh >= expected_stocks` (within a small tolerance for KOLs whose posts are all `excluded` samples — those legitimately produce no cache row).

**Fail action:** Review backfill logs for which KOLs/stocks were skipped. Re-run with `--kol <specific-id>` for each missing one.

### T1.2: Classifier version sanity

```sql
SELECT classifier_version, COUNT(*)
FROM kol_scorecard_cache
GROUP BY 1;

SELECT classifier_version, COUNT(*)
FROM stock_scorecard_cache
GROUP BY 1;
```

**Pass:** Only `classifier_version = 1` rows present (or whatever `CLASSIFIER_VERSION` resolves to at the time of running). No mixed versions (that would suggest a partial backfill after a version bump).

### T1.3: No stale flag set after backfill

```sql
SELECT COUNT(*) AS stale_kols FROM kol_scorecard_cache WHERE stale = TRUE;
SELECT COUNT(*) AS stale_stocks FROM stock_scorecard_cache WHERE stale = TRUE;
```

**Pass:** Both zero. If non-zero, a write happened between backfill and verification — re-run backfill for the stale IDs.

---

## Tier 2 — Vercel runtime-log verification (run ~15 min after §6 redeploy)

### T2.1: No more 504s on win-rate endpoint

Query Vercel runtime logs for the past 30 min on `/api/kols/*/win-rate`.

Use `mcp__f5c62800-...__get_runtime_logs`:
```
projectId: prj_Cdt0t4m71HO952zEWYXh0eyY9wwE
environment: production
since: 30m
statusCode: 504
query: win-rate
```

**Pass:** Zero results.

**Fail action:** Check the failing request's response time — if it's a KOL that wasn't in the backfill (new KOL added since?), run `--kol <id>` manually. If it's a KOL we DID backfill, inspect `kol_scorecard_cache` row freshness (maybe a stale flag got set by an invalidation hook).

### T2.2: 2xx rate on scorecard endpoints

Query `GET /api/kols/*/win-rate` responses over the past 30 min and compute the 2xx fraction.

**Pass:** ≥ 99% 2xx. Any non-2xx should be 401 (unauthenticated curls) or 404 (nonexistent KOL). Zero 5xx.

### T2.3: Response time p95

Sample 10 requests from the runtime log table for `/api/kols/*/win-rate` with status 200. Check response latency.

**Pass:** p95 ≤ 500 ms. (Warm cache hits should be ≤ 100 ms; the first miss on a stale cache row can spike higher during the `waitUntil` window but should not be user-facing because `{ status: 'computing' }` returns immediately.)

---

## Tier 3 — Browser MCP E2E (run after Tier 1 + Tier 2 pass)

### T3.1: Gooaye scorecard paints with data

```
Browser MCP Steps:
──────────────────
1. tabs_context_mcp(createIfEmpty: true)
2. navigate("https://baburra.vercel.app/kols/b7a958c4-f9f4-48e1-8dbf-a8966bf1484e")
3. Wait for scorecard card to appear (look for the ring / hit rate number).
4. ASSERT: the KOL scorecard ring displays a numeric percentage (e.g. "48%"),
   NOT "—" and NOT "正在計算..." / "Computing...".
5. ASSERT: the 4-period Return tile row (5d / 30d / 90d / 365d) shows
   numeric values for at least 30d and 90d (not "—").
6. ASSERT: the SQR popover (click the help icon or the SQR label) shows
   a numeric value and qualitative label — NOT "— · —".
7. Screenshot.
```

**Pass:** All ASSERTs pass. No console errors in DevTools.

**Fail action:** Compare API response in the Network tab to the expected `{ status: 'ready', day30: { sqr: ..., avgReturn: ..., hitRate: ..., sufficientData: true, ... }, ... }` shape.

### T3.2: Cold-KOL self-heal via waitUntil

```
Pre-setup: manually mark one KOL's cache row stale to force the cold path.

SQL:
  UPDATE kol_scorecard_cache SET stale = TRUE
  WHERE kol_id = '<pick a non-Gooaye KOL with posts>';

Browser MCP Steps:
──────────────────
1. navigate("https://baburra.vercel.app/kols/<same-kol-id>")
2. ASSERT: the ring shows a "Computing..." / "正在計算..." label (not a raw "—").
3. Wait up to 30 s (the hook polls every 3 s).
4. ASSERT: within 30 s, the ring transitions to a numeric value.
5. Verify via SQL that the cache row's computed_at is now fresh:
   SELECT computed_at, stale FROM kol_scorecard_cache WHERE kol_id = '<id>';
6. ASSERT: stale = FALSE AND computed_at > NOW() - INTERVAL '1 minute'.
```

**Pass:** The `waitUntil`-backed enqueue successfully landed the recompute; the row is warm again without any manual intervention.

**Fail action:** Check Vercel runtime logs for `[scorecard.service] computeKolScorecard(...) failed:` messages. Likely causes: Tiingo timeout, missing env var. If `waitUntil` isn't resolvable at runtime, confirm `@vercel/functions` is available (it's a Vercel-provided module; shouldn't need to be in package.json).

### T3.3: Stock scorecard endpoint

```
Browser MCP Steps:
──────────────────
1. navigate("https://baburra.vercel.app/stocks/NVDA")
2. Wait for the community accuracy card to render.
3. ASSERT: numeric values appear (hit rate, SQR) — NOT "—".
4. Open DevTools Network panel.
5. Locate the `/api/stocks/NVDA/scorecard` request.
6. ASSERT: response status 200, payload has `{ status: 'ready', day30: { ... }, ... }`.
7. ASSERT: response time < 500 ms.
```

**Pass:** Stock scorecard API returns ready on a warm cache.

### T3.4: Multi-KOL smoke

For each of the 9 KOLs with posts (query `SELECT DISTINCT k.id, k.slug FROM kols k JOIN posts p ON p.kol_id = k.id`):

```
Browser MCP Steps:
──────────────────
1. navigate(`https://baburra.vercel.app/kols/${kolId}`)
2. ASSERT: scorecard ring paints with a non-dash numeric value within 3 s.
3. Take one screenshot per KOL.
```

**Pass:** All 9 KOLs render a numeric scorecard ring. No "—" on any.

### T3.5: Rollback drill (optional but recommended)

```
1. In Vercel Dashboard, flip USE_SCORECARD_CACHE=false (or delete it).
2. Redeploy.
3. Wait for READY.
4. navigate to any KOL detail page.
5. ASSERT: page still loads (slower, via legacyCompute, but no 5xx).
6. Re-set USE_SCORECARD_CACHE=true and redeploy.
7. Verify step T3.1 again.
```

**Pass:** Rollback is clean; re-enable restores the cache path.

**Why run this drill:** Confirms the legacy path still works and hasn't bit-rotted. If the flag is ever needed as an emergency kill-switch, we've verified it works.

---

## Tier 4 — 48-hour soak (passive monitoring)

### T4.1: Daily log scan

For 2 consecutive days after the flag flip, run T2.1 (504 check) once per day.

**Pass:** Still zero 504s on win-rate / scorecard endpoints.

### T4.2: Cache invalidation smoke

Any time a new post is ingested over the 48 h, the scorecard invalidation hook (`invalidateScorecardsAfterPostWrite`) should fire + `waitUntil`-enqueued recompute should land.

Verification:
```sql
SELECT kol_id, computed_at, stale
FROM kol_scorecard_cache
ORDER BY computed_at DESC
LIMIT 5;
```

**Pass:** Recently posted-to KOLs show recent `computed_at` timestamps with `stale = FALSE`. If `stale` stays TRUE for > 5 min after a post ingestion, the `waitUntil` enqueue is failing silently — regress to D3 design and fix.

---

## Failure Modes & Rollback

| Symptom | Action |
|---|---|
| Tier 1 fails (backfill incomplete) | Re-run backfill script targeted at missing IDs. |
| Tier 2.1 fails (504s still appearing) | Confirm Vercel deployment includes the new env vars (check deployment's "Environment Variables" tab). If missing, redeploy. |
| Tier 3.2 fails (cold-KOL doesn't self-heal) | `waitUntil` isn't firing. Inspect runtime logs for the compute error. As a workaround, re-run backfill; as a fix, patch the `enqueue` function. |
| Unexpected errors on any endpoint | Roll back: set `USE_SCORECARD_CACHE=false` in Vercel + redeploy. Takes ~2 min. Code path reverts to `legacyCompute` which was production-stable before today. |

**Hard rollback:** if the rollout causes user-visible regressions, flip the flag off. Do NOT revert the code changes — the `waitUntil` delta is dormant when the flag is off and safe to leave deployed.
