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
