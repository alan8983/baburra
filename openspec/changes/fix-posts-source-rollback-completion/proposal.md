## Why

GitHub Issue [#89](https://github.com/alan8983/baburra/issues/89) (D2 from `validate-podcast-pipeline-with-gooaye` baseline) reported that `scripts/seed-rollback.sql` was a no-op because `posts.source` was never populated by the seed pipeline.

The primary fix landed on `main` in commit `48eb1bb` (`fix(pipeline): persist posts.source from ScrapeOverrides (D2 — #89)`):

- ✅ Migration `supabase/migrations/20260425000001_create_post_atomic_source.sql` adds `p_source TEXT DEFAULT NULL`.
- ✅ `database.types.ts:1123` reflects the new RPC signature (`p_source?: string`).
- ✅ `src/infrastructure/repositories/post.repository.ts:306` passes `p_source: input.source ?? null`.
- ✅ `src/domain/services/import-pipeline.service.ts:331,785` accepts `source` and forwards it.
- ✅ `src/domain/services/profile-scrape.service.ts:501` forwards `overrides?.source ?? null`.
- ✅ `scripts/scrape-guyi-podcast-ep501-600.ts:88` sets `source: 'seed'` in overrides.
- ✅ Backfill: 53 Gooaye podcast posts updated to `source='seed'` (per commit message).

Three gaps remain before this can be fully closed:

1. **No regression test.** A future contributor changing the RPC signature, the `CreatePostInput` shape, or the `processJobBatch` overrides plumbing could silently drop `source` again — same bug class, no test to catch it.
2. **No spec invariant.** `repository-contracts/spec.md` doesn't declare "every input field on `CreatePostInput` must be persisted to the DB" — the bug class is undocumented as a contract.
3. **No verification that the rollback script actually works end-to-end now.** The backfill claim in the commit message hasn't been independently verified by a dry-run of `seed-rollback.sql`.

## What Changes

- Add a vitest covering `createPost(input)` → RPC call: assert `p_source` is forwarded as-passed (both with `source: 'seed'` and with `source` omitted).
- Add `openspec/specs/repository-contracts/spec.md` invariant: "Input persistence — every field declared in `CreatePostInput` (and other `Create*Input` types) must reach the DB write or be explicitly documented as derived/computed."
- Verify operational state:
  - Confirm migration `20260425000001_create_post_atomic_source` is applied to remote (`supabase migration list`).
  - Confirm row count: `SELECT COUNT(*) FROM posts WHERE source = 'seed';` matches expected (53 from backfill + any new).
  - Run `scripts/seed-rollback.sql` in a local transaction (`BEGIN; \i …; ROLLBACK;`) against staging-shape data; record DELETE counts at each step.

**Non-goals:**

- Do **not** re-run the migration or re-do the backfill. Both are done.
- Do **not** add a `source` column to any other table.
- Do **not** add tests for the rollback script SQL itself — too much friction for a one-off operational tool.

## Capabilities

### Modified Capabilities

- `repository-contracts`: New "Input persistence invariants" section makes silent-drop bugs (the class that produced #89) a contract violation, not a coincidence.

## Impact

- **Code**: New tests in `src/infrastructure/repositories/__tests__/post.repository.test.ts` (extend existing file).
- **DB**: No changes (migration + backfill already done).
- **Specs**: `openspec/specs/repository-contracts/spec.md` updated.
- **User-visible**: None.
- **Dependencies**: None — independent of #90 / #91.
- **Independence**: Fully independent. Can ship in any order vs. the other two.
