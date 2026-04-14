## Design Decisions

### 1. Parallel stock-price fetching

**Decision**: Mirror the `enrichPostsWithPriceChanges` pattern — `Promise.allSettled` with a 5 s per-stock timeout.

**Rationale**: The posts API already uses this pattern successfully. Reusing the same approach keeps behavior consistent and avoids inventing a new concurrency model. The 5 s timeout prevents a single slow ticker from blocking the entire batch. Failed/timed-out tickers produce empty candle arrays, which downstream code already handles (price changes default to `null` / `no_data`).

**File**: `src/app/api/kols/[id]/win-rate/route.ts`

### 2. `^TWII` index ticker seeding

**Decision**: Add a SQL migration that inserts a `stocks` row for `^TWII` with `market = 'TW'`.

**Alternatives considered**:
- *Infer market from ticker format in `getStockPrices`*: More general but couples the price repository to ticker naming conventions. Would need maintenance as new markets are added.
- *Special-case index tickers in the volatility provider*: Tight coupling between the provider and specific ticker symbols.
- *Use `getStockPriceSeries` directly with TWSE client*: Would require a second code path and bypass the existing cache infrastructure.

**Rationale**: A stocks row is the simplest fix. `resolveStock('^TWII')` will return `{ id, market: 'TW' }`, and the existing `getStockPrices` routing logic (`market === 'TW' → fetchTwsePrices`) takes over. The row is inert for UI purposes (it won't appear in user-facing stock lists unless posts reference it). `SPY` already follows this pattern.

**File**: `supabase/migrations/<timestamp>_seed_twii_index.sql`

### 3. Profile repository resilience

**Decision**: Catch column-not-found errors in `getProfile` and retry with a reduced column list (omitting `default_win_rate_period`), returning the hardcoded default for that field.

**Rationale**: The profile API should not crash just because a migration hasn't been applied yet. This is a defense-in-depth measure. Once the migration is applied, the retry path is never hit. No need to change the select query permanently — it's correct; the DB just needs to catch up.

**File**: `src/infrastructure/repositories/profile.repository.ts`

## Data Flow (After Fix)

```
KOL Detail Page
  └─ KolScorecard
       ├─ useKolWinRate(kolId) → GET /api/kols/:id/win-rate
       │    1. listPosts({ kolId, limit: 1000 })
       │    2. Promise.allSettled: getStockPrices(ticker) × N  ← NOW PARALLEL
       │    3. computeWinRateStats(posts, provider)
       │         └─ getVolatilityThreshold(ticker, period, asOfDate)
       │              └─ provider.getSeries('^TWII', ...)  ← NOW WORKS
       │    4. Return WinRateStats { day5, day30, day90, day365 }
       ├─ useProfile() → GET /api/profile
       │    └─ getProfile(userId)  ← NOW RESILIENT
       └─ WinRateRing(hitRate × 100)  ← NOW SHOWS VALUE
```
