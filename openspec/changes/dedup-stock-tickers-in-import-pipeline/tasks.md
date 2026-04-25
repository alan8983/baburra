## 1. AI-layer regression test

- [ ] 1.1 In `src/domain/services/__tests__/ai.service.test.ts`, add a test "analyzeDraftContent dedupes duplicate tickers from Gemini":
  - Mock `generateStructuredJson` to return `{ tickers: [{ticker:'TSLA', name:'Tesla', market:'US', confidence:0.9, source:'explicit', mentionedAs:'Tesla'}, {ticker:'tsla', name:'Tesla Inc', market:'US', confidence:0.8, source:'explicit', mentionedAs:'TSLA'}], sentiment: 1, … }`.
  - Mock `mergeWithCashtags` to return its first arg unchanged.
  - Call `analyzeDraftContent('content', 'Asia/Taipei', meta)`.
  - Assert `result.stockTickers.length === 1`.
  - Assert `result.stockTickers[0].ticker === 'TSLA'`.
  - Assert the surviving entry retains the FIRST occurrence's metadata (e.g., `name === 'Tesla'`, not `'Tesla Inc'`).
- [ ] 1.2 Add a comment in the test pointing to this change: `// Regression test for D4 / GitHub #91. AI-layer dedup at ai.service.ts:895.`
- [ ] 1.3 `npx vitest run src/domain/services/__tests__/ai.service.test.ts` green.

## 2. Repository-layer defensive dedup

- [ ] 2.1 In `src/infrastructure/repositories/post.repository.ts::createPost`, around line 250, dedup `input.stockIds` before constructing `stocksParam`:
  ```ts
  const uniqueStockIds = Array.from(new Set(input.stockIds ?? []));
  const stocksParam = uniqueStockIds.map((stockId) => ({
    stock_id: stockId,
    sentiment: input.stockSentiments?.[stockId] ?? null,
    source: input.stockSources?.[stockId]?.source ?? 'explicit',
    inference_reason: input.stockSources?.[stockId]?.inferenceReason ?? null,
  }));
  ```
- [ ] 2.2 Use `uniqueStockIds` (not `input.stockIds`) for the `tickerToStockId` lookup query at ~line 261.
- [ ] 2.3 Use `uniqueStockIds` for the `invalidateScorecardsAfterPostWrite` call at ~line 314.
- [ ] 2.4 Add an inline comment: `// Defense in depth for #91. AI-service layer also dedupes; this protects non-AI callers.`

## 3. Repository-layer regression test

- [ ] 3.1 In `src/infrastructure/repositories/__tests__/post.repository.test.ts`, add a test "createPost dedupes duplicate stockIds":
  - Mock `createAdminClient()` so `supabase.rpc(name, args)` captures `args`.
  - Call `createPost({ kolId:'k1', stockIds:['s1', 's1', 's2'], content:'x', sourcePlatform:'twitter', sourceUrl:'http://x', images:[], sentiment:0, postedAt:new Date() }, 'u1')`.
  - Assert captured `args.p_stocks` has `length === 2` (one for s1, one for s2).
  - Assert `args.p_stocks` includes a stock_id `s1` exactly once and `s2` exactly once.
- [ ] 3.2 `npx vitest run src/infrastructure/repositories/__tests__/post.repository.test.ts` green.

## 4. Spec updates

- [ ] 4.1 Update `openspec/specs/ai-pipeline/spec.md`:
  - Add invariant under a new "Entity extraction contracts" section (or extend existing relevant section):
    > "AI-extracted entity lists (e.g., `analysis.stockTickers`) MAY contain duplicates as raw model output. The pipeline MUST deduplicate them by case-insensitive identifier before persistence. The current implementation lives in `analyzeDraftContent` immediately after ticker normalization (`ai.service.ts:895`)."
- [ ] 4.2 Update `openspec/specs/repository-contracts/spec.md`:
  - Add invariant under a new "Junction-table input dedup" section:
    > "Repository functions that accept an array of foreign keys for a junction table (e.g., `createPost(input).stockIds` → `post_stocks`) MUST deduplicate the array before constructing junction rows. Callers MAY pass duplicates without triggering a unique-constraint failure."
  - Cross-reference: "See change `dedup-stock-tickers-in-import-pipeline` for the introducing rationale (issue #91)."

## 5. Validation

- [ ] 5.1 `npm run type-check` clean.
- [ ] 5.2 `npm run lint` clean.
- [ ] 5.3 `npx vitest run src/domain/services src/infrastructure/repositories` all green.

## 6. Archive

- [ ] 6.1 PR merge → close GitHub issue #91, link to this change.
- [ ] 6.2 Run `/opsx:archive dedup-stock-tickers-in-import-pipeline`.
- [ ] 6.3 Update `openspec/changes/validate-podcast-pipeline-with-gooaye/baseline.md` D4 row to mark resolved, link this change.
