## 1. Live pipeline patch (D3)

- [ ] 1.1 In `src/domain/services/ai.service.ts`, inside the function that parses the AI response (`parseAiAnalysisResult` / equivalent, around line 910), after `stockSentiments` is populated from `result.stockSentiments`, iterate over `stockTickers` and set `stockSentiments[ticker] ??= sentiment` for any ticker not already explicitly set.
- [ ] 1.2 Extract the defaulting logic into a small pure helper so it's unit-testable: `fillMissingStockSentiments(tickers: string[], postLevel: Sentiment, explicit: Record<string, Sentiment>): Record<string, Sentiment>`.
- [ ] 1.3 Add unit tests covering: (a) AI returns no `stockSentiments` → all tickers default to post-level; (b) AI overrides one ticker → that one is preserved, others default; (c) AI overrides all tickers → no change.
- [ ] 1.4 Audit other write paths that touch `post_stocks.sentiment` directly (dashboard route, drafts page, reanalyze-batch route — see grep results in design §D2) and confirm they already supply per-stock sentiments. No code change expected, just verification + one sentence in this tasks.md noting which paths were checked.
- [ ] 1.5 `npm run type-check` — pass.
- [ ] 1.6 `npm run lint` — pass.
- [ ] 1.7 `npm test` — pass, including the new unit tests from 1.3.

## 2. Build the backfill script

- [ ] 2.1 Create `scripts/backfill-per-stock-sentiment.ts` following the CLI shape of `scripts/backfill-scorecards.ts`.
- [ ] 2.2 Argument parsing: `--dry-run` (default on), `--commit` (required to write), `--kol <id|all>` (default `all`), `--batch-size <n>` (default 50, for progress logging only — writes remain sequential).
- [ ] 2.3 Query for NULL rows: `SELECT ps.id, ps.post_id, ps.stock_id, p.sentiment, p.kol_id, s.ticker FROM post_stocks ps JOIN posts p ON p.id = ps.post_id JOIN stocks s ON s.id = ps.stock_id WHERE ps.sentiment IS NULL [AND p.kol_id = $1]`. Uses `createAdminClient()`.
- [ ] 2.4 Group query results by `post_id` so a single `updatePostAiAnalysis` call covers all of a post's NULL tickers. Call signature: `updatePostAiAnalysis(postId, { sentiment: posts.sentiment, aiModelVersion: <current>, stockSentiments: { [stockId]: posts.sentiment, ... } })`.
- [ ] 2.5 Log per-post progress: `[backfill] post=<id> kol=<slug> stocks=<ticker1,ticker2,...> sentiment=<n> updated in <ms>ms`.
- [ ] 2.6 Final summary: `Completed: <posts> posts / <rows> rows. <n> failures (<ids>). Skipped: <n> (already non-NULL).`
- [ ] 2.7 On `--dry-run`, skip the `updatePostAiAnalysis` call but log what would be written. Output: one summary line + optional `--verbose` prints each planned write.
- [ ] 2.8 Update `scripts/README.md` with usage, prerequisites, and production invocation.

## 3. Pre-production verification (local)

- [ ] 3.1 Run `npx tsx scripts/backfill-per-stock-sentiment.ts --dry-run` locally. Verify the count reported matches the SQL: `SELECT COUNT(*) FROM post_stocks WHERE sentiment IS NULL` (expect ~618 at time of writing).
- [ ] 3.2 Run `--dry-run --kol b7a958c4-f9f4-48e1-8dbf-a8966bf1484e` (Gooaye) and spot-check the planned writes for NVDA rows — expect 36 NVDA rows to be updated to match each post's sentiment.

## 4. Deploy the code delta (D3)

- [ ] 4.1 Open a PR with §1 changes + §2 script.
- [ ] 4.2 CI green (type-check, lint, tests, build).
- [ ] 4.3 Merge → Vercel auto-deploys. From this moment forward, new ingests populate per-stock sentiment automatically.

## 5. Run the backfill against production

- [ ] 5.1 Export prod env vars (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). Do NOT need Gemini/Tiingo keys — the backfill reads from `posts.sentiment` and does not call external APIs.
- [ ] 5.2 Run `npx tsx scripts/backfill-per-stock-sentiment.ts --dry-run` against prod. Confirm counts match §3.1 expectation and nothing unexpected is in the planned-write list.
- [ ] 5.3 Run `npx tsx scripts/backfill-per-stock-sentiment.ts --commit`. Expected duration: ~5 min. Watch the log for per-post progress and any `failed:` lines.
- [ ] 5.4 Verify: `SELECT COUNT(*) FROM post_stocks WHERE sentiment IS NULL` → 0.
- [ ] 5.5 Verify classifier sanity: `SELECT COUNT(*) FROM post_stocks WHERE sentiment NOT BETWEEN -3 AND 3 AND sentiment IS NOT NULL` → 0 (no bogus values written).

## 6. Warm the scorecard cache

- [ ] 6.1 If `rollout-scorecard-cache-prod` has not yet shipped its §5 backfill: defer until those flags flip so the cache is authoritative. Once the flags are ON, the live `/api/kols/*/win-rate` reads will surface the new numbers.
- [ ] 6.2 If `rollout-scorecard-cache-prod` is already live: the per-post `invalidateScorecardsAfterPostWrite` calls fired by the backfill script will have marked KOL scorecards stale. Either wait for the next `/api/kols/*/win-rate` hit per KOL to auto-recompute via `waitUntil`, or run `npx tsx scripts/backfill-scorecards.ts --kol all --stocks` to proactively warm.

## 7. Verify end-to-end

- [ ] 7.1 Spot-check: navigate to Gooaye's detail page. The NVDA 報酬率統計 card should now show numeric values for at least 30d and 90d (not dashes). Screenshot.
- [ ] 7.2 SQL cross-check: `SELECT bucketsByStock->>'cc47def8-8717-4262-90b9-ae10656771ee' FROM kol_scorecard_cache WHERE kol_id='b7a958c4-f9f4-48e1-8dbf-a8966bf1484e'` — the NVDA bucket should have `returnSampleSize > 0` and a non-null `avgReturn` for at least one period.
- [ ] 7.3 Pick 2 other KOL detail pages and confirm per-stock cards populate where the posts have non-zero sentiment.
- [ ] 7.4 Check `/api/dashboard` — no regression. The portfolio-pulse route already constructs `stockSentiments` from live data, so the backfill should improve, not regress, these numbers.

## 8. Archive + docs

- [ ] 8.1 Run `/opsx:archive backfill-per-stock-sentiment` once §§1–7 are complete.
- [ ] 8.2 Update `openspec/specs/ai-pipeline/spec.md` (the living spec) with a brief note under "Sentiment analysis" that per-stock sentiment is always emitted for attached tickers (reflects D3). The change's delta spec file gets merged into the living spec on archive.
- [ ] 8.3 No `docs/WEB_DEV_PLAN.md` phase change — this is a data-quality fix inside an already-shipped phase.

## 9. Follow-ups (open, do not implement here)

- [ ] 9.1 Consider a `--deep` flag that re-calls Gemini per-ticker for multi-stock posts where the author likely has divergent per-ticker stances. Scope a separate OpenSpec change if product wants this fidelity.
- [ ] 9.2 Consider adding a `post_stocks.sentiment_is_default BOOLEAN` column later if filtering metrics by "AI-explicit only" becomes a product requirement.
