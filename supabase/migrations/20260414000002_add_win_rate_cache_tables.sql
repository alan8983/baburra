-- Persist win-rate classification samples + per-(ticker,period,asOfDate) σ
-- thresholds so the win-rate API can aggregate via SQL instead of recomputing
-- every request.  See openspec/changes/persist-win-rate-samples/design.md (D1).

-- ── volatility_thresholds ────────────────────────────────────────────────────
-- Durable L2 cache for the in-memory VolatilityCache.  Keyed on
-- (ticker, period_days, as_of_date); the value is deterministic for that
-- tuple because σ is computed from history strictly before as_of_date.
CREATE TABLE IF NOT EXISTS volatility_thresholds (
  ticker        TEXT NOT NULL,
  period_days   SMALLINT NOT NULL CHECK (period_days IN (5, 30, 90, 365)),
  as_of_date    DATE NOT NULL,
  value         NUMERIC(14, 10) NOT NULL,
  source        TEXT NOT NULL CHECK (source IN ('ticker', 'index-fallback')),
  sample_size   INTEGER NOT NULL,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ticker, period_days, as_of_date)
);

CREATE INDEX IF NOT EXISTS volatility_thresholds_ticker_idx
  ON volatility_thresholds (ticker);

-- ── post_win_rate_samples ────────────────────────────────────────────────────
-- One row per (post, stock, period, classifier_version).  Holds the full
-- classification result so the win-rate API can aggregate in SQL without
-- joining back to volatility_thresholds or posts.
CREATE TABLE IF NOT EXISTS post_win_rate_samples (
  post_id             UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  stock_id            UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  period_days         SMALLINT NOT NULL CHECK (period_days IN (5, 30, 90, 365)),
  classifier_version  SMALLINT NOT NULL DEFAULT 1,
  outcome             TEXT NOT NULL CHECK (outcome IN ('win', 'lose', 'noise', 'excluded')),
  excess_return       NUMERIC(14, 8),
  threshold_value     NUMERIC(14, 10),
  threshold_source    TEXT CHECK (threshold_source IN ('ticker', 'index-fallback')),
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, stock_id, period_days, classifier_version)
);

CREATE INDEX IF NOT EXISTS post_win_rate_samples_post_id_idx
  ON post_win_rate_samples (post_id);
CREATE INDEX IF NOT EXISTS post_win_rate_samples_stock_id_idx
  ON post_win_rate_samples (stock_id);
CREATE INDEX IF NOT EXISTS post_win_rate_samples_version_idx
  ON post_win_rate_samples (classifier_version);

COMMENT ON TABLE volatility_thresholds IS
  'L2 cache of per-(ticker, period, as_of_date) 1σ thresholds. Durable across serverless cold starts.';
COMMENT ON TABLE post_win_rate_samples IS
  'Persisted per-(post, stock, period) win-rate classification. Aggregated via SQL/JS by the win-rate API.';
