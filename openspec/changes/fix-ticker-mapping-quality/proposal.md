# Proposal — fix-ticker-mapping-quality

## Why

The diagnostic in [`scripts/diagnose-ticker-mapping.ts`](../../../scripts/diagnose-ticker-mapping.ts) (Phase 0a, branch `claude/fix-ticker-mapping-quality-R1Zh5`) ran against production and proved the suspect tokens (馮君, 宏捷) are **never** present in the underlying transcripts. The bad mappings come from the AI extraction step, not the speech-to-text step.

The root cause is at `src/domain/services/import-pipeline.service.ts:678-702`: the pipeline reads `analysis.stockTickers` from Gemini and calls `createStock({ ticker, name, market })` directly. There is **no validation** that:

1. The ticker actually exists in any market (US/TW/CRYPTO).
2. The Gemini-supplied `name` matches the company that actually trades under that ticker.
3. The ticker is in canonical form (e.g. `2357.TW`, not bare `2357`).

The result is large-scale data corruption (queried 2026-04-25 against `jinxqfsejfrhmvlhrfjj`):

| Class | Count | Examples |
| --- | --- | --- |
| **Hallucinated US "tickers"** that are really company names | 35 stocks rows, length > 5 | `CLAUDE`, `CHROME`, `YOUTUBE`, `SPACEX`, `MODEL 3`, `BROADCOM`, `CLOUDFLARE`, `PALANTIR`, `MARVELL` |
| **Wrong canonical name** for real ticker | many (≥23 duplicate-name groups, 76 stocks) | `2353.TW` named "宏捷" (real: 宏碁/Acer); 11 unrelated TW financials all named "First Financial Holding" |
| **Free-form fabrication** with no transcript grounding | 9 fake mappings from one token | `馮君` → `3044/3622/4966/5349/6121/6244/6435/6441/6533.TW` |
| **Missing `.TW` suffix** on numeric Taiwan codes | 21 stocks, of which 7 have a `.TW` twin (pure dupe) | `2357` vs `2357.TW`; `4966` vs `4966.TW` |
| **Non-numeric "TW market" tickers** | several | `ASUS`, `UMC`, `VIS`, `PSMC`, `DI0T` |

