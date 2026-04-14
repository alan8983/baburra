-- Aggregated scorecard caches (Layer 3) on top of post_win_rate_samples (L2).
-- One row per KOL / Stock holds a pre-aggregated blob for every period plus
-- the per-entity breakdown. Read path is a single PK lookup; invalidation
-- flips `stale = TRUE` and enqueues a recompute.
--
-- See openspec/changes/persist-kol-scorecard-cache/design.md (D1, D2) for
-- the schema rationale and invalidation matrix.

-- ── post_win_rate_samples: extend with raw price_change ──────────────────────
-- Today the sample row only holds σ-normalized excess_return. To aggregate
-- Return server-side without re-reading candles, we also persist the raw
-- fractional price change and its resolution status (pending vs no_data vs
-- value). Existing rows default to 'value' — they wouldn't have been written
-- if classification had failed.
ALTER TABLE post_win_rate_samples
  ADD COLUMN IF NOT EXISTS price_change        NUMERIC(14, 8),
  ADD COLUMN IF NOT EXISTS price_change_status TEXT NOT NULL DEFAULT 'value'
    CHECK (price_change_status IN ('pending', 'no_data', 'value'));

COMMENT ON COLUMN post_win_rate_samples.price_change IS
  'Raw fractional price change over period_days (not σ-normalized). Null when price_change_status != ''value''.';
COMMENT ON COLUMN post_win_rate_samples.price_change_status IS
  'Resolution state: ''pending'' = window not yet closed; ''no_data'' = candles unavailable; ''value'' = populated.';

-- ── kol_scorecard_cache ─────────────────────────────────────────────────────
-- One row per KOL. Each dayN JSONB is a WinRateBucket + Return fields:
--   { winCount, loseCount, noiseCount, excludedCount, total, hitRate,
--     precision, sqr, avgExcessWin, avgExcessLose, avgReturn,
--     returnSampleSize, pendingCount, sufficientData, threshold }
-- buckets_by_stock: { [stockId]: { day5, day30, day90, day365 } }
CREATE TABLE IF NOT EXISTS kol_scorecard_cache (
  kol_id              UUID PRIMARY KEY REFERENCES kols(id) ON DELETE CASCADE,
  classifier_version  SMALLINT NOT NULL,
  day5                JSONB NOT NULL,
  day30               JSONB NOT NULL,
  day90               JSONB NOT NULL,
  day365              JSONB NOT NULL,
  buckets_by_stock    JSONB NOT NULL,
  post_count          INTEGER NOT NULL,
  last_post_at        TIMESTAMPTZ,
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stale               BOOLEAN NOT NULL DEFAULT FALSE
);

-- Partial index: cron scans only the stale rows.
CREATE INDEX IF NOT EXISTS kol_scorecard_cache_stale_idx
  ON kol_scorecard_cache (kol_id) WHERE stale = TRUE;

COMMENT ON TABLE kol_scorecard_cache IS
  'Layer 3 aggregate cache: one row per KOL with pre-computed per-period scorecard metrics (Return, Hit Rate, SQR, Precision, per-stock breakdown).';

-- ── stock_scorecard_cache ───────────────────────────────────────────────────
-- Symmetric row per Stock, aggregating across KOLs. buckets_by_kol mirrors
-- kol_scorecard_cache.buckets_by_stock.
CREATE TABLE IF NOT EXISTS stock_scorecard_cache (
  stock_id            UUID PRIMARY KEY REFERENCES stocks(id) ON DELETE CASCADE,
  classifier_version  SMALLINT NOT NULL,
  day5                JSONB NOT NULL,
  day30               JSONB NOT NULL,
  day90               JSONB NOT NULL,
  day365              JSONB NOT NULL,
  buckets_by_kol      JSONB NOT NULL,
  post_count          INTEGER NOT NULL,
  last_post_at        TIMESTAMPTZ,
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stale               BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS stock_scorecard_cache_stale_idx
  ON stock_scorecard_cache (stock_id) WHERE stale = TRUE;

COMMENT ON TABLE stock_scorecard_cache IS
  'Layer 3 aggregate cache: one row per Stock with pre-computed per-period community scorecard metrics, aggregated across all KOLs.';
