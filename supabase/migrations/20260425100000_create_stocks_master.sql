-- Authoritative ticker registry. Seeded from TWSE/TPEX (TW), Tiingo
-- supported_tickers (US), and a hand-curated crypto list. The validation
-- layer (resolveStock) looks up here; createStock refuses unknown tickers.
-- The FK from stocks.ticker is added in a later migration once existing
-- garbage rows have been cleaned up by scripts/cleanup-fabricated-stocks.ts.
-- Composite PK on (ticker, market) is intentional: cross-market ticker
-- collisions exist (e.g. 'STX' is both Seagate Technology in US-equity AND
-- Stacks in crypto). The resolver always queries with (ticker, market), so
-- composite is the right key — a single-column PK on `ticker` would let one
-- market silently shadow the other on re-seed.
CREATE TABLE IF NOT EXISTS stocks_master (
  ticker text NOT NULL,
  name text NOT NULL,
  market text NOT NULL CHECK (market IN ('US', 'TW', 'CRYPTO')),
  source text NOT NULL CHECK (source IN ('twse', 'tpex', 'tiingo', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, market)
);

CREATE INDEX IF NOT EXISTS idx_stocks_master_market ON stocks_master(market);
CREATE INDEX IF NOT EXISTS idx_stocks_master_name ON stocks_master(name);

-- Updated_at trigger so re-seeds bump the timestamp without losing created_at.
CREATE OR REPLACE FUNCTION set_stocks_master_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stocks_master_updated_at ON stocks_master;
CREATE TRIGGER trg_stocks_master_updated_at
  BEFORE UPDATE ON stocks_master
  FOR EACH ROW EXECUTE FUNCTION set_stocks_master_updated_at();

COMMENT ON TABLE stocks_master IS
  'Authoritative ticker registry. resolveStock validates AI-extracted tickers against this table before persistence in stocks.';
COMMENT ON COLUMN stocks_master.source IS
  'Origin of the row: twse (TWSE OpenAPI), tpex (TPEX OpenAPI), tiingo (supported_tickers.csv), manual (curated crypto + lazy-add fallbacks).';
