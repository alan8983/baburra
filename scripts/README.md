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
```

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
