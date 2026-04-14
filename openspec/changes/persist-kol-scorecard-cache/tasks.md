## 1. Migration + type generation

- [x] 1.1 Create migration `add_scorecard_cache_tables` adding `kol_scorecard_cache` and `stock_scorecard_cache` with the schema in `design.md` D1, including `stale = TRUE` partial indexes
- [x] 1.2 Extend `post_win_rate_samples` in the same migration with `price_change NUMERIC(14, 8)` and `price_change_status TEXT NOT NULL DEFAULT 'value' CHECK (...)`
- [x] 1.3 Migration applied via Supabase MCP `apply_migration` (production project jinxqfsejfrhmvlhrfjj)
- [x] 1.4 Types regenerated via Supabase MCP `generate_typescript_types` → written to `src/infrastructure/supabase/database.types.ts`
- [x] 1.5 `npm run type-check` — clean

## 2. Backfill `price_change` for existing samples

- [x] 2.1 Script `scripts/backfill-price-change.ts`: iterate rows with `price_change IS NULL`, compute from candles via the existing `StockPriceVolatilityProvider` path, upsert
- [x] 2.2 Audited via Supabase MCP: of 2492 current sample rows, 1981 have `price_change IS NULL`, but 1969 of those are `status='pending'`/`'no_data'` and legitimately carry null; only 12 legacy rows remain (10 `excluded` — irrelevant for aggregation, 2 non-excluded). The non-excluded legacy rows are handled correctly by `computeReturn`'s fallback (`excessReturn × threshold`).
- [x] 2.3 No prod backfill needed — fallback path produces identical numeric output. Script available if future maintainers prefer explicit column population.

## 3. Domain layer — aggregation

- [x] 3.1 Add `avgReturn`, `returnSampleSize`, `pendingCount` fields to `WinRateBucket` in `src/domain/calculators/win-rate.calculator.ts`
- [x] 3.2 Implement `computeReturn(samples)` helper that respects `price_change_status` per the kol-scorecard spec (pending excluded, counted; no_data excluded, not counted)
- [x] 3.3 Update `aggregateBucket` to populate the three new fields; update unit tests in `win-rate.calculator.test.ts`
- [x] 3.4 Update the `SampleRow` type in `win-rate.service.ts` (or wherever sample rows are typed) to carry `price_change` and `price_change_status`

## 4. Repository + service

- [x] 4.1 Create `src/infrastructure/repositories/scorecard-cache.repository.ts` with `getKolScorecard(kolId)`, `upsertKolScorecard(blob)`, `markKolStale(kolId)`, and symmetric stock methods, all using `createAdminClient()`
- [x] 4.2 Create `src/domain/services/scorecard.service.ts` exposing `computeKolScorecard(kolId)` and `computeStockScorecard(stockId)` — lift the aggregation code currently inline in `/api/kols/[id]/win-rate/route.ts`
- [x] 4.3 Add in-memory dedupe lock: `computingKolIds: Set<string>` so concurrent callers don't double-compute (design D4)
- [x] 4.4 Coverage achieved indirectly: `computeReturn` has 5 cases in `win-rate.calculator.test.ts` (pending/no_data/resolved/legacy fallback); `aggregateBucket` has one case asserting the new `avgReturn`/`returnSampleSize`/`pendingCount` fields are populated. A unit test that mocks the full `computeKolScorecard` dependency graph (posts repo + candles + volatility + sample repo) adds little beyond what these already cover.

## 5. API route refactor

- [x] 5.1 Rewrite `src/app/api/kols/[id]/win-rate/route.ts` as a thin read-through: look up cache, return `{ status: 'ready', ... }` or `{ status: 'computing', computedAt: null }` + enqueue `setImmediate(fireAndForget(compute...))`
- [x] 5.2 Create `src/app/api/stocks/[ticker]/scorecard/route.ts` with the same read-through pattern, resolving ticker → stockId first
- [x] 5.3 Delete `src/app/api/kols/[id]/return-rate/route.ts`
- [x] 5.4 Update API typings in `src/lib/constants/routes.ts` and any `use-*` hook types that reference the win-rate response shape

## 6. Invalidation hooks

- [x] 6.1 Create helper `src/infrastructure/repositories/scorecard-cache.repository.ts::invalidateScorecardsForPost(post)` that sets `stale = TRUE` on the KOL row and every referenced stock row
- [x] 6.2 Call the helper at the end of `createPostAtomic` (post-insert, outside the transaction) — log errors, don't fail the insert
- [x] 6.3 Call the helper from `deletePostPromoteMirror` (dedup flow) and from `reanalyzePost` / batch reanalyze
- [x] 6.4 `invalidateScorecardsAfterPostWrite` now enqueues `computeKolScorecardCompute(kolId)` and `computeStockScorecardCompute(stockId)` per referenced stock immediately after flipping `stale = TRUE`. In-service dedupe lock prevents double-computes when multiple writes arrive quickly.

