# Tasks — fix-ticker-mapping-quality

Sequence matters: §1 → §2 (seed) → §3 (validation layer) → §4 (cleanup) → §5 (FK enforcement) → §6 (specs/docs).

## §0. Diagnostic baseline

- [x] §0.1 Run `scripts/diagnose-ticker-mapping.ts` against prod and capture findings (committed in `be9c754`).
- [x] §0.2 Quantify scope via SQL: 90 suspicious stocks, 91 impacted post_stocks, 38 distinct posts (captured in `proposal.md`).

## §1. `stocks_master` table

- [x] §1.1 Migration `supabase/migrations/20260425100000_create_stocks_master.sql` created. FK on `stocks.ticker` deferred to §5.
- [ ] §1.2 `npm run type-check` after `supabase gen types`. *(Pending: needs `db push` against prod first.)*

## §2. Seed registries

- [x] §2.1 `scripts/build-tw-master.ts` — fetches TWSE+TPEX listings from `isin.twse.com.tw` (Big5-decoded HTML; openapi.tpex.org.tw is Cloudflare-blocked). Wrote 2,298 entries to `src/infrastructure/data/tw_master.json`. Sanity passes incl. **2353.TW → 宏碁** (the canonical-name fix).
- [x] §2.2 `scripts/build-us-master.ts` — pivoted from Tiingo zip to NASDAQ Trader's pipe-delimited symbol directory files (no zip dep, public, authoritative). Wrote 11,273 entries to `src/infrastructure/data/us_master.json`. Hand-added two missing real tickers (CFLT, EADSY) via `manual_us_master.json`.
- [x] §2.3 `src/infrastructure/data/crypto_master.json` — 49 curated entries (BTC, ETH, SOL, XRP, …, JUP).
- [x] §2.4 `scripts/seed-stocks-master.ts` — reads all four JSONs, dedups, bulk-upserts in batches of 1,000 via `createAdminClient()`. ON CONFLICT DO UPDATE keeps `created_at` and bumps `updated_at`.
- [ ] §2.5 Run §2.1, §2.2, §2.4 against prod. Verify row counts: TW ≥ 1,800; US ≥ 8,000; CRYPTO ≥ 30. *(Pending — write to prod, requires user approval.)*

## §3. Validation layer (`resolveStock`)

- [x] §3.1 `src/domain/services/ticker-resolver.service.ts` — implements `resolveStock` and `resolveStocksBatch` (one DB round-trip per market). Per-process positive AND negative cache. Throws on transient DB errors; returns `null` on miss.
- [x] §3.2 `src/domain/services/__tests__/ticker-resolver.service.test.ts` — 13 tests: normalize, hit+name-override (2353.TW → 宏碁), miss, non-numeric TW, empty input, positive cache, negative cache, market-disambiguation (STX as US-equity vs CRYPTO), DB error propagation, batch grouping.
- [x] §3.3 Modified `src/domain/services/import-pipeline.service.ts` — replaced direct ticker loop with `resolveStocksBatch` + `resolvedStockTickers` parallel array. HK tickers dropped at the seam (resolver doesn't support HK). `extractArguments` and per-stock-sentiment mapping now use canonical ticker/name. Added `no_resolvable_tickers` short-circuit + credit refund when ALL tickers fail validation.
- [x] §3.4 `createStock` in `src/infrastructure/repositories/stock.repository.ts` now refuses tickers absent from `stocks_master` with an explicit error (defense-in-depth before §5 FK lands).
- [x] §3.5 Extended `src/domain/services/__tests__/import-pipeline.service.test.ts` — 3 new tests: drop-and-survive, master-name-override, all-dropped-refund. Plus a default `resolveStocksBatch` impl in `beforeEach` so existing tests don't regress.
- [x] §3.6 `npm run type-check && npm test && npm run lint` — all clean. (965/965 tests passing; only lint warning in new code was an unused helper, removed.)

## §4. Cleanup of existing 90 fabricated rows

- [x] §4.1 `scripts/cleanup-fabricated-stocks.ts` — identifies suspects via the proposal's SQL; buckets into A (remap), B (delete), C (rename) per design D3. Hardcoded remap table for known canonical equivalents (MARVELL→MRVL, CONFLUENT→CFLT, CLOUDFLARE→NET, …, 2357→2357.TW, 4966→4966.TW, …). Default `--dry-run`; `--apply` required to mutate. Writes audit log to `scripts/cleanup-fabricated-stocks.log`.
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

- [x] §6.1 `openspec/specs/ai-pipeline/spec.md` — Invariants section added: ticker resolution must be registry-grounded; HK is unsupported.
- [x] §6.2 `openspec/specs/data-models/spec.md` — `stocks_master` row added to Core Tables; FK `stocks.ticker → stocks_master.ticker` added to relationship diagram; migration listed.
- [x] §6.3 `openspec/specs/repository-contracts/spec.md` — new R7-stocks requirement: `createStock` refuses tickers absent from `stocks_master`, with success + reject scenarios.

## §7. Verification

- [ ] §7.1 Run a full E2E import on a known KOL post that was previously affected (e.g. a Gooaye post that had `馮君` linkages). Expected: post creates with the surviving real tickers, no `馮君` row appears, log shows `dropped 馮君 (TW) — not in master`.
- [ ] §7.2 Run a full E2E import on a post whose ticker IS in the master but with an invented Gemini name. Expected: stock row uses master name, not Gemini name.
- [ ] §7.3 SQL spot check: `SELECT COUNT(*) FROM stocks WHERE name IN (SELECT name FROM stocks GROUP BY name HAVING COUNT(*) >= 3);` should return 0 (or only legitimate cross-listings like GOOG/GOOGL).

## §8. Archive

- [ ] §8.1 Open PR; request user review.
- [ ] §8.2 Merge.
- [ ] §8.3 `/opsx:archive fix-ticker-mapping-quality`.
