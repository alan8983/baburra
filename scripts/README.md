# Scripts

Ad-hoc tsx scripts for platform seeding, backfills, and one-off ops. Each
script loads `.env.local` via `dotenv/config` — make sure the required
credentials are populated (see `.env.example`) before running.

All scripts are designed to be idempotent where possible.

## `backfill-win-rate-samples.ts`

Populates `post_win_rate_samples` and `volatility_thresholds` for every post
so the persistent win-rate pipeline has warm rows to aggregate. Runs the same
service used by `/api/kols/[id]/win-rate`; already-cached tuples are
short-circuited, so reruns are safe.

```bash
# Full backfill
npx tsx scripts/backfill-win-rate-samples.ts

# Scoped to one KOL
npx tsx scripts/backfill-win-rate-samples.ts --kol <kolId>

# Dry-run — walks posts and reports counts without writing to Supabase
npx tsx scripts/backfill-win-rate-samples.ts --dry-run

# Custom batch size (default 50)
npx tsx scripts/backfill-win-rate-samples.ts --batch 100
```

Prereqs: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
`TIINGO_API_TOKEN` for any US tickers that still need candle fetch. TWSE
tickers use the public TWSE endpoint and do not need a token.

Spot-check a KOL's computed stats against the live API before and after the
backfill — the numbers should match within floating-point tolerance (the
classifier math has not changed).

## `backfill-scorecards.ts`

Pre-warms `kol_scorecard_cache` and `stock_scorecard_cache` for every KOL and
stock that has posts, so that the first user visit after a feature-flag flip is
a fast PK lookup (< 100 ms) rather than a cold Tiingo round-trip (10 s+).

Run this script **before** setting `USE_SCORECARD_CACHE=true` in Vercel to
avoid a thundering herd of concurrent computes on the first request wave.

```bash
# Backfill one KOL (by slug or UUID)
npx tsx scripts/backfill-scorecards.ts --kol gooaye

# Backfill all KOLs with posts
npx tsx scripts/backfill-scorecards.ts --kol all

# Backfill all KOLs AND all stocks they reference
npx tsx scripts/backfill-scorecards.ts --kol all --stocks

# Dry-run — prints what would be computed without touching the DB
npx tsx scripts/backfill-scorecards.ts --kol all --stocks --dry-run

# Resume an interrupted run — skip rows already at the current schema
npx tsx scripts/backfill-scorecards.ts --kol all --stocks --skip-warm
```

Each compute is followed by a row read-back; if the row isn't warm at the
current schema, the script retries up to 3 times with 2s/4s exponential
backoff. This covers transient Tiingo 429s, network blips, and Supabase
upsert failures without leaving silently-broken rows behind.

`--skip-warm` checks `classifier_version`, `stale`, and the JSONB schema
sentinel (a 6-bin `histogram`) against `isCurrentBlobSchema` from the cache
repository, so re-runs only do remaining work.

Production usage (set env vars first):

```bash
export SUPABASE_SERVICE_ROLE_KEY=<prod service role key>
export NEXT_PUBLIC_SUPABASE_URL=<prod supabase url>
export TIINGO_API_TOKEN=<prod Tiingo token>

# Preview
npx tsx scripts/backfill-scorecards.ts --kol all --stocks --dry-run

# Live run (~5–10 min for 9 KOLs + 194 stocks)
npx tsx scripts/backfill-scorecards.ts --kol all --stocks
```

Prereqs: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
`TIINGO_API_TOKEN`. Script iterates sequentially (not in parallel) to respect
Tiingo rate limits (2400 req/hour on Free tier).

## `check-kol-consistency.ts`

CLI invariant checker for the KOL detail page. Asserts the four invariants
from `openspec/changes/kol-detail-consistency-qa-gate` (Q1) for a given kolId
and exits non-zero with a printed diff on any failure. This is the **QA gate**
that catches "DB is consistent but the page is broken" mismatches.

```bash
# Human-readable output
npx tsx scripts/check-kol-consistency.ts <kolId>

# Machine-readable
npx tsx scripts/check-kol-consistency.ts <kolId> --json
```

Invariants checked:

| ID | Assertion |
|----|-----------|
| I-1 | `kol_stats.post_count` denorm matches `COUNT(posts)` |
| I-2 | `kol_scorecard_cache.post_count` matches, `stale=false`, `now() - computed_at < 12 h`, classifier_version current |
| I-3 | For every stock with ≥3 posts for this KOL, `buckets_by_stock[stockId].day30.total ≥ 1` (short-circuits to pass when `volatility_thresholds` is empty for the ticker) |
| I-4 | `listPosts({kolId, limit: 1000}).total === kol_stats.post_count` |

Prereqs: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Runs in
seconds — no external API calls.

### Pattern: tail-call from any KOL-scope script

**Every script that creates or refreshes posts for a specific KOL MUST tail-call
this checker** and propagate its exit code. See `scrape-guyi-podcast-ep501-600.ts`,
`scrape-gooaye-yt-601-650.ts`, `retry-gooaye-failed.ts`, `retry-gooaye-failed-v2.ts`
for the canonical pattern. Skeleton:

```ts
main()
  .then(async () => {
    if (kolId) {
      const { checkKolConsistency } = await import('./check-kol-consistency');
      const report = await checkKolConsistency(kolId);
      if (!report.pass) {
        for (const r of report.results) {
          if (!r.pass) console.error(`  ${r.invariant}:`, JSON.stringify(r.detail));
        }
        process.exit(1);
      }
    }
  })
  .catch((err) => { console.error('Fatal:', err); process.exit(1); });
```

If your script bypasses the profile-scrape pipeline (e.g. calls `processUrl`
directly), also call `computeKolScorecard(kolId)` before the consistency
check — the synchronous post-completion recompute (R11) only fires inside
`processJobBatch`.
