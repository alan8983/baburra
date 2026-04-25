# Tasks — fix-ticker-mapping-quality

Sequence matters: §1 → §2 (seed) → §3 (validation layer) → §4 (cleanup) → §5 (FK enforcement) → §6 (specs/docs).

## §0. Diagnostic baseline

- [x] §0.1 Run `scripts/diagnose-ticker-mapping.ts` against prod and capture findings (committed in `be9c754`).
- [x] §0.2 Quantify scope via SQL: 90 suspicious stocks, 91 impacted post_stocks, 38 distinct posts (captured in `proposal.md`).

## §1. `stocks_master` table

- [ ] §1.1 Migration: `supabase/migrations/<ts>_create_stocks_master.sql` — create `stocks_master(ticker text PK, name text NOT NULL, market text NOT NULL CHECK (market IN ('US','TW','CRYPTO')), created_at timestamptz default now())`. **Do NOT** add the FK from `stocks` yet — that comes in §5 after cleanup.
- [ ] §1.2 `npm run type-check` after `supabase gen types`.

## §2. Seed registries

- [ ] §2.1 `scripts/build-tw-master.ts`: fetch TWSE 上市 (strMode=2) + TPEX 上櫃 (strMode=4) listings from `isin.twse.com.tw`, parse the HTML tables, output `src/infrastructure/data/tw_master.json` (`[{ ticker: '2330.TW', name: '台積電' }, ...]`). Idempotent; can re-run.
- [ ] §2.2 `scripts/build-us-master.ts`: download Tiingo's `supported_tickers.zip`, filter to US-listed equities + ADRs + ETFs, output `src/infrastructure/data/us_master.json`.
- [ ] §2.3 Hand-curate `src/infrastructure/data/crypto_master.json` (~50 entries: BTC, ETH, SOL, XRP, ADA, DOGE, MATIC, AVAX, LINK, …).
- [ ] §2.4 `scripts/seed-stocks-master.ts`: read all three JSON files and bulk-insert into `stocks_master` via `createAdminClient()`. ON CONFLICT DO UPDATE for re-runs.
- [ ] §2.5 Run §2.1, §2.2, §2.4 against prod. Verify row counts: TW ≥ 1,800; US ≥ 8,000; CRYPTO ≥ 30.

## §3. Validation layer (`resolveStock`)

- [ ] §3.1 `src/domain/services/ticker-resolver.service.ts`: implement `resolveStock(rawTicker: string, market: 'US'|'TW'|'CRYPTO') → Promise<{ticker,name,market}|null>` per design D2. Includes the normalization rules and the `stocks_master` lookup.
- [ ] §3.2 `src/domain/services/__tests__/ticker-resolver.service.test.ts`:
  - normalize: `'2357'` + `TW` → `'2357.TW'`; `'aapl'` + `US` → `'AAPL'`.
  - hit + name override: master has `2353.TW`/`宏碁`; `resolveStock('2353.TW','TW')` returns name `'宏碁'` regardless of input name.
  - miss: `resolveStock('CHROME','US')` → `null`.
  - non-numeric TW: `resolveStock('ASUS','TW')` → `null`.
  - empty/whitespace: returns `null`.
