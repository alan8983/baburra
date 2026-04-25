## Context

`stock_prices` is the shared price cache populated by the Tiingo and TWSE clients via `src/infrastructure/repositories/stock-price.repository.ts`. The schema (migration `001_initial_schema.sql:135`) declared `volume BIGINT`, which works for equities (whole-share volumes) but rejects fractional values from Tiingo's crypto endpoint, which reports volume as fractional base-currency units (e.g. `12771.36822284` BTC).

Symptom in production logs (during §8 S4 Gooaye scrape, commit 14f171e):

```
Failed to write prices to cache: invalid input syntax for type bigint: "12771.36822284"
Failed to write prices to cache: invalid input syntax for type bigint: "99961.56929834"
```

Repository code at `src/infrastructure/repositories/stock-price.repository.ts:141` performs an `upsert`. The error is logged but swallowed (fire-and-forget at line 321). Reads still succeed via the stale-cache fallback, so the user-facing impact is just: every crypto ticker re-fetches Tiingo on every request, and the error is logged on every scrape.

## Goals / Non-Goals

**Goals:**
- Make `stock_prices.volume` accept fractional values from crypto providers without lossy rounding.
- Preserve all existing integer volume rows untouched.
- Add a regression test that fails before the migration and passes after.

**Non-Goals:**
- Widening the price columns (`open/high/low/close` are `DECIMAL(12,4)` — already adequate; BTC at ~$100k fits comfortably and is not the failing column).
- Backfilling the missed crypto volumes from Tiingo — those will be filled organically on the next scrape after the fix lands.
- Reworking the repository's swallow-on-error behaviour for cache writes — that's an orthogonal observability concern (could be filed as a follow-up).

## Decisions

### Use `NUMERIC(20, 8)` for volume

PostgreSQL `NUMERIC(20, 8)` gives 12 digits before the decimal point and 8 after — i.e. up to `999,999,999,999.99999999`. This handles:

- Crypto volumes with sub-satoshi precision (8 decimals matches BTC's smallest unit).
- US/TW equity volumes well into the trillions of shares (current market-wide daily volume is in the 10–20 billion range).

**Alternatives considered:**

- `DOUBLE PRECISION` — rejected. Floats lose precision for financial values; round-trip of `12771.36822284` is not guaranteed bit-exact.
- `NUMERIC(30, 10)` — rejected. Overkill; the extra storage and unboundedness signal "this column is unbounded" which it isn't.
- Keep `BIGINT` and round in repository code — rejected. Lossy. The cache would diverge from the upstream provider, which would silently corrupt any future analysis that uses volume.

### Migration is `ALTER COLUMN ... TYPE NUMERIC(20, 8) USING volume::NUMERIC`

PostgreSQL allows widening `BIGINT → NUMERIC` directly with a `USING` clause. This is an in-place, backwards-compatible change — existing rows remain valid integer values stored under the new type. No data movement needed.

The table is a cache (RLS-restricted, populated by service-role only), so a brief `AccessExclusiveLock` during the alter is acceptable; reads during the migration window fall through to stale-cache or a fresh Tiingo fetch.

### Repository code unchanged

`DbStockPriceRow.volume: number | null` already accepts decimals. The Supabase JS client returns PG `NUMERIC` columns as JavaScript numbers when the value fits within `Number.MAX_SAFE_INTEGER` precision — at the magnitudes we use (≤ ~12 significant digits), this is safe. No change needed at the TypeScript layer.

### Regression test approach

Add a unit test that:
1. Inserts a stock + price row with `volume = 99961.56929834` via the admin client.
2. Reads it back and asserts the value round-trips with the same precision.

This is an integration test against a real Supabase instance (consistent with existing repository tests in the codebase). It will fail before the migration is applied and pass after.

## Risks / Trade-offs

- **Risk:** Some existing query paths assume `volume` is a JS integer (e.g. `Number.isInteger` checks, integer-only formatting). → **Mitigation:** grep for `volume` usages in `src/`. The chart-data path (`dbRowsToChartData` at line 151) treats it as an opaque `number` and passes it to TradingView's `VolumeData`, which accepts decimals.
- **Risk:** PG `NUMERIC` returned as string by some drivers. → **Mitigation:** Supabase JS client (`@supabase/postgrest-js`) returns small numerics as JS numbers. The regression test verifies round-trip.
- **Trade-off:** Slightly larger row footprint (`NUMERIC(20,8)` is variable-width, ~9–13 bytes vs `BIGINT`'s 8 bytes). For a cache table of < 1M rows, the storage delta is negligible.

## Migration Plan

1. **Apply migration locally:** `supabase db push --dry-run -p "$SUPABASE_DB_PASSWORD"` to preview, then `supabase db push -p "$SUPABASE_DB_PASSWORD"`.
2. **Regenerate types:** `supabase gen types typescript --linked --schema public > src/infrastructure/supabase/database.types.ts`.
3. **Type-check:** `npm run type-check`.
4. **Run regression test:** `npx vitest run src/infrastructure/repositories/stock-price.repository.test.ts`.
5. **Deploy:** Migration is idempotent (`ALTER COLUMN ... TYPE` is a no-op if already widened) and forward-only; no special rollout sequencing needed.

**Rollback:** Reverting the column type back to `BIGINT` would fail if any fractional values have been written by the time of rollback. If a rollback is needed before any crypto cache writes succeed, an inverse migration can `ALTER COLUMN volume TYPE BIGINT USING volume::BIGINT` (this rounds, so it's lossy if fractional rows exist). In practice, rollback should not be needed.
