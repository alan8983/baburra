## Why

Browser validation of Gooaye 股癌's KOL detail page (`/kols/b7a958c4…`) on 2026-04-26 found three independent bugs stacking into a single "the scrape didn't work" experience for the user:

1. The page renders only the latest 20 posts (header reads "文章數: 138" but the per-stock NVDA card says "共 18 篇文章" — DB has 126 NVDA posts).
2. The scorecard cache for that KOL was 24 h+ stale and the read-through fire-and-forget recompute never landed; even after a manual recompute the per-stock NVDA bucket is `total: 0` because the 5 s per-stock Tiingo timeout in `computeKolScorecard` rejects before the price-repo's stale-cache fallback returns.
3. Both bugs were undetectable by any existing automated check — the data is correct in Postgres, the page is "running fine", and the user only finds out by opening the page after a scrape.

The user explicitly asked for both a fix AND a Quality-Assurance gate so this class of mismatch never ships to a fresh page-load again.

## What Changes

- **Fix the 20-post pagination cap on the KOL detail page** so per-stock breakdown, sentiment markers, and post lists reflect the full set of posts the KOL has, not the latest 20. (Issue 1.)
- **Trigger a synchronous scorecard recompute at the end of `completeScrapeJob`** so the cache is warm before the next page-load instead of relying on the lossy fire-and-forget read-through path. (Issue 2, half a.)
- **Bump `COMPUTE_TIMEOUT_MS` (or remove the per-stock race) inside `computeKolScorecard`** so the price repo's stale-cache fallback has time to return real candles instead of empty arrays that classify every sample as `excluded`. (Issue 2, half b.)
- **Add a CLI invariant checker `scripts/check-kol-consistency.ts`** that exits non-zero with a printed diff when any of these invariants fails for a given kolId:
  - I-1 `kols.post_count` denorm equals `COUNT(posts WHERE kol_id=…)`
  - I-2 `kol_scorecard_cache.post_count` equals that count, AND `stale=false`, AND `now() - computed_at < 12 h`
  - I-3 For every stock that has ≥3 posts for this KOL, `bucketsByStock[stockId].day30.total ≥ 1`
  - I-4 `listPosts({kolId, limit: 1000}).total === kols.post_count`
- **Wire the consistency checker into three places**: tail of every Gooaye scrape script (`scrape-guyi-podcast-ep501-600.ts`, `scrape-gooaye-yt-601-650.ts`, `retry-gooaye-failed*.ts`), the existing `validate-podcast-pipeline-with-gooaye/tasks.md` validation hook, and a Vitest spec covering at least the seeded test KOL.
- **Add a Playwright e2e** that loads `/kols/{seededKolId}`, asserts the per-stock count in the DOM matches a SQL probe, and asserts the win-rate ring is not "—" after any computing-state polling settles.

## Capabilities

### New Capabilities
<!-- none — this change extends existing capabilities -->

### Modified Capabilities

- `qa-standards`: adds the **KOL detail page consistency invariants** (I-1 … I-4) and the requirement that scrape-completion hooks must leave the cache fresh and the page renderable end-to-end, not just the DB consistent. Adds the requirement that scrape scripts MUST exit non-zero on consistency-check failure.
- `repository-contracts`: adds the post-`completeScrapeJob` requirement that the scorecard cache MUST be recomputed synchronously before the job is reported as complete; tightens the `computeKolScorecard` timeout contract so per-stock fetches respect the price repo's stale-cache fallback semantics. Adds the contract that `useKolPosts` callers on the detail page MUST receive the full post set (capped at 1000) so the in-memory aggregation reflects the same universe as the cache compute.

## Impact

- **Code (small)**:
  - `src/hooks/use-kols.ts` — `useKolPosts` default limit / explicit `limit` plumbed from `KolDetailPage`.
  - `src/app/(app)/kols/[id]/page.tsx` — pass `limit: 1000` (or whatever bound design.md settles on).
  - `src/domain/services/profile-scrape.service.ts` — synchronous `await computeKolScorecard(kolId)` after `completeScrapeJob`.
  - `src/domain/services/scorecard.service.ts` — bump or strip `COMPUTE_TIMEOUT_MS`.
  - `scripts/check-kol-consistency.ts` (new).
  - `scripts/scrape-guyi-podcast-ep501-600.ts`, `scripts/scrape-gooaye-yt-601-650.ts`, `scripts/retry-gooaye-failed.ts`, `scripts/retry-gooaye-failed-v2.ts` — append consistency check.
  - `e2e/kol-detail.spec.ts` (new Playwright spec).
  - `src/scripts/__tests__/check-kol-consistency.test.ts` (new Vitest wrapper).
- **Data**: no migration, no schema change. The Gooaye cache has already been recomputed once via `scripts/backfill-gooaye-scorecard.ts`; the timeout fix lets that recompute land non-empty.
- **APIs**: response shape unchanged. `GET /api/kols/[id]/posts` will return larger payloads when the page asks for them; we document the new upper bound.
- **Dependencies**: none added.
- **Not affected**: `post_stocks.sentiment` NULL backfill (separate change `backfill-per-stock-sentiment`), Tiingo rate-limit architecture (broader work; only the timeout knob is touched here), the fire-and-forget compute pattern itself (still used by the read-through path; the change just makes scrape-completion no longer rely on it).
