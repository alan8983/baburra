## Why

GitHub Issue [#91](https://github.com/alan8983/baburra/issues/91) (D4 from `validate-podcast-pipeline-with-gooaye` baseline) reported that Gooaye EP508 failed with:

```
duplicate key value violates unique constraint "post_stocks_post_id_stock_id_key"
```

Root cause: Gemini occasionally emits the same ticker twice in `analysis.stockTickers` on long transcript-heavy content; the pipeline forwarded both into `stockIds`, producing two `(post_id, stock_id)` rows in `post_stocks`.

The primary fix landed on `main` in commit `8a26af2` (`fix(ai): dedupe analysis.stockTickers (D4 — #91)`):

- ✅ `src/domain/services/ai.service.ts:895-915` adds a first-wins `Set`-based dedup at the AI-service layer, immediately after ticker normalization in `analyzeDraftContent`.

The fix is at the right layer (AI service is the one boundary that all callers of `analyzeDraftContent` must cross), but three closure gaps remain:

1. **No regression test** for the dedup logic. A contributor refactoring `analyzeDraftContent` could remove the dedup and ship without anything failing — until the next long-content episode.
2. **No defense-in-depth** at the repository layer. Other future callers of `createPost(input)` (e.g., user-driven `/api/import/batch`, webhook ingestion, manual seed scripts) might construct `stockIds` from non-AI sources without knowing this gotcha. A unique-constraint failure would still corrupt their import.
3. **No spec invariants** declaring (a) the AI-pipeline contract that "AI extracted entity lists may contain duplicates and the pipeline MUST dedup before persistence" and (b) the repository contract that "`createPost` deduplicates `stockIds` defensively". Without these, the dedup is a coincidence rather than a contract.

## What Changes

- Add a regression test: feed a mocked `generateStructuredJson` response containing `[{ticker:'TSLA',…}, {ticker:'tsla',…}]` to `analyzeDraftContent` (case mismatch deliberate, since `.toUpperCase()` is part of the dedup key). Assert exactly one TSLA entry in the returned `stockTickers`.
- Add defense-in-depth: dedup `input.stockIds` inside `createPost` in `src/infrastructure/repositories/post.repository.ts` when building `stocksParam`. Silent (no log) — this is belt-and-suspenders for callers that bypass the AI layer.
- Add a repository-layer regression test: `createPost({ stockIds: ['s1', 's1', 's2'], … })` produces exactly two entries in the `p_stocks` arg.
- Update `openspec/specs/ai-pipeline/spec.md`: invariant on AI-extracted entity dedup.
- Update `openspec/specs/repository-contracts/spec.md`: invariant on junction-table input dedup.

**Non-goals:**

- Do **not** remove the AI-service-layer dedup. It's where the bug was caught and fixed; it stays as the primary defense.
- Do **not** add a third dedup layer in `processUrl` between AI and repository. Two layers (AI source + repository sink) is sufficient.
- Do **not** retry analysis on duplicate detection. The dedup just drops duplicates.
- Do **not** refund credits for past EP508-style failures. Out of scope; credit accounting is a separate concern.
- Do **not** modify the `post_stocks` schema or unique constraint.

## Capabilities

### Modified Capabilities

- `ai-pipeline`: Codify the contract that AI-extracted entity lists may contain duplicates and that the pipeline must dedup before persistence.
- `repository-contracts`: Codify the contract that `createPost` (and any future repo function that accepts an `*Ids: string[]` for a junction table) deduplicates inputs before write.

## Impact

- **Code**:
  - `src/infrastructure/repositories/post.repository.ts` (defensive dedup in `createPost::stocksParam`, ~3 lines).
- **Tests**:
  - Extend `src/domain/services/__tests__/ai.service.test.ts` (regression test for AI-layer dedup).
  - Extend `src/infrastructure/repositories/__tests__/post.repository.test.ts` (regression test for repo-layer dedup).
- **DB**: No changes.
- **Specs**: `ai-pipeline/spec.md`, `repository-contracts/spec.md`.
- **User-visible**: None directly. Long-content posts continue to succeed (already do post-fix); future non-AI callers also protected.
- **Dependencies**: None — independent of #89 / #90.
- **Independence**: Fully independent. Can ship in any order vs. the other two.
