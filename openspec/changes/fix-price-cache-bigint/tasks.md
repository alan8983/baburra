## 1. DB migration

- [x] 1.1 Create new migration file `supabase/migrations/20260425000002_widen_stock_prices_volume.sql` containing `ALTER TABLE stock_prices ALTER COLUMN volume TYPE NUMERIC(20, 8) USING volume::NUMERIC;`
- [x] 1.2 Preview migration: dry-run via canonical CLI failed (stale `SUPABASE_DB_PASSWORD` in `.env.local` — SASL auth rejected). Verified target state via Supabase MCP `execute_sql` instead: pre-migration `volume` was `bigint`, confirming the bug.
- [x] 1.3 Apply migration (with user confirmation): applied via Supabase MCP `apply_migration` (uses `SUPABASE_ACCESS_TOKEN`); post-migration `information_schema.columns` confirms `volume` is now `numeric(20, 8)`.
- [x] 1.4 Regenerate Supabase types: regenerated via Supabase MCP `generate_typescript_types`, written to `src/infrastructure/supabase/database.types.ts`, then formatted with `npx prettier --write`. NUMERIC and BIGINT both map to `number | null` in the generated row types — file content is byte-identical for the `volume` field, but regen captures any other drift since the last run.
- [x] 1.5 Verify types still compile: `npm run type-check` — clean (no errors).

## 2. Repository regression test

- [x] 2.1 Add a regression test (location: existing test file `src/infrastructure/repositories/__tests__/stock-price.repository.test.ts`, matching project convention — corrected from the `<repo>.test.ts` location originally written in this task). Test mocks the supabase client and asserts the upsert payload contains `volume = 99961.56929834` and `12771.36822284` verbatim (with `Number.isInteger === false` belt-and-braces), and that `result.volumes[*].value` surfaces the fractional value unchanged.
- [x] 2.2 Run the test alone to confirm it passes: `npx vitest run src/infrastructure/repositories/__tests__/stock-price.repository.test.ts` — all 12 tests passed (11 existing + 1 regression).
- [x] 2.3 Run the full suite: `npm test` — 58 files, 945 tests, all passing.

## 3. Code-search verification

- [x] 3.1 Grep for any `Number.isInteger` / integer assumptions on `volume` in `src/`. Confirm none are violated. — No `Number.isInteger` / `Math.floor|round|trunc` / `parseInt` calls applied to `volume` anywhere. The only `parseInt`/`Math.round` hits in `src/` are unrelated (pagination, durations, retry-after headers, year parsing).
- [x] 3.2 Confirm `dbRowsToChartData` (`src/infrastructure/repositories/stock-price.repository.ts:151`) and any other consumer treat `volume` as an opaque number. — Confirmed:
  - `dbRowsToChartData` line 170: `value: row.volume ?? 0` → assigns to TradingView's `VolumeData.value: number` (accepts decimals).
  - `transformTiingoRows` line 197: `value: row.volume` → same target type.
  - `recolorVolumes` / `aggregateVolumes` (`src/components/charts/candle-aggregator.ts`) only set color, never read or transform the numeric value.
  - `tiingo.client.ts:117` passes `volume: row.volume` straight through, no transform.

## 4. Docs + archive

- [x] 4.1 Update `openspec/specs/data-models/spec.md` "Recent Schema Changes" table to reference the new migration date.
- [ ] 4.2 Run `/opsx:archive fix-price-cache-bigint` after merge to move the change into `openspec/changes/archive/`. **Deferred to user** — should be run after the change is merged to main, not before.
