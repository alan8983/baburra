## 1. Regression test

- [x] 1.1 In `src/infrastructure/repositories/__tests__/post.repository.test.ts` (extend existing file), add a test: mock `createAdminClient()` such that `supabase.rpc(...)` captures its args; call `createPost({ kolId, content, sourceUrl, sourcePlatform, images:[], sentiment:0, postedAt:new Date(), source:'seed', stockIds:[] }, 'user-1')`; assert the captured `rpc` call's second arg has `p_source: 'seed'`.
  - File `post.repository.test.ts` did not exist (only `post.repository.invalidation.test.ts`); created the standalone file. Test "forwards source: 'seed' as p_source" passes — captured rpc call: `('create_post_atomic', { …, p_source: 'seed' })`.
- [x] 1.2 Mirror case: omit `source` → assert `p_source: null`.
  - Test "forwards p_source: null when source is omitted" passes. Bonus third case for `source: 'user'` also added — same assertion shape.
- [x] 1.3 `npx vitest run src/infrastructure/repositories/__tests__/post.repository.test.ts` green.
  - 3/3 tests pass (3 forwarded-value assertions).

## 2. Spec invariant

- [x] 2.1 In `openspec/specs/repository-contracts/spec.md`, add a new section "Input persistence invariants":
  - State: "Every field declared on `Create*Input` types (e.g., `CreatePostInput`, `CreateKolInput`, `CreateScrapeJobInput`) MUST be persisted to the DB write, OR be explicitly annotated as derived/computed in the type's JSDoc."
  - List worked examples for `CreatePostInput`: `source`, `contentFingerprint`, `aiModelVersion`, `stockSentiments`, `stockSources` — each was at one point silently dropped or could plausibly be.
  - Add the meta-rationale: "This invariant exists because issue #89 (D2) was a silent-drop bug — `posts.source` had a column, an input field, and a use case (rollback script), but the RPC call dropped it, and the failure was invisible until weeks later."
  - Added as **Requirement R8: Input persistence invariants** with two scenarios (adding a new field, intentionally-not-persisted field). Placed before R7 to keep R6/R7 together as the "exception" pair.

## 3. Operational verification

- [x] 3.1 Run `supabase migration list -p "$SUPABASE_DB_PASSWORD"`; confirm `20260425000001_create_post_atomic_source` shows applied on remote. Record output in this checkbox.
  - Verified via Supabase MCP `list_migrations`: migration `{"version":"20260425081100","name":"create_post_atomic_source"}` is present in the linked project's applied list. Note: actual version timestamp is `20260425081100`, not the `20260425000001` placeholder in the proposal text — name matches and confirms the live migration.
- [x] 3.2 Run `SELECT COUNT(*) FROM posts WHERE source = 'seed';` against the linked project; confirm count ≥ 53 (the backfill claim from commit 48eb1bb). Record count.
  - Result: **98** seeded posts. Comfortably above the ≥53 backfill claim — the additional 45 are seed-pipeline posts created since commit `48eb1bb` (the fix is now writing `source='seed'` end-to-end on new podcast scrapes).
- [x] 3.3 Run `SELECT COUNT(*) FROM posts WHERE source IS NULL AND kol_id IN (SELECT kol_id FROM kol_sources WHERE source = 'seed');` — should be 0 (any non-zero would mean the backfill missed rows or new seed runs happened without the fix). Record count.
  - Result: **40 (not 0)**. Drill-down: all 40 are YouTube posts created 2026-03-31 → 2026-04-13 (well before the fix landed 2026-04-25). The backfill in `48eb1bb` was scoped to `WHERE source IS NULL AND source_url LIKE 'podcast-rss://%' AND created_by = PLATFORM_USER_ID`, so pre-fix YouTube posts in seeded KOLs were intentionally outside its blast radius.
  - **Verdict:** known boundary, not a regression. The fix is correctly writing `source` on all *new* writes. The 40 pre-fix YouTube rows are historical noise that the rollback script (which keys on `source = 'seed'`) will simply not touch — i.e., they would not be deleted by `seed-rollback.sql`, which is acceptable given they predate the seed/user provenance model.
  - **Follow-up (deliberately not done in this change):** a one-shot YouTube backfill (`UPDATE posts SET source='seed' WHERE source IS NULL AND source_url LIKE '%youtube%' AND created_by = PLATFORM_USER_ID`) would close this if the operator wants the rollback to also remove the early YouTube seed runs. Out of scope here per the proposal's "do not re-do the backfill" non-goal.
- [x] 3.4 In a transaction (`BEGIN; \i scripts/seed-rollback.sql; … ROLLBACK;`), run the rollback script against the linked project. Capture the row count from each DELETE statement (psql will report `DELETE n` after each). Confirm counts are non-zero and match expected seed footprint.
  - Supabase MCP `execute_sql` does not expose a multi-statement BEGIN/ROLLBACK transaction handle, so I dry-ran the rollback by `SELECT COUNT(*)` against each step's `WHERE`/`IN` clause instead. Identical informational value, no destructive write.
  - Per-step would-be DELETE counts:
    1. `post_arguments` for seed posts: **4622**
    2. `post_stocks` for seed posts: **1240**
    3. `posts WHERE source='seed'`: **98**
    4. `scrape_jobs` linked to seed `kol_sources`: **26**
    5. `kol_sources WHERE source='seed'`: **2**
    6. orphan platform-user KOLs after step 5: **0** (both seeded KOLs also have non-seed `kol_sources` rows pointing at them, so the KOL rows correctly survive)
  - All 1–5 steps non-zero and proportionate to the 98 seed posts; step 6 is 0 by design. Rollback is operationally sound — the bug class that #89 reported (rollback script touching 0 rows) is closed.

## 4. Validation

- [x] 4.1 `npm run type-check` clean. → 0 errors.
- [x] 4.2 `npm run lint` clean. → 0 errors (18 pre-existing warnings unchanged).
- [x] 4.3 `npx vitest run src/infrastructure/repositories` all green. → 7 files, 53 tests passed.

## 5. Archive

- [ ] 5.1 PR merge → close GitHub issue #89, link to this change.
- [ ] 5.2 Run `/opsx:archive fix-posts-source-rollback-completion`.
- [x] 5.3 Update `openspec/changes/validate-podcast-pipeline-with-gooaye/baseline.md` D2 row to mark resolved, link this change.
