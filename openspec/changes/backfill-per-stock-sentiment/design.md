## Context

The data-model has `posts.sentiment` (post-level, required) and `post_stocks.sentiment` (per-(post, stock), optional). The AI pipeline at [ai.service.ts:910](src/domain/services/ai.service.ts:910) only writes the per-stock value when the Gemini response explicitly includes an override in `stockSentiments`. Most historic responses either pre-date the field or only supply `sentiment` + `tickers` without per-ticker sentiments — leaving 618/704 `post_stocks.sentiment` values `NULL`.

The per-stock win-rate calculator at [win-rate.calculator.ts:46](src/domain/calculators/win-rate.calculator.ts:46) treats `NULL`/`0` sentiment as `excluded`. The classifier pulls `post_stocks.sentiment` directly — no post-level fallback. When the per-stock value is `NULL`, every sample from that (post, stock) pair is excluded from win/loss/noise classification, driving `returnSampleSize` to `0` and forcing the UI card at [kol-stock-section.tsx:142](src/app/(app)/kols/[id]/_components/kol-stock-section.tsx:142) to render dashes.

Observable symptom: for Gooaye + NVDA, `excludedCount: 37, returnSampleSize: 0` with `avgReturn: null` across all 4 periods. Same pattern is present for ~88% of (KOL, stock) pairs in prod.

Constraints:
- Gemini costs & rate limits: backfill must be sequential at ~1 req/s, resumable, and cheap. Budget ~$2–$5 for 618 posts re-analyzed (fewer if we batch multi-stock posts per call).
- No schema change. `post_stocks.sentiment` stays nullable — we just eliminate the NULL gap.
- Must not break existing behavior for the 86 rows that already have per-stock sentiment.
- The KOL scorecard cache (`kol_scorecard_cache`) is keyed by `(kol_id, classifier_version)`. After backfill, samples change, so the cache for affected KOLs must be invalidated — the existing `invalidateScorecardsAfterPostWrite` hook handles this per write.

Stakeholders: all KOL detail page viewers (bug is externally visible — the feature is dark for 88% of data).

## Goals / Non-Goals

**Goals:**
- Reduce `post_stocks.sentiment IS NULL` count from 618 → 0 (or explain each residual NULL — e.g., a post with no meaningful directional stance on a given ticker).
- Guarantee no future post ingestion leaves `post_stocks.sentiment` as NULL.
- Surface a clear policy: when the backfill legitimately cannot produce a per-stock sentiment, the calculator's behavior is documented.

**Non-Goals:**
- Changing the classifier to fall back to `posts.sentiment` silently. We want the per-stock value to be authoritative once populated — a fallback masks future gaps.
- Reshaping the `post_stocks` schema (adding `sentiment_is_explicit` etc.). The `source` column already distinguishes `explicit` vs `inferred` — we don't need another flag.
- Backfilling `post_stocks.inference_reason` or other nullable fields. Scope is sentiment only.
- Changing any API contract. Response shapes stay identical; values change from dashes to numbers for the affected KOLs.

## Decisions

### D1. Use a default-to-post-level rule during backfill rather than re-calling Gemini for every NULL row

**Decision:** For each `post_stocks` row with `NULL sentiment`, set `sentiment := posts.sentiment` unless a targeted re-analysis is explicitly requested via a CLI flag.

**Rationale:**
- 87.8% of rows are NULL is a flag — the AI pipeline simply never wrote the field. The post-level sentiment already reflects the author's overall stance. For a single-stock post, post-level ≡ per-stock. For a multi-stock post, post-level is a reasonable first approximation — the author's overall directional stance applies to each ticker they mention, absent evidence otherwise.
- Re-calling Gemini for 618 rows is wasteful when the post-level value is a valid default for the common case.
- Preserves the invariant that once `post_stocks.sentiment` is populated, it is authoritative — the classifier never has to guess.
- **Alternative considered:** Re-call Gemini with the full post content + ticker list for every NULL row. Better fidelity for multi-stock posts where the author disagrees per-ticker, but >10× the cost and latency. Rejected as the default; opt-in via `--deep` flag for specific KOLs.

### D2. Write at the same write-boundary the regular pipeline uses

**Decision:** The backfill script calls `updatePostAiAnalysis` (or equivalent repo function) with a computed `stockSentiments: { [stockId]: posts.sentiment }` for each NULL row. It does NOT write to `post_stocks` directly.

**Rationale:**
- `updatePostAiAnalysis` already fires `invalidateScorecardsAfterPostWrite`, so the `kol_scorecard_cache` is dirtied correctly as rows change.
- `invalidateSamplesAfterSentimentWrite` also fires, dropping cached `win_rate_samples` for affected posts so the next `/api/kols/*/win-rate` read recomputes with the new values.
- Keeps one write path; no risk of drift between the backfill and live ingest paths.

### D3. Patch the live pipeline at [ai.service.ts:910](src/domain/services/ai.service.ts:910) to default `stockSentiments[ticker] := sentiment` for every ticker AI returns, unless the AI response explicitly overrides

