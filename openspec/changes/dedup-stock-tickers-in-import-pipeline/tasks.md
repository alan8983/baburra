## 1. AI-layer regression test

- [x] 1.1 In `src/domain/services/__tests__/ai.service.test.ts`, add a test "analyzeDraftContent dedupes duplicate tickers from Gemini":
  - Mock `generateStructuredJson` to return `{ tickers: [{ticker:'TSLA', name:'Tesla', market:'US', confidence:0.9, source:'explicit', mentionedAs:'Tesla'}, {ticker:'tsla', name:'Tesla Inc', market:'US', confidence:0.8, source:'explicit', mentionedAs:'TSLA'}], sentiment: 1, … }`.
  - Mock `mergeWithCashtags` to return its first arg unchanged.
  - Call `analyzeDraftContent('content', 'Asia/Taipei', meta)`.
  - Assert `result.stockTickers.length === 1`.
  - Assert `result.stockTickers[0].ticker === 'TSLA'`.
  - Assert the surviving entry retains the FIRST occurrence's metadata (e.g., `name === 'Tesla'`, not `'Tesla Inc'`).
  - **Pre-existing coverage note:** the BTC variants test ("重複 ticker 應被去重 (D4 regression — post_stocks UNIQUE constraint)") added in `8a26af2` already pins the dedup count + first-confidence behaviour on a 4-entry input. The new TSLA test is additive — it explicitly asserts `name` preservation (the BTC test couldn't, since both entries had identical `name: 'Bitcoin'`). Together they cover dedup count + numeric-field + string-field first-wins.
  - `mergeWithCashtags` mock not needed in practice — the test content `'test'` contains no `$XXX` tokens, so the real `mergeWithCashtags` is a no-op pass-through.
- [x] 1.2 Add a comment in the test pointing to this change: `// Regression test for D4 / GitHub #91. AI-layer dedup at ai.service.ts:895.`
  - Comment added inline in the new test.
- [x] 1.3 `npx vitest run src/domain/services/__tests__/ai.service.test.ts` green. → all tests pass (84 in this file post-add).

## 2. Repository-layer defensive dedup

- [x] 2.1 In `src/infrastructure/repositories/post.repository.ts::createPost`, around line 250, dedup `input.stockIds` before constructing `stocksParam`.
- [x] 2.2 Use `uniqueStockIds` (not `input.stockIds`) for the `tickerToStockId` lookup query at ~line 261.
- [x] 2.3 Use `uniqueStockIds` for the `invalidateScorecardsAfterPostWrite` call at ~line 314.
- [x] 2.4 Add an inline comment: `// Defense in depth for #91. AI-service layer also dedupes; this protects non-AI callers.`
  - Expanded to a multi-line block comment naming the AI-layer line, the protected call sites (`/api/import/batch`, webhooks, seed scripts), and the "silent" rationale (the AI layer is the canonical observation point for logging if/when added).

## 3. Repository-layer regression test

- [x] 3.1 In `src/infrastructure/repositories/__tests__/post.repository.test.ts`, add a test "createPost dedupes duplicate stockIds":
  - Mock `createAdminClient()` so `supabase.rpc(name, args)` captures `args`.
  - Call `createPost({ kolId:'k1', stockIds:['s1', 's1', 's2'], content:'x', sourcePlatform:'twitter', sourceUrl:'http://x', images:[], sentiment:0, postedAt:new Date() }, 'u1')`.
  - Assert captured `args.p_stocks` has `length === 2` (one for s1, one for s2).
  - Assert `args.p_stocks` includes a stock_id `s1` exactly once and `s2` exactly once.
  - Added two cases under `describe('post.repository createPost defensive stockIds dedup (#91 / D4)', …)`: (a) duplicate-collapse + sentiment preservation through the dedup, (b) pass-through for already-unique stockIds (control). Reuses the same Supabase rpc-capture mock harness as the D2 regression tests in the same file — kept the file cohesive rather than spawning a third test file.
- [x] 3.2 `npx vitest run src/infrastructure/repositories/__tests__/post.repository.test.ts` green. → 5 tests pass (3 from D2 + 2 from D4).

## 4. Spec updates

- [x] 4.1 Update `openspec/specs/ai-pipeline/spec.md`:
  - Added new section "Entity extraction contracts" with the invariant "AI-extracted entity lists MUST be deduplicated before persistence". Cites `ai.service.ts:895-915` as the current implementation, walks through the BTC worked example, and cross-references R9 in `repository-contracts` so the two layers form an explicit pair.
- [x] 4.2 Update `openspec/specs/repository-contracts/spec.md`:
  - Added `Requirement: Junction-table input dedup (R9)`. RFC 2119 SHALL/MAY language (per design D4). Two scenarios: caller passes duplicate stockIds → no constraint failure, and "new repo function added" → unit test required. Cross-references issue #91 and the AI-layer dedup so future contributors see the pair.
  - Placed before R7 to keep R6/R7 (the exception-list pair) together at the bottom, mirroring the placement of R8 (input persistence) added by the parallel `fix-posts-source-rollback-completion` change.

## 5. Validation

- [x] 5.1 `npm run type-check` clean. → 0 errors.
- [x] 5.2 `npm run lint` clean. → 0 errors (18 pre-existing warnings unchanged).
- [x] 5.3 `npx vitest run src/domain/services src/infrastructure/repositories` all green. → 21 files, 384 tests passed.

## 6. Archive

- [ ] 6.1 PR merge → close GitHub issue #91, link to this change.
- [ ] 6.2 Run `/opsx:archive dedup-stock-tickers-in-import-pipeline`.
- [x] 6.3 Update `openspec/changes/validate-podcast-pipeline-with-gooaye/baseline.md` D4 row to mark resolved, link this change.
