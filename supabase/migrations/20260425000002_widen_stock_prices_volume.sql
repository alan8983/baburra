-- =====================================================================
-- Widen stock_prices.volume from BIGINT to NUMERIC(20, 8)
--
-- Why: Tiingo's crypto endpoint returns fractional `volume` (fractional
-- base-currency units traded, e.g. 12771.36822284 BTC). The previous
-- BIGINT type caused PostgreSQL to reject every crypto cache write
-- with `invalid input syntax for type bigint`. The repository
-- (src/infrastructure/repositories/stock-price.repository.ts) logged
-- and swallowed the error, so reads kept working via stale-cache
-- fallback, but every scrape re-fired the error and crypto tickers
-- never received a fresh cache write.
--
-- Backwards-compatible: existing integer values are preserved exactly
-- by the implicit BIGINT -> NUMERIC cast.
-- =====================================================================

ALTER TABLE stock_prices
  ALTER COLUMN volume TYPE NUMERIC(20, 8) USING volume::NUMERIC;