- [ ] §3.3 Modify `src/domain/services/import-pipeline.service.ts:678-702`: replace the existing loop body with `const resolved = await resolveStock(ticker.ticker, ticker.market); if (!resolved) continue;` then call `getStockByTicker(resolved.ticker) || createStock(resolved)`. Use `resolved.name` not `ticker.name`.
- [ ] §3.4 Update `src/infrastructure/repositories/stock.repository.ts::createStock` to refuse insertion if the ticker is not in `stocks_master` (defense-in-depth even before §5's FK lands; safe because §2 has populated the master).
- [ ] §3.5 Extend `src/domain/services/__tests__/import-pipeline.service.test.ts`: mock `resolveStock` to return `null` for one ticker; assert that ticker is dropped, post still creates with the surviving tickers, no exception.
- [ ] §3.6 `npm run type-check && npm test && npm run lint`.

## §4. Cleanup of existing 90 fabricated rows

- [ ] §4.1 `scripts/cleanup-fabricated-stocks.ts`:
  - identify the same 90 rows the diagnostic surfaces (use the SQL from `proposal.md`).
  - bucket into A (remap), B (delete), C (rename only) per design D3.
  - write a hardcoded remap map for the recoverable B-list (`MARVELL→MRVL`, `CONFLUENT→CFLT`, `CLOUDFLARE→NET`, `PALANTIR→PLTR`, `BROADCOM→AVGO`, `SALESFORCE→CRM`, `SERVICENOW→NOW`, `ORACLE→ORCL`, `AMAZON→AMZN`, `PAYPAL→PYPL`, `STELLANTIS→STLA`, `SEAGATE→STX`, `CORNING→GLW`, `CELSIUS→CELH`, `IMPINJ→PI`, `MARVELL→MRVL`, `2357→2357.TW`, `2408→2408.TW`, …).
  - default to `--dry-run`; require `--apply` to write.
  - log every action to `scripts/cleanup-fabricated-stocks.log`.
- [ ] §4.2 Run `--dry-run`, attach the log to this change as `openspec/changes/fix-ticker-mapping-quality/cleanup-dry-run.log`.
- [ ] §4.3 Review the dry-run log with the user; adjust the remap table for any cases not handled.
- [ ] §4.4 Snapshot the prod DB (Supabase backup or export of `stocks` + `post_stocks`).
- [ ] §4.5 Run `--apply`. Capture log to `openspec/changes/fix-ticker-mapping-quality/cleanup-apply.log`.
- [ ] §4.6 Re-run `scripts/diagnose-ticker-mapping.ts` post-cleanup. The "馮君" suspect should report zero stocks; the "宏捷" suspect should now show `2353.TW name="宏碁"`.

## §5. FK enforcement

- [ ] §5.1 Migration: `supabase/migrations/<ts>_stocks_fk_master.sql` — `ALTER TABLE stocks ADD CONSTRAINT fk_stocks_master FOREIGN KEY (ticker) REFERENCES stocks_master(ticker) ON DELETE RESTRICT;`. Will fail if §4 missed any rows.
- [ ] §5.2 If §5.1 fails, surface the offending tickers, add them to the cleanup remap, re-run §4.5 on those rows, retry §5.1.
- [ ] §5.3 `supabase gen types typescript --linked --schema public > src/infrastructure/supabase/database.types.ts`.

## §6. Specs + docs

- [ ] §6.1 `openspec/specs/ai-pipeline/spec.md`: add invariant — "AI-extracted tickers MUST go through `resolveStock` before persistence; the resolver's name overrides any AI-supplied name."
- [ ] §6.2 `openspec/specs/data-models.md`: document `stocks_master` table + `stocks.ticker → stocks_master.ticker` FK.
- [ ] §6.3 `openspec/specs/repository-contracts/spec.md`: invariant — "`createStock` MUST refuse insertion if the ticker is not present in `stocks_master`."

## §7. Verification

- [ ] §7.1 Run a full E2E import on a known KOL post that was previously affected (e.g. a Gooaye post that had `馮君` linkages). Expected: post creates with the surviving real tickers, no `馮君` row appears, log shows `dropped 馮君 (TW) — not in master`.
- [ ] §7.2 Run a full E2E import on a post whose ticker IS in the master but with an invented Gemini name. Expected: stock row uses master name, not Gemini name.
- [ ] §7.3 SQL spot check: `SELECT COUNT(*) FROM stocks WHERE name IN (SELECT name FROM stocks GROUP BY name HAVING COUNT(*) >= 3);` should return 0 (or only legitimate cross-listings like GOOG/GOOGL).

## §8. Archive

- [ ] §8.1 Open PR; request user review.
- [ ] §8.2 Merge.
- [ ] §8.3 `/opsx:archive fix-ticker-mapping-quality`.