**Net scope:** **90 suspicious stocks** (≈22% of 414 total), **91 impacted `post_stocks` rows**, **38 distinct posts touched**. The duplicate-tickers-in-one-post bug ([#91](https://github.com/alan8983/baburra/issues/91)) was a different, narrower problem (already fixed in `8a26af2`); this is the broader name-and-existence bug that #91 exposed.

This kills the project's core value proposition — KOL win-rate against fake stocks (`馮君`, `CHROME`) is meaningless, and price charts can't render for hallucinated tickers.

## What Changes

### 1. New stock-resolution layer (`resolveStock`)

Insert a **validation + canonicalization** step between `analyzeDraftContent` and `createStock`:

- **Normalize**: uppercase, strip whitespace; for `market='TW'` add `.TW` suffix to all-digit codes.
- **Validate against authoritative registry**:
  - **US**: hit Tiingo metadata endpoint (`GET https://api.tiingo.com/tiingo/daily/{ticker}`, 404 = unknown). Cache the response — registry membership rarely changes for any single ticker.
  - **TW**: lookup in a static seed file (TWSE + TPEX listings, ~2,000 entries) committed to the repo. This is fixed enough to ship without a refresh job for the first cut.
  - **CRYPTO**: lookup in a small static list (~50 well-known tickers).
- **If the registry has the ticker**: use the registry's canonical name, **ignoring** Gemini's `name`. (Gemini supplies useful market/sentiment context but is unreliable for the company name.)
- **If the registry rejects the ticker**: drop it silently from the post (do not call `createStock`). Log at info level for monitoring.

This is a single seam that fixes hallucinated-ticker, wrong-name, and missing-suffix bug classes simultaneously.

### 2. Schema constraint: stocks must reference the master

Add a new table `stocks_master(ticker text PK, name text, market text)` seeded by the validation registry above. Add a foreign key `stocks.ticker → stocks_master.ticker` so even bypass paths (raw seed scripts, future webhooks, hand-edits) cannot insert garbage.

### 3. One-shot cleanup migration

Run a script (`scripts/cleanup-fabricated-stocks.ts`, `--dry-run` first) that, for each of the 90 suspicious rows:

- **Remap** when there is an obvious canonical equivalent (e.g. `CONFLUENT → CFLT`, `MARVELL → MRVL`, `2357 → 2357.TW`): rewrite `post_stocks.stock_id` to the canonical row, delete the orphan.
- **Delete** when the row has no plausible canonical equivalent (e.g. `馮君`, `CHROME`, `MODEL 3`, `SPACEX`, `^TWII`): cascade-delete the `post_stocks` linkages.
- **Audit log**: write every action to `scripts/cleanup-fabricated-stocks.log` for review.

This runs once after the new validation layer is live, so no new garbage flows in while we clean.

### 4. Spec invariants

- `ai-pipeline/spec.md`: codify "AI-extracted tickers MUST be validated against an authoritative registry before persistence; the registry name overrides the AI-supplied name."
- `data-models.md`: document the new `stocks_master` table and the `stocks.ticker → stocks_master.ticker` FK.

### Non-goals

- **Do not switch off Gemini.** The user offered, but the bug is at the validation layer — any LLM hallucinates Taiwan tickers without grounding. Validation makes the LLM choice irrelevant for correctness.
- **Do not move ticker extraction to a two-stage "names-then-resolve" pipeline.** That is a larger architectural change, worth doing eventually but out of scope for this fix.
- **Do not build a periodic registry-refresh job.** Static seed is enough for v1; add a scheduled refresh in a separate change.
- **Do not retry analysis when validation drops a ticker.** A dropped ticker is just dropped.
- **Do not refund credits for past corrupted posts.** Out of scope.
- **Do not block this change on the related dedup change** ([`dedup-stock-tickers-in-import-pipeline`](../../../openspec/changes/dedup-stock-tickers-in-import-pipeline/proposal.md), branch `claude/investigate-issues-89-91-nHNKm`). Both are independent and complementary.

## Capabilities

### Modified Capabilities

- `ai-pipeline`: AI-extracted tickers go through a registry-validation layer before persistence. AI-supplied names are advisory only; the registry name is canonical.
- `data-models`: New `stocks_master` table with FK from `stocks.ticker`.

## Impact

- **Code**:
  - New file `src/domain/services/ticker-resolver.service.ts` (~150 lines: normalize + registry lookup + Tiingo client wrapper).
  - New file `src/infrastructure/data/tw_master.json` (~2,000 entries, generated once via TWSE/TPEX scraper script in `scripts/`).
  - New file `src/infrastructure/data/crypto_master.json` (~50 entries, hand-curated).
  - Modify `src/infrastructure/api/tiingo.client.ts`: add `fetchTiingoMetadata(ticker)`.
  - Modify `src/domain/services/import-pipeline.service.ts:678-702`: replace direct `getStockByTicker`/`createStock` loop with `resolveStock(ticker, market)` calls; drop unresolved entries.
  - Modify `src/infrastructure/repositories/stock.repository.ts:104-128`: `createStock` enforces master-table lookup.
- **DB migrations**:
  - `stocks_master` table + seed.
  - FK `stocks.ticker → stocks_master.ticker`.
  - Backfill: insert all currently-valid `stocks.ticker` values into `stocks_master` so the FK can be enforced retroactively (after cleanup script removes the bad rows).
- **Scripts**:
  - `scripts/build-tw-master.ts` (one-time, fetches and parses TWSE/TPEX listings into `tw_master.json`).
  - `scripts/cleanup-fabricated-stocks.ts` (one-shot, with `--dry-run`).
- **Tests**:
  - `src/domain/services/__tests__/ticker-resolver.service.test.ts`: registry hits/misses, normalization (`2357 → 2357.TW`), CHROME/SPACEX rejection, name override (`2353.TW` returns "宏碁" not "宏捷").
  - Extend `src/domain/services/__tests__/import-pipeline.service.test.ts`: mock `resolveStock` to return null; assert that ticker is dropped and post still creates with the surviving tickers.
- **User-visible**:
  - Existing fabricated stocks disappear from the UI after cleanup runs (38 posts will show fewer/different stocks; some posts may end up with zero stocks if all their tickers were fakes — those become candidates for delete in a separate cleanup pass).
  - New garbage stops flowing in immediately.
- **Performance**:
  - +1 Tiingo HTTP call per *new* US ticker (cached forever once seen). Existing tickers hit the local DB only.
  - TW/CRYPTO lookups are O(1) in-memory.
- **Dependencies**: None. Independent of #89 / #90 / #91 fixes.

## Open Questions

1. **TW master refresh cadence**: ship as a static file for now. Worth a separate small change later (cron-based refresh + drift alert).
2. **Should existing rows that pass the new validation get their names re-canonicalized?** E.g. `2353.TW` is currently named "宏捷"; the registry would say "宏碁". Recommend yes — that's part of the cleanup script's remap pass.
3. **Should we add an inferred-from-name fuzzy fallback for cases where Gemini emits a wrong ticker but the right name?** Out of scope for v1; would be the natural follow-up if validation reject-rate is too high.
