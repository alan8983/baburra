## 1. Regression test

- [ ] 1.1 In `src/infrastructure/repositories/__tests__/post.repository.test.ts` (extend existing file), add a test: mock `createAdminClient()` such that `supabase.rpc(...)` captures its args; call `createPost({ kolId, content, sourceUrl, sourcePlatform, images:[], sentiment:0, postedAt:new Date(), source:'seed', stockIds:[] }, 'user-1')`; assert the captured `rpc` call's second arg has `p_source: 'seed'`.
- [ ] 1.2 Mirror case: omit `source` → assert `p_source: null`.
- [ ] 1.3 `npx vitest run src/infrastructure/repositories/__tests__/post.repository.test.ts` green.

## 2. Spec invariant

- [ ] 2.1 In `openspec/specs/repository-contracts/spec.md`, add a new section "Input persistence invariants":
  - State: "Every field declared on `Create*Input` types (e.g., `CreatePostInput`, `CreateKolInput`, `CreateScrapeJobInput`) MUST be persisted to the DB write, OR be explicitly annotated as derived/computed in the type's JSDoc."
  - List worked examples for `CreatePostInput`: `source`, `contentFingerprint`, `aiModelVersion`, `stockSentiments`, `stockSources` — each was at one point silently dropped or could plausibly be.
  - Add the meta-rationale: "This invariant exists because issue #89 (D2) was a silent-drop bug — `posts.source` had a column, an input field, and a use case (rollback script), but the RPC call dropped it, and the failure was invisible until weeks later."

## 3. Operational verification

- [ ] 3.1 Run `supabase migration list -p "$SUPABASE_DB_PASSWORD"`; confirm `20260425000001_create_post_atomic_source` shows applied on remote. Record output in this checkbox.
- [ ] 3.2 Run `SELECT COUNT(*) FROM posts WHERE source = 'seed';` against the linked project; confirm count ≥ 53 (the backfill claim from commit 48eb1bb). Record count.
- [ ] 3.3 Run `SELECT COUNT(*) FROM posts WHERE source IS NULL AND kol_id IN (SELECT kol_id FROM kol_sources WHERE source = 'seed');` — should be 0 (any non-zero would mean the backfill missed rows or new seed runs happened without the fix). Record count.
- [ ] 3.4 In a transaction (`BEGIN; \i scripts/seed-rollback.sql; … ROLLBACK;`), run the rollback script against the linked project. Capture the row count from each DELETE statement (psql will report `DELETE n` after each). Confirm counts are non-zero and match expected seed footprint.

## 4. Validation

- [ ] 4.1 `npm run type-check` clean.
- [ ] 4.2 `npm run lint` clean.
- [ ] 4.3 `npx vitest run src/infrastructure/repositories` all green.

## 5. Archive

- [ ] 5.1 PR merge → close GitHub issue #89, link to this change.
- [ ] 5.2 Run `/opsx:archive fix-posts-source-rollback-completion`.
- [ ] 5.3 Update `openspec/changes/validate-podcast-pipeline-with-gooaye/baseline.md` D2 row to mark resolved, link this change.
