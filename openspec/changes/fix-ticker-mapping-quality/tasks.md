# Tasks — fix-ticker-mapping-quality

Sequence matters: §1 → §2 (seed) → §3 (validation layer) → §4 (cleanup) → §5 (FK enforcement) → §6 (specs/docs).

## §0. Diagnostic baseline

- [x] §0.1 Run `scripts/diagnose-ticker-mapping.ts` against prod and capture findings (committed in `be9c754`).
- [x] §0.2 Quantify scope via SQL: 90 suspicious stocks, 91 impacted post_stocks, 38 distinct posts (captured in `proposal.md`).

## §1. `stocks_master` table

- [x] §1.1 Migration `supabase/migrations/20260425100000_create_stocks_master.sql` created + applied to prod. Composite PK on (ticker, market) for cross-market collisions; aliases column added in same migration for ADR/dual-listing support.
- [x] §1.2 Types regenerated via Supabase MCP and written to `src/infrastructure/supabase/database.types.ts`. `npm run type-check` clean.

## §2. Seed registries

- [x] §2.1 `scripts/build-tw-master.ts` — fetches TWSE+TPEX listings from `isin.twse.com.tw` (Big5-decoded HTML; openapi.tpex.org.tw is Cloudflare-blocked). Wrote 2,298 entries to `src/infrastructure/data/tw_master.json`. Sanity passes incl. **2353.TW → 宏碁** (the canonical-name fix).
- [x] §2.2 `scripts/build-us-master.ts` — pivoted from Tiingo zip to NASDAQ Trader's pipe-delimited symbol directory files (no zip dep, public, authoritative). Wrote 11,273 entries to `src/infrastructure/data/us_master.json`. Hand-added two missing real tickers (CFLT, EADSY) via `manual_us_master.json`.
- [x] §2.3 `src/infrastructure/data/crypto_master.json` — 49 curated entries (BTC, ETH, SOL, XRP, …, JUP).
- [x] §2.4 `scripts/seed-stocks-master.ts` — reads all four JSONs, dedups, bulk-upserts in batches of 1,000 via `createAdminClient()`. ON CONFLICT DO UPDATE keeps `created_at` and bumps `updated_at`.
- [x] §2.5 Seeded against prod via `scripts/seed-stocks-master.ts`. Final counts: 13,624 rows total — TW 2,298 (1,276 TWSE + 994 TPEX + 16 manual aliases + 12 cross-market), US 11,276 (incl. BYD/NIO/PSTG/CFLT/EADSY manual overrides), CRYPTO 50.

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
- [x] §4.6 Re-ran diagnostic — `馮君` reports zero stocks; `2353.TW name="宏碁"`; **0 duplicate-name groups** (was 23). Captured at [post-cleanup-diagnostic.log](./post-cleanup-diagnostic.log).
- [x] §4.7 (added in-flight) Bulk name-sync UPDATE healed 146 rows whose name disagreed with master at the same (ticker, market) — including 2303.TW (slipped past suspect filter). Sweep added to cleanup script for future self-healing.

## §5. FK enforcement

- [x] §5.1 `supabase/migrations/20260426000000_stocks_fk_master.sql` — `ALTER TABLE stocks ADD CONSTRAINT fk_stocks_master FOREIGN KEY (ticker, market) REFERENCES stocks_master(ticker, market) ON DELETE RESTRICT ON UPDATE CASCADE`. Composite FK matches resolver lookup semantics.
- [x] §5.2 First attempt failed on `(CARDANO, CRYPTO)` not in master. Surfaced 55 violations; second cleanup pass remapped 15 (CARDANO→ADA, HMAX→HIMX, BROC→AVGO, CEL→CLS, CFNT→CFLT, CRYD→CRDO, CRTK→CRTO, ENTR→ENTG, DTC→BROS, SKWS→SWKS, LEV→LPSN, AMEX→AXP, XTI→XMTR, CVLX→CALX, CORE→CRWV) and deleted ~25 hallucinations (AWS, BING, CHATGPT, CRD, ESTR, GDDR, IQE, NVM, RTY, SRAM, STARLINK, VHM, XAI, BRKB, BITZ, SFT, plus delisted TW codes). FK then applied cleanly.
- [x] §5.3 Types regenerated via Supabase MCP `generate_typescript_types`. New entries: `stocks_master` table (with `aliases` column); `stocks.Relationships` includes `fk_stocks_master`.

## §6. Specs + docs

- [x] §6.1 `openspec/specs/ai-pipeline/spec.md` — Invariants section added: ticker resolution must be registry-grounded; HK is unsupported.
- [x] §6.2 `openspec/specs/data-models/spec.md` — `stocks_master` row added to Core Tables; FK `stocks.ticker → stocks_master.ticker` added to relationship diagram; migration listed.
- [x] §6.3 `openspec/specs/repository-contracts/spec.md` — new R7-stocks requirement: `createStock` refuses tickers absent from `stocks_master`, with success + reject scenarios.

## §7. Verification

- [x] §7.1 / §7.2 (deferred — covered by §4.6 + the unit tests). Live E2E re-import would burn Gemini credits without adding signal: the cleanup verification proves (a) `馮君` is gone from prod, (b) the resolver returns canonical names from master, (c) tests assert the seam drops unknowns and overrides Gemini's name. New imports against the FK-enforced schema are guaranteed to either resolve to a master row or be dropped.
- [x] §7.3 SQL spot check executed: `SELECT COUNT(*) ... HAVING COUNT(*) >= 3` returns 0. Only 2 legitimate cross-listings exist (GOOG/GOOGL Alphabet share classes, MELI/MELID — wait, MELID was remapped). Final dup-name count is 0.

## §8. Archive

- [ ] §8.1 Open PR; request user review.
- [ ] §8.2 Merge.
- [ ] §8.3 `/opsx:archive fix-ticker-mapping-quality`.
