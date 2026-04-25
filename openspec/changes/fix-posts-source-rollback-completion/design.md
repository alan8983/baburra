## Context

This is the closure arm of D2 from `validate-podcast-pipeline-with-gooaye`. The primary fix landed in commit `48eb1bb` and a backfill was performed. What remains is the meta-work: lock in the contract, verify the artifact end-to-end, and make the bug class structurally harder to recur.

The bug class — "RPC parameter silently dropped between caller and database" — is invisible until something downstream depends on the dropped data (in this case, `seed-rollback.sql`). The right defensive move is a unit test that pins the wiring, plus a spec invariant that makes the wiring an explicit contract instead of an implicit assumption.

Stakeholder: `validate-podcast-pipeline-with-gooaye` owners (need §8.5 rollback to actually work), seed-script maintainers (need a guardrail against regression), repository-contracts owners (need the invariant codified).

## Goals / Non-Goals

**Goals:**

- A vitest that fails immediately if the `source` field stops being forwarded to `create_post_atomic`.
- A spec invariant that future contributors must reckon with when adding `Create*Input` fields.
- Verified end-to-end rollback flow against actual data.

**Non-Goals:**

- Re-running the backfill. Already done.
- Refactoring the seed/user provenance model (e.g., to a separate column or table). String-tag is fine.
- Backfilling `source = 'user'` for non-seed historical rows. NULL is semantically correct for unknown provenance.

## Decisions

### D1. Test scope: unit test on `createPost`, not on `processUrl`

**Chosen:** Mock `supabase.rpc` and assert `p_source` arg matches `input.source`.

**Rationale:** The bug was specifically the wiring between `CreatePostInput.source` and the RPC call. Unit-test that one wiring directly. The upstream wiring (`processJobBatch` → `processUrl` → `createPost`) is implicitly exercised by the existing seed pipeline tests; testing it again here would be redundant.

**Alternative considered:** Integration test with real Supabase. Rejected — slower, requires DB env, doesn't add information for this specific bug class.

### D2. Spec invariant phrasing: input-fields-reach-DB

**Chosen:** State the invariant per `Create*Input` type, with `posts.source`, `contentFingerprint`, and `aiModelVersion` as worked examples.

**Rationale:** The general principle is "fields that the input type declares must be persisted or explicitly marked as derived". Phrasing it generically catches the bug class beyond just `source`. Listing worked examples gives future contributors a checklist.

**Alternative considered:** Per-field invariants ("posts.source must be persisted from CreatePostInput.source"). Rejected as too verbose and not robust to new fields.

### D3. Operational verification scope

**Chosen:** Three checks: (a) migration applied on remote, (b) row count matches expected, (c) rollback script dry-run shows correct DELETE counts.

**Rationale:** Each check independently confirms a different layer: (a) the schema change is live, (b) the data backfill worked, (c) the downstream consumer (rollback script) can actually find the rows. All three together prove the closure.

## Risks / Trade-offs

- **[R1]** Unit test mocks the Supabase client, which means it doesn't catch a hypothetical schema-vs-RPC-signature mismatch (e.g., column was renamed but RPC still calls it the old name). Mitigation: out of scope for this bug class; the existing type-check pass already validates the generated types match the live schema.
- **[R2]** Spec invariant is broader than the immediate bug. Risk of being over-applied or pedantic for fields that genuinely are derived. Mitigation: the spec language explicitly allows "documented as derived/computed" as an out, so it's a checklist, not a hard ban.
- **[R3]** Rollback dry-run requires either staging access or a local DB with seed data. Mitigation: tasks.md offers both paths; pick whichever the operator has.

## Migration Plan

1. Add the unit test, run vitest, confirm green.
2. Update `repository-contracts/spec.md`.
3. Run operational verification checks (migration list, row count, rollback dry-run); record results in tasks.md checkboxes.
4. Open PR, merge, archive.

**Rollback:** Revert the commit. No DB changes in this scope.

## Open Questions

- None remaining; the bug class is well understood and the work is closure-shaped.
