## Why

During the §8 S4 Gooaye scrape (commit 14f171e), the Tiingo price-hydration path logged repeated `Failed to write prices to cache: invalid input syntax for type bigint: "12771.36822284"` errors. Tiingo's crypto endpoint returns fractional `volume` (fractional base-currency units traded), but `stock_prices.volume` is `BIGINT`, so PostgreSQL rejects every crypto row. The pipeline survives via stale-cache fallback, but every scrape re-fires the error and crypto tickers never get a fresh cache write.

## What Changes

- Widen `stock_prices.volume` from `BIGINT` to `NUMERIC(20, 8)` via a new migration. Backwards-compatible for existing integer values.
- Add a regression test that round-trips a fractional volume (e.g. `99961.56929834`) through `stock-price.repository.ts` to confirm the upsert succeeds.
- No change to the `volume: number` TypeScript shape — the failure was purely PostgreSQL-side type coercion.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `data-models`: `stock_prices.volume` column type changes from `BIGINT` to `NUMERIC(20, 8)` to accept fractional volumes from crypto providers.

## Impact

- **Code**: new migration `supabase/migrations/<timestamp>_widen_stock_prices_volume.sql`; regression test under `src/infrastructure/repositories/stock-price.repository.test.ts` (new file).
- **Schema**: `stock_prices.volume` column type widened. Existing rows preserved unchanged. Downstream readers (`DbStockPriceRow.volume: number | null`) unaffected — `NUMERIC` is returned as a JS number by the Supabase client at the magnitudes we use.
- **Tickers affected**: All crypto tickers (BTC, ETH, …) — they will now have working cache writes. Integer-volume equities (US/TW) unchanged.
- **No breaking changes**: API contracts, repository interfaces, and domain models are unchanged.
