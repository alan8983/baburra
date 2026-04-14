## Tasks

### 1. Schema + migrations
- [x] 1.1 Create migration `supabase/migrations/<ts>_add_win_rate_cache_tables.sql` with `volatility_thresholds` and `post_win_rate_samples` tables + indexes + FK + CHECK constraints per design D1
- [ ] 1.2 Preview with `supabase db push --dry-run -p "$SUPABASE_DB_PASSWORD"`; confirm with user
- [ ] 1.3 Apply with `supabase db push -p "$SUPABASE_DB_PASSWORD"`
- [ ] 1.4 Regenerate types: `supabase gen types typescript --linked --schema public > src/infrastructure/supabase/database.types.ts`

### 2. Classifier versioning
- [x] 2.1 Add `export const CLASSIFIER_VERSION = 1` to `src/domain/calculators/win-rate.calculator.ts`
- [x] 2.2 Update calculator barrel export

### 3. Repositories
- [x] 3.1 Create `src/infrastructure/repositories/volatility-threshold.repository.ts` with:
  - `getThreshold(ticker, periodDays, asOfDate)` → row or null
  - `upsertThreshold(row)` → void (ON CONFLICT DO UPDATE)
- [x] 3.2 Create `src/infrastructure/repositories/win-rate-sample.repository.ts` with:
  - `loadSamplesByPostIds(postIds[], classifierVersion)` → keyed by `post_id:stock_id:period_days`
  - `loadSamplesByPostId(postId, classifierVersion)` → same shape
  - `upsertSamples(rows[])` → batch insert with ON CONFLICT DO UPDATE
  - `invalidateByPost(postId)` → DELETE WHERE post_id
  - `invalidateByPostStock(postId, stockId)` → narrower DELETE
  - `clearByTicker(ticker, period?)` → for ops; uses stocks.ticker via join or ticker column

### 4. Persistent VolatilityProvider
- [x] 4.1 Create `src/infrastructure/providers/persistent-volatility.provider.ts` implementing `VolatilityProvider`
- [x] 4.2 `getSeries` delegates to existing `StockPriceVolatilityProvider`
- [x] 4.3 `getMarket` delegates to existing logic
- [x] 4.4 Add a `getCachedThreshold(ticker, periodDays, asOfDate)` escape hatch used by `getVolatilityThreshold` to short-circuit compute
- [x] 4.5 Modify `getVolatilityThreshold` in `volatility.calculator.ts` to accept an optional `cachedThreshold` arg; if provided, skip compute and return it as-is
- [x] 4.6 Unit tests for the provider: cache hit returns without computing; miss computes + upserts

### 5. Service rewrite
- [x] 5.1 Extend `computeWinRateStats` to accept an optional `sampleRepo: WinRateSampleRepository`
- [x] 5.2 When `sampleRepo` is present, read cached samples for the post IDs up front; only classify missing tuples; upsert fresh rows before aggregating
- [x] 5.3 Add `bucketsByStock: Record<stockId, WinRateStats>` aggregation helper
- [x] 5.4 Update existing service tests; add new tests for the cache-hit path (zero provider calls when all cached) and the mixed path (provider called only for missing tuples)

### 6. API route wiring
- [x] 6.1 `src/app/api/kols/[id]/win-rate/route.ts`: inject `PersistentVolatilityProvider` + `WinRateSampleRepository`; drop the parallel stock-price prefetch loop (samples-first pipeline doesn't need all candles pre-loaded, only for missing classifications); return `bucketsByStock` in response
- [x] 6.2 `src/app/api/stocks/[ticker]/win-rate/route.ts`: same provider + repo wiring
- [x] 6.3 `src/app/api/dashboard/route.ts`: same; keep the existing behavior where only the last 5 posts feed `pulseStats`
- [x] 6.4 Update the `WinRateStats` response type in the calculator + `src/hooks/use-kols.ts` to include the optional `bucketsByStock` field

### 7. Invalidation hooks
- [x] 7.1 Locate sentiment-write paths: `src/infrastructure/repositories/post.repository.ts` (grep for `sentiment:` or `.update({ sentiment`) and the reanalyze API route
- [x] 7.2 After each successful sentiment update, call `winRateSampleRepo.invalidateByPost(postId)` (fire-and-forget, log but don't throw on repo errors)
- [x] 7.3 Integration test: update a post's sentiment via the repo → assert rows for that post are gone from `post_win_rate_samples`

### 8. Per-stock UI re-enablement
- [x] 8.1 In `src/app/(app)/kols/[id]/_components/kol-scorecard.tsx`, remove the "Sector breakdown removed" comment and add a small per-stock win-rate breakdown using `winRateStats.bucketsByStock` (or new prop)
- [x] 8.2 In `src/app/(app)/kols/[id]/page.tsx` `KolStockSection`, remove the "Per-(kol,stock) win rate display removed" comment and render a compact ring per stock from `bucketsByStock[stockId]`
- [x] 8.3 Confirm `BlurGate feature="win_rate_breakdown"` still gates the addition

### 9. Backfill script
- [x] 9.1 Create `scripts/backfill-win-rate-samples.ts` that pages posts in batches of 100, runs the samples-first pipeline for each batch, reports progress
- [x] 9.2 Accept a `--kol <id>` flag for targeted backfill and a `--dry-run` flag that only reports what would be computed
- [x] 9.3 Add a `scripts/README.md` entry documenting usage
- [ ] 9.4 Run against dev DB; spot-check a few KOLs' computed stats match the pre-cache API output within tolerance

### 10. Feature flag + rollout
- [x] 10.1 Add `USE_WIN_RATE_SAMPLE_CACHE` env flag; default ON in `.env.example`; default OFF in prod config until step 10.4
- [x] 10.2 Gate the persistent provider path in each API route on the flag; fall back to the stateless pipeline when OFF
- [ ] 10.3 Run backfill in prod
- [ ] 10.4 Flip the prod flag ON; monitor `/api/kols/[id]/win-rate` latency for a week
- [ ] 10.5 Remove the flag + legacy stateless path

### 11. Verify
- [x] 11.1 `npm run type-check` — pass
- [x] 11.2 `npm run lint` — pass
- [x] 11.3 `npm test` — new tests pass, no regressions
- [ ] 11.4 Manually hit `/api/kols/<gooaye-id>/win-rate` twice; second call should be sub-100ms
- [x] 11.5 Spot-check that `bucketsByStock` values sum consistently with the global bucket per period (covered by `win-rate.service.test.ts` "includeBucketsByStock returns a per-stock breakdown consistent with globals")
- [x] 11.6 Update `openspec/specs/data-models.md` with the two new tables (per CLAUDE.md docs rule)
