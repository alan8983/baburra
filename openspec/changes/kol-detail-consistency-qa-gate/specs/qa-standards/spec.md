## ADDED Requirements

### Requirement: KOL detail page consistency invariants (Q1)
The system SHALL provide a CLI consistency checker (`scripts/check-kol-consistency.ts <kolId>`) that asserts four invariants for the named KOL and exits non-zero with a printed diff when any of them fails. The four invariants are:

- **I-1**: `kols.post_count` (denorm) equals `COUNT(posts WHERE kol_id = <kolId>)`.
- **I-2**: `kol_scorecard_cache.post_count` for `<kolId>` equals that same count, AND `stale = false`, AND `now() - computed_at < 12 hours`.
- **I-3**: For every `stock_id` such that `(kolId, stock_id)` has at least 3 posts, `buckets_by_stock[stock_id].day30.total ≥ 1`. Short-circuits to "no signal" (passes) when `volatility_thresholds` has no rows for the `(ticker, 30)` pair — that is a legitimate cold-start state, not a bug.
- **I-4**: `listPosts({kolId, limit: 1000}).total` equals `kols.post_count`.

#### Scenario: Consistent KOL passes the check
- **WHEN** the operator runs `npx tsx scripts/check-kol-consistency.ts <kolId>` against a KOL whose denorm count, cache row, per-stock buckets, and post-list query all agree
- **THEN** the script writes `OK` to stdout, exit code is 0

#### Scenario: Stale cache fails I-2
- **WHEN** the operator runs the check against a KOL whose `kol_scorecard_cache.stale` is `true` OR whose `computed_at` is older than 12 h
- **THEN** the script writes a diff identifying I-2 as the failed invariant, names the kolId, prints the offending values (post_count / stale / computed_at), and exit code is 1

#### Scenario: Tiingo-dropped per-stock bucket fails I-3
- **WHEN** the operator runs the check against a KOL where some stock has ≥3 posts but its `buckets_by_stock[stock_id].day30.total = 0` AND `volatility_thresholds` has rows for the (ticker, 30) pair
- **THEN** the script writes a diff identifying I-3 as the failed invariant, names every offending (kolId, stockId, ticker) tuple, and exit code is 1

#### Scenario: Pagination cap regression fails I-4
- **WHEN** the operator runs the check against a KOL whose `listPosts({kolId, limit: 1000}).total < kols.post_count`
- **THEN** the script writes a diff identifying I-4 as the failed invariant, prints both numbers, and exit code is 1

### Requirement: Scrape scripts must run the consistency check (Q2)
Every script in `scripts/` that creates or refreshes posts for a specific KOL (Gooaye seed scripts, retry scripts, validation-scrape scripts) SHALL invoke `check-kol-consistency.ts` against the affected KOL as its final step and propagate the script's exit code. A non-zero exit from the check SHALL fail the surrounding script.

#### Scenario: Scrape script tail-call fails on stale cache
- **WHEN** a scrape script (e.g., `scrape-guyi-podcast-ep501-600.ts`) finishes importing posts but the synchronous post-completion recompute (D2 in design.md) was skipped or errored
- **THEN** the consistency check tail-call fails I-2, the script exits non-zero, and the operator sees the failed invariant in the same terminal that ran the scrape

#### Scenario: Scrape script tail-call passes on healthy run
- **WHEN** a scrape script finishes importing posts AND the post-completion recompute lands a fresh, fully-populated cache row
- **THEN** the consistency check tail-call exits 0 and the script's overall exit code is 0

### Requirement: KOL detail page renders end-to-end (Q3)
The KOL detail page SHALL render the per-stock breakdown count and a non-dash win-rate ring within 30 seconds of page load for any KOL whose consistency check (Q1) passes.

#### Scenario: Playwright e2e against the seeded test KOL
- **WHEN** Playwright navigates to `/kols/<seededKolId>`, waits up to 30 s for the win-rate query to settle, and queries the DOM for the NVDA stock card
- **THEN** the visible per-stock count text matches `COUNT(post_stocks WHERE stock_id = <NVDA-id> AND post_id IN (SELECT id FROM posts WHERE kol_id = <seededKolId>))` from a SQL probe, AND the win-rate ring's accessible value text is not the literal string `—`

### Requirement: OpenSpec validation hook runs the consistency check (Q4)
The `validate-podcast-pipeline-with-gooaye` change's tasks.md SHALL include a step that runs `check-kol-consistency.ts` against the Gooaye KOL ID and gates the `opsx:validate` workflow on a green result. Future OpenSpec changes that touch the import pipeline, scorecard cache, or KOL detail page SHALL extend this pattern.

#### Scenario: opsx:validate enforces the gate
- **WHEN** an operator runs the OpenSpec validation workflow on a change that has touched any of `src/domain/services/import-pipeline.service.ts`, `src/domain/services/scorecard.service.ts`, `src/domain/services/profile-scrape.service.ts`, or `src/app/(app)/kols/**`
- **THEN** the workflow runs `check-kol-consistency.ts <gooayeKolId>` and refuses to mark the change validated unless the script exits 0