**Decision:** After parsing `result.stockSentiments`, iterate over `stockTickers` and populate any missing entry with the post-level sentiment.

**Rationale:**
- Without this, the gap will immediately reopen on the next ingest.
- Change is ~3 lines in a single function. Unit test for the merge logic.
- **Alternative considered:** Change the Gemini prompt to always emit per-ticker sentiments. Nicer theoretically but introduces higher Gemini token usage per call and means the contract depends on Gemini compliance. Rejected — the defaulting merge is the belt-and-suspenders fix.

### D4. Keep the classifier's NULL handling as-is

**Decision:** No change to [win-rate.calculator.ts](src/domain/calculators/win-rate.calculator.ts). `NULL` and `0` both remain `excluded`.

**Rationale:**
- After D1+D3 land, NULLs are only written deliberately (e.g., if a future policy chooses to leave some per-stock sentiments blank on purpose). Excluding them keeps the metric conservative.
- If we ever want a "degrade gracefully to post-level" semantics for the UI-without-data case, it's cleaner to add that at the read-aggregate layer (the win-rate service) than at the classifier leaf, so that `excludedCount` vs `resolvedCount` still reflect the true state.

### D5. Operate on a dry-run-first script

**Decision:** The backfill script defaults to `--dry-run`, reporting what it would write (row counts per KOL, per stock, per source). A `--commit` flag is required for live writes.

**Rationale:** The script touches production data via the admin client. The dry-run output is reviewed before commit. Matches the pattern of `scripts/backfill-scorecards.ts` from the concurrent `rollout-scorecard-cache-prod` change.

## Risks / Trade-offs

- **Risk:** Some multi-stock posts have a bearish overall sentiment but genuinely bullish on one ticker (e.g., "market sucks but I'm long NVDA"). D1's default-to-post-level would mis-label that NVDA row as bearish.
  **Mitigation:** The `--deep` flag re-runs Gemini per-ticker for specified KOLs. Offer it as a follow-up for known high-divergence KOLs. Document the trade-off explicitly in a script comment so operators know when to use `--deep`.

- **Risk:** The scorecard cache invalidation fan-out is large (affects most KOLs). Live production recompute after backfill could spike Tiingo API calls as each KOL's win-rate endpoint warms.
  **Mitigation:** Run the backfill in the same window as `rollout-scorecard-cache-prod`'s pre-warm step — after writing `post_stocks.sentiment`, the backfill-scorecards script picks up the new samples automatically. Sequence: (1) `backfill-per-stock-sentiment --commit`, (2) `backfill-scorecards --kol all --stocks`, (3) flip flags. Documented in tasks.md.

- **Risk:** The D3 live-pipeline change breaks tests that assert `stockSentiments` stays empty when AI doesn't override.
  **Mitigation:** Update the unit tests for `parseAiAnalysisResult` to reflect the new defaulting. Tests that assert "per-stock sentiment matches post-level when AI is silent" replace tests that asserted "per-stock stays empty."

- **Trade-off:** Defaulting per-stock to post-level means the `post_stocks.sentiment` column loses the "AI explicitly chose this per ticker" signal for old rows. The `source` column (`explicit` vs `inferred`) preserves a weaker version of this, but if product wants stronger provenance later, a new column (`sentiment_explicit BOOLEAN`) would be needed — noted as a future consideration, not in scope.

## Migration Plan

1. Land the D3 code change first (live pipeline emits per-stock sentiment for new ingests). Ship behind no flag — the change is backward-compatible (NULL → post-level default is strictly additive).
2. Run the backfill script in `--dry-run` mode against prod. Review the plan (row counts by KOL, sample of what will be written).
3. Run `--commit` sequentially. Expected duration: ~5 min (618 rows, one `UPDATE` each with scorecard invalidation).
4. Verify: `SELECT COUNT(*) FROM post_stocks WHERE sentiment IS NULL;` → 0 (or a small residual with documented reasons).
5. Re-run `scripts/backfill-scorecards.ts --kol all --stocks` from the concurrent rollout change to warm the cache with the new samples.
6. Spot-check the Gooaye NVDA 報酬率統計 card — expect numeric values for at least 30d and 90d.

**Rollback:** The backfill writes are reversible by re-running with `--reset`, which sets `sentiment := NULL` for rows whose `source='explicit'` was backfilled. (Optional — keep it behind a separate flag and only if an operator needs it.) The D3 code change rolls back via `git revert`. No data loss.

## Open Questions

- Should the `--deep` per-ticker re-analysis be part of this change or a separate follow-up? Recommendation: follow-up, opened-but-not-implemented. The D1 default is good enough for the 87.8% gap.
- Do we want a `post_stocks.sentiment_is_default` boolean to mark backfilled-from-post-level vs AI-explicit? Not required for this change. If product later wants to filter metrics by "only AI-explicit samples," add then.