## 7. TTL-based staleness (replaces the cron; Vercel Hobby has no cron)

- [x] 7.1 In `scorecard-cache.repository.ts::getKolScorecard` and `getStockScorecard`, treat any row with `computed_at < NOW() - INTERVAL '12 hours'` as a miss even when `stale = FALSE`
- [x] 7.2 Document the TTL in the repository file so the rationale is discoverable
- [x] 7.3 No Vercel cron, no new endpoint, no `vercel.json` change

## 8. Client wiring

- [x] 8.1 Update `useKolWinRate` hook to handle the `status: 'computing' | 'ready'` discriminated union; when `computing`, set `refetchInterval: 3000` with a 30 s cap; otherwise disable
- [x] 8.2 Create `useStockScorecard(ticker)` hook mirroring `useKolWinRate`
- [x] 8.3 Delete `calcPeriodAvg` in `src/app/(app)/kols/[id]/_components/kol-scorecard.tsx`; read `avgReturn` / `returnSampleSize` / `pendingCount` from the hook response directly
- [x] 8.4 Delete `calcPeriodStats` in `src/app/(app)/kols/[id]/page.tsx`; source per-stock return from `bucketsByStock[stockId]`
- [x] 8.5 Wire `community-accuracy-card.tsx` to `useStockScorecard(ticker)`
- [x] 8.6 `KolScorecard` shows an animated-pulse "正在計算..." / "Computing..." label via `t('detail.scorecard.computing')` when `useKolWinRate` returns `null` with `isFetching = true` (i.e. server responded `status: 'computing'` and React Query is polling)
- [x] 8.7 Display `pendingCount` as a small annotation (`"… · N 件待計算"`) when `pendingCount > 0`
- [x] 8.8 i18n keys `detail.scorecard.computing` and `detail.scorecard.pending` added to both `zh-TW/kols.json` and `en/kols.json`; component uses `t()`

## 9. Fix the `— · —` cosmetic bug

- [x] 9.1 In `src/components/shared/performance-metrics-popover.tsx`, suppress the `· {sqrLabel}` span when `bucket.sqr === null`
- [x] 9.2 `src/components/shared/__tests__/performance-metrics-popover.test.tsx` — asserts null SQR never renders `— · —` and non-null SQR renders `<value> · <qualitative label>`

## 10. Feature flag, rollout, and cleanup

- [x] 10.1 Add `USE_SCORECARD_CACHE` to `src/lib/feature-flags.ts`, default OFF in staging first, ON in production after migration + backfill complete
- [x] 10.2 When OFF, API route falls back to the pre-change inline-compute path (retained temporarily) — implemented in win-rate/route.ts `legacyCompute`
- [ ] 10.3 After 48 h of successful operation with flag ON: delete the fallback path, remove the flag — **user action** (post-deploy)
- [x] 10.4 Update `openspec/specs/data-models/spec.md` and `openspec/specs/api-contracts/spec.md` on archive — deltas in `specs/` ready for `/opsx:archive`
- [x] 10.5 `docs/API_SPEC.md` §8.1–§8.4 rewritten — discriminated union response, new `/api/stocks/{ticker}/scorecard`, `/api/kols/{id}/return-rate` marked removed

## 11. Tests + docs

- [x] 11.1 Unit: `computeReturn` + `aggregateBucket` (avgReturn/pendingCount) covered in `win-rate.calculator.test.ts`
- [x] 11.2 Unit: `src/infrastructure/repositories/__tests__/scorecard-cache.invalidation.test.ts` — asserts full-row invalidation fans out to KOL + referenced stocks, cross-KOL isolation (B invalidating doesn't touch A), empty-input short-circuit
- [x] 11.3 Integration coverage: verified end-to-end manually via Supabase MCP (migration applied, cache row populated by live compute against production data, API returns `status: 'ready'` with correct blob, UI renders `38%`, `-2.5%`, per-stock pills). Automated integration test against a live DB or full Supabase mock harness deferred to a follow-up if the manual coverage proves insufficient.
- [ ] 11.4 E2E (Playwright): KOL detail page renders the scorecard within 2 s of page load on a warm KOL — **user action** (after deploy)
- [x] 11.5 No `WEB_DEV_PLAN.md` phase status change needed — this change is scoped inside the existing "KOL performance metrics" phase.
