## ADDED Requirements

### Requirement: kol_scorecard_cache table stores per-KOL aggregated metrics

The database SHALL define a table `kol_scorecard_cache` with columns `kol_id UUID PRIMARY KEY REFERENCES kols(id) ON DELETE CASCADE`, `classifier_version SMALLINT NOT NULL`, `day5 JSONB NOT NULL`, `day30 JSONB NOT NULL`, `day90 JSONB NOT NULL`, `day365 JSONB NOT NULL`, `buckets_by_stock JSONB NOT NULL`, `post_count INTEGER NOT NULL`, `last_post_at TIMESTAMPTZ`, `computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `stale BOOLEAN NOT NULL DEFAULT FALSE`. A partial index on `(stale) WHERE stale = TRUE` SHALL support efficient cron scans for rows needing recompute.

#### Scenario: Table exists with correct schema after migration

- **WHEN** the migration adding `kol_scorecard_cache` runs
- **THEN** the table SHALL exist with the listed columns, the partial index, and the `ON DELETE CASCADE` on `kol_id`

### Requirement: stock_scorecard_cache table stores per-Stock aggregated metrics

The database SHALL define a table `stock_scorecard_cache` with the same column shape as `kol_scorecard_cache` except that the primary key is `stock_id UUID REFERENCES stocks(id) ON DELETE CASCADE` and the per-entity breakdown column is named `buckets_by_kol JSONB NOT NULL`.

#### Scenario: Table exists with correct schema after migration

- **WHEN** the migration adding `stock_scorecard_cache` runs
- **THEN** the table SHALL exist with the listed columns, the partial index on `stale`, and the `ON DELETE CASCADE` on `stock_id`

## MODIFIED Requirements

### Requirement: post_win_rate_samples stores raw and classified per-sample metrics

The table `post_win_rate_samples` SHALL persist one row per `(post_id, stock_id, period_days, classifier_version)` tuple. Each row SHALL hold the classification `outcome`, the σ-normalized `excess_return`, the `threshold_value` and `threshold_source`, and — as part of this change — the raw `price_change NUMERIC(14, 8)` and `price_change_status TEXT CHECK (price_change_status IN ('pending', 'no_data', 'value'))`. The `price_change_status` column SHALL default to `'value'` for rows predating this change and is populated by a one-off backfill; new rows SHALL always set it explicitly during classification.

#### Scenario: New sample row carries price_change and status

- **WHEN** classification writes a new sample row
- **THEN** the row SHALL populate both `price_change` (nullable when status is `'pending'` or `'no_data'`) and `price_change_status` explicitly

#### Scenario: Backfill repopulates historical rows

- **WHEN** the backfill job runs against pre-existing rows with `price_change IS NULL`
- **THEN** it SHALL compute `price_change` from the associated candle data and update the row, leaving `price_change_status` at its default `'value'` unless the recompute determines otherwise
