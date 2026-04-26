## ADDED Requirements

### Requirement: stock_prices.volume column accepts fractional values

The `stock_prices.volume` column SHALL be typed as `NUMERIC(20, 8)` so that fractional volume values reported by crypto price providers (e.g. Tiingo's crypto endpoint) round-trip without loss of precision.

The column MUST NOT be typed as `BIGINT` or any other integer-only type. Repository writes of fractional volumes (e.g. `12771.36822284`, `99961.56929834`) MUST succeed without a `invalid input syntax for type bigint` error.

#### Scenario: Crypto fractional volume round-trips through the cache

- **WHEN** `stock-price.repository.ts` upserts a `stock_prices` row with `volume = 99961.56929834` for a crypto stock (e.g. BTC)
- **THEN** the upsert succeeds without error
- **AND** a subsequent read of the same `(stock_id, date)` returns `volume = 99961.56929834` with full precision

#### Scenario: Existing integer volumes remain unchanged

- **WHEN** the column-widening migration is applied to a table with existing rows (e.g. US equity rows with integer volumes like `1234567`)
- **THEN** the existing rows retain their original numeric values
- **AND** subsequent reads return the same integer values
