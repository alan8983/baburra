## Context

The runtime fix landed at the AI-service layer (`ai.service.ts:895-915`), which is correct: `analyzeDraftContent` is the one boundary every AI-driven pipeline path must cross. But the fix is currently a coincidence — three lines of code with a comment, untested, undeclared in any spec. That's how D4 happened in the first place: a missing-defense bug that was invisible until production data triggered it.

This change closes the loop. We add the regression test (the primary risk: refactor removes the dedup), add a defense-in-depth dedup at the repository sink (the secondary risk: future caller bypasses the AI layer), and codify both as spec invariants (the meta-risk: the next contributor doesn't know this is a contract).

Stakeholder: pipeline owners (don't want EP508 to recur), repository-contracts owners (need the invariant), ai-pipeline owners (need the invariant), future API consumers of `/api/import/batch` (defense in depth).

## Goals / Non-Goals

**Goals:**

- A regression test that fails immediately if the AI-layer dedup is removed or weakened.
- Repository-layer defense so non-AI callers can't reintroduce the unique-constraint failure.
- Two spec invariants — one per layer — making the dedup explicit contracts.

**Non-Goals:**

- Logging from the AI layer when dedup fires. The current implementation is silent; adding logs is a separate UX concern. (Note: the original explore-mode design suggested logging, but on review the AI layer is the wrong place — too much volume and not enough context. If we ever need observability here, a different change can add it.)
- Dedup for `post_arguments` (the other junction table written via `create_post_atomic`). Not the bug class observed; argument extraction is per-ticker so duplicates would only arise from a different upstream pattern.
- Generalizing to "all junction inputs everywhere". Spec calls out junction-table input dedup as a per-function contract, not a global rule, so future contributors can opt deviating with explicit reasoning.

## Decisions

### D1. Keep AI-layer dedup as primary defense

**Chosen:** The dedup at `ai.service.ts:895-915` stays. Repository-layer dedup is added as defense-in-depth.

**Rationale:** The AI layer is where every AI-driven path converges. Catching there (a) keeps the `IdentifiedTicker[]` contract clean for downstream consumers, (b) is the smallest possible blast radius for the fix, (c) gives us a single place to add observability later if needed. Repository dedup is additive — it covers callers that don't go through AI.

**Alternative considered:** Move dedup to `processUrl` in `import-pipeline.service.ts`. Rejected — would require duplicating the dedup at every future AI consumer, and the AI service is a more natural single-point-of-truth.

### D2. Dedup test uses mocked `generateStructuredJson`

**Chosen:** Mock `generateStructuredJson` to return a fake `RawDraftAnalysis` with duplicate tickers; assert `analyzeDraftContent`'s output has them deduplicated.

**Rationale:** Tests the entire normalize-then-dedup pipeline (lines 893-915 in ai.service.ts) end-to-end without network calls. Catches: removal of the dedup, accidentally moving it before normalization (which would change the dedup key), or replacing `Set` with a Map that uses a different key.

**Alternative considered:** Test the dedup function in isolation. Rejected — there is no extracted dedup function; it's inline. Extracting just for testability would be over-engineering for ~5 lines.

### D3. Repository-layer dedup is silent

**Chosen:** No log when repository-layer dedup fires.

**Rationale:** The repo layer doesn't have URL/source context, so a log message would be uninformative. The AI-layer is the canonical observation point if/when we add logging there. Silent dedup at the sink is a pure correctness guarantee with no observability cost.

### D4. Spec text: "MUST dedup", not "SHOULD dedup"

**Chosen:** Use RFC 2119 MUST in both spec invariants.

**Rationale:** The unique constraint is a hard wall. Allowing "SHOULD" would leave a gap where a contributor could think "the constraint will catch it, fine" and skip the dedup — defeating the entire point of the invariant. MUST makes the contract unambiguous.

## Risks / Trade-offs

- **[R1]** Two-layer dedup (AI + repo) is technically redundant for AI-driven paths. Cost: ~3 extra lines in repo + a test. Benefit: protects non-AI callers, explicit contract clarity. Worth it.
- **[R2]** Repository dedup means callers can pass duplicates without error — could mask a caller bug where they unintentionally produced duplicates. Mitigation: silent only at the repo layer; logging at the AI layer (if/when added) would catch the AI-driven-path version of this concern. For non-AI callers, "you passed duplicates but we ignored them" is the expected, documented behaviour per the new spec invariant.
- **[R3]** Spec MUST language is strong. If we ever discover a junction table where dedup at the repository would harm correctness (hard to imagine, but), the invariant has to be exception-listed. Mitigation: the invariant is per-function, so an exception lives next to the function it applies to.

## Migration Plan

1. Add the AI-layer regression test (`ai.service.test.ts`).
2. Add the repository-layer dedup (`post.repository.ts`).
3. Add the repository-layer regression test (`post.repository.test.ts`).
4. Update `ai-pipeline/spec.md` with the AI-layer invariant.
5. Update `repository-contracts/spec.md` with the repository-layer invariant.
6. `npm run type-check && npm run lint && npx vitest run`.

**Rollback:** Revert the commit. The AI-layer dedup remains untouched (it landed in a previous commit), so even on rollback the primary defense is in place.

## Open Questions

- Should we backport this dedup to `post_arguments` writes too? **Decision:** No, out of scope. Different bug class (would require duplicate-argument extraction, which `extractArguments` doesn't do per-ticker). Open a follow-up if it ever surfaces.
- Should the repository dedup also dedup `stockSentiments` keys / `stockSources` keys? **Decision:** Already deduplicated by virtue of being JS object keys. No additional action needed.
