## Context

Today's ingestion pipeline in `src/domain/services/import-pipeline.service.ts` has one dedup gate: `findPostBySourceUrl(url)` at the top of `processUrl()`, backed by a `UNIQUE (source_url, kol_id)` constraint on `posts`. It catches exact-URL re-imports but nothing else.

The expensive work happens downstream of that gate, in this order:

```
processUrl(url):
  1. findPostBySourceUrl(url)              ← URL gate (today's only check)
  2. extractorFactory.extractFromUrl(url)
  3. transcribeAudio(...)              $$$  (Deepgram primary; cached in `transcripts` table by source_url)
  4. analyzeDraftContent(...)           $$  (Gemini sentiment + ticker ID)
  5. argument extraction per stock      $$  (Gemini, one call per ticker)
  6. createPost → create_post_atomic RPC (hits unique constraint)
```

For the Gooaye case (Spotify + Apple + direct-RSS of the same episode), the podcast extractor resolves all three input URLs to the same RSS enclosure URL, so the `transcripts` cache already deduplicates step 3. But steps 4-5 still fire on every duplicate import, and step 6 creates three distinct `posts` rows that all get counted independently in win-rate queries.

The point of leverage is therefore **between step 3 and step 4**: after we have a transcript, before we've paid any Gemini money.

## Goals / Non-Goals

**Goals:**
- Stop paying Gemini costs on duplicate content (sentiment analysis + argument extraction).
- Make duplicate content queryable as a single logical unit for analytical purposes (without forcing every caller to change their query today).
- Preserve per-platform attribution — a user who imports the Spotify version should see "also on Spotify" next to the primary's YouTube-origin record.
- Reversible schema: if this approach fails, columns can be dropped without losing data.

**Non-Goals:**
- Win-rate calculator audit — tracked in a follow-up GitHub issue; win-rate work is on a separate branch and this change must not conflict with it.
- Cross-KOL deduplication. If KOL-A and KOL-B both upload the same clip, we keep two posts.
- Backfill of historical duplicates. Forward-only.
- Profile-discovery-time dedup. A future system-design change will address "how do we aggregate cross-platform posts for the user" at the discovery layer.
- A Gemini-powered "canonical summary hash." Cost-defeating.

## Decisions

### D1: Dedup gate placement is post-transcribe, pre-AI-analyze (Gate C)

**Decision:** Insert the fingerprint check in `processUrl()` between `transcribeAudio()` and `analyzeDraftContent()`.

**Rationale:** Transcription is the only step that produces the signal we need to fingerprint. Placing the gate earlier (pre-transcribe) would require fingerprinting on metadata alone, which is brittle and doesn't catch YouTube-vs-podcast. Placing it later (post-analyze) would miss the savings we actually care about. The transcript cost is accepted because (a) the transcripts cache already collapses the common podcast case, and (b) a Deepgram minute is cheap relative to a Gemini argument extraction call × N stocks.

### D2: Mirror rows with `primary_post_id` self-FK (Option Q)

**Decision:** Duplicates become new `posts` rows with `primary_post_id` pointing at the first-seen row. Primary rows have `primary_post_id = NULL` and own all `post_stocks` and `post_arguments`. Mirror rows own their own `source_url`, `source_platform`, `title`, `posted_at`, and `user_id`, but have `sentiment = NULL`, no `post_stocks`, and no `post_arguments`.

**Rationale:** Compared to a flat `post_sources` child table, this preserves the shape of `posts` so existing queries continue to return one row per (URL, KOL) pair as they do today. It also keeps per-platform attribution (when was this discovered on YouTube?) while centralizing the analytical data on one row.

**Alternative considered:** a separate `post_sources` table with a many-to-one relationship to `posts`. Rejected because it changes the semantics of every query that joins `posts` and forces a migration of the existing `source_url` column. The mirror-row approach is additive — existing rows become primaries automatically.

### D3: No mirror-of-mirror chains

**Decision:** A CHECK constraint and/or partial unique index enforces: if a row has `primary_post_id IS NOT NULL`, the referenced row must have `primary_post_id IS NULL`. Plus `id != primary_post_id`.

**Rationale:** Mirror chains complicate delete-promotion and analytical queries. Forcing a flat two-level structure (primary → mirrors) makes every operation local.

**Implementation:** The CHECK constraint `id != primary_post_id` is trivial. The "no chaining" invariant is harder to express as a DB constraint (CHECKs can't subquery). Enforce it in the repository layer on mirror insert: look up the target; if its `primary_post_id IS NOT NULL`, resolve to that row instead before creating the mirror. In practice the lookup already finds a primary (the partial index on `WHERE primary_post_id IS NULL` guarantees this), so this degenerates to a defensive assertion.

### D4: Fingerprint is `sha256(normalize(transcript))` over first 500 normalized words

**Decision:** Normalization pipeline, in order:
1. Strip VTT/SRT timestamp lines (`^\d{2}:\d{2}:\d{2}[.,]\d+ --> ...`)
2. Strip speaker labels (`^[A-Za-z ]+:\s`)
3. Strip bracket markers (`\[Music\]`, `\[Applause\]`, `\(inaudible\)`, etc.)
4. Lowercase
5. Remove all punctuation except intra-word apostrophes (`don't` stays, `"hello,"` → `hello`)
6. Collapse all whitespace runs to single spaces
7. Tokenize on whitespace
8. Take first 500 tokens
9. Rejoin with single spaces
10. `sha256` hex-encode

Store as `TEXT` in `posts.content_fingerprint`.

**Rationale:** First 500 words is stable across minor tail differences (an episode's outro might include a platform-specific CTA — "follow me on Twitter" vs "check the show notes"). Normalization handles the common cross-transcript artifacts. Sha256-hex is indexable, deterministic, no-dependency, debuggable.

**Alternative considered:** simhash over shingles. Rejected for v1 because the Gooaye case — Spotify/Apple/direct-RSS — all goes through the same Deepgram run via the same enclosure URL, so strict hash is sufficient. Simhash buys us YouTube-captions ↔ Deepgram-podcast matching, which is a real but narrower win we'd rather ship later if observations justify it.

**Caveat:** The normalization pipeline is the technical risk in this whole change. It gets a dedicated test suite with fixture transcripts (YouTube caption format, RSS VTT, Deepgram JSON-derived text) to prove round-trip stability.

### D5: First-seen wins primary status, no re-election

**Decision:** The first post of a content group to be created is the primary forever (unless deleted — see D6). If Spotify imports at 9:00 and YouTube at 9:05, Spotify is primary.

**Rationale:** Keeps the import path idempotent and free of race-sensitive logic. "Canonical platform" is a value judgment we don't want to bake into the pipeline. The UI can always show all sources with equal prominence.

### D6: Delete promotes oldest surviving mirror

**Decision:** When a primary is deleted, a DB-level mechanism (trigger or RPC called from the repository `deletePost` path) runs atomically:
1. Find the oldest surviving mirror by `created_at` for this content group.
2. If none exists, nothing to do — simple delete.
3. Otherwise:
   a. Reassign all `post_stocks` rows from the deleted primary to the promoted mirror (`UPDATE post_stocks SET post_id = <new primary> WHERE post_id = <old primary>`).
   b. Same for `post_arguments`.
   c. Copy `content_fingerprint` (and `sentiment`) from the deleted primary to the promoted mirror.
   d. Null out `primary_post_id` on the promoted mirror.
   e. Update remaining mirrors to point at the new primary (`UPDATE posts SET primary_post_id = <new primary> WHERE primary_post_id = <old primary>`).
   f. Delete the original.

**Rationale:** Keeps the analysis data alive even when the user deletes the post they originally imported from. Prevents data loss and preserves win-rate continuity.

**Implementation:** A `BEFORE DELETE` trigger on `posts` is the cleanest option. Alternative: a `delete_post_and_promote_mirror(post_id)` RPC that the repository calls explicitly. The RPC is easier to test and unit-reason-about; the trigger is harder to bypass. We'll prototype with the RPC; promote to trigger if we find any code path that deletes posts without going through the repository.

**Safety net:** `ON DELETE SET NULL` on the `primary_post_id` FK is kept as a backstop so that even if promotion logic is bypassed (manual SQL, cascading cleanup), mirrors don't end up with dangling FKs. They'd become orphaned primaries without analysis data — degraded, but not broken.

### D7: Mirror URL lookup returns the mirror row as-is

**Decision:** `findPostBySourceUrl(url)` is unchanged. If `url` exactly matches a mirror row's `source_url`, return that mirror row (not the primary it points at).

**Rationale:** This function answers "have I seen exactly this URL before?" The mirror *is* that URL's record. Callers that need the primary can follow `primary_post_id`. Forcing the function to always return the primary would break the duplicate-URL-rejection path at step 1 of `processUrl()`.

### D8: Billing is charge-same on mirror imports

**Decision:** The user pays the full posted credit cost on a mirror import, even though the pipeline skips `analyzeDraftContent` and per-stock argument extraction.

**Rationale:** (1) Billing UX stays simple — a mirror import looks identical to a normal import from the user's perspective. (2) Credits aren't refunded, so there's no incentive to game platform selection. (3) The cost savings accrue to us (cheaper AI spend per mirror) rather than being passed to the user. Explicit and acceptable per product decision.

### D9: Forward-only, intra-KOL scope

**Decision:** Fingerprint lookup is `(kol_id, content_fingerprint)`. Cross-KOL matches are not detected. No backfill of historical rows — existing posts get `content_fingerprint = NULL` and are treated as primaries.

**Rationale:** The stated Gooaye case is intra-KOL. Cross-KOL reposts are a different problem (attribution, quoting, fair-use considerations) and out of scope. Forward-only avoids a risky batch migration over historical data and avoids any rewrite of already-computed analysis.

### D10: Win-rate calculators are safe; patch the three direct-count queries

**Decision:** Win-rate/return-rate calculators (`src/domain/calculators/`, `/api/kols/[id]/win-rate`, `/api/stocks/[ticker]/win-rate`, `/api/kols/[id]/return-rate`, `/api/stocks/[ticker]/return-rate`) do NOT need changes. They all flow through `listPosts()` which INNER JOINs `post_stocks` — since mirrors have no `post_stocks` rows, they are automatically excluded from all performance metrics (Hit Rate, SQR, Precision, Avg Excess, etc.).

Three direct-count queries on the `posts` table DO need `.is('primary_post_id', null)` filtering — these are included in this change:
1. `src/app/api/dashboard/route.ts` — total post count (`select('id', { count: 'exact', head: true })`)
2. `src/app/api/dashboard/route.ts` — KOL-ID aggregation for leaderboard ranking (`select('kol_id')`)
3. `src/app/api/posts/unread-count/route.ts` — unread badge count

**Rationale:** The `kol-performance-metrics-ui` change has already merged to main. A fresh audit confirms all performance-metric paths join through `post_stocks`. The three count queries are small, localized fixes (one `.is()` filter each) that prevent mirrors from inflating dashboard stats and unread badges.

### D11: No feature flag

**Decision:** The dedup gate is always on once merged. No kill switch.

**Rationale:** Failure mode is benign: a fingerprint miss falls through to the existing pipeline unchanged. There's no regression surface for a rollback flag to protect. Keeping the code path unconditional avoids the dead-code cleanup burden.

## Risks / Trade-offs

**[Risk] Fingerprint normalization produces false negatives.** A YouTube episode with captions transcribed by YouTube will not match the same audio transcribed by Deepgram in its podcast form. Mitigation: explicit v2 path (simhash) captured in this design; fixture-based unit tests for the normalization pipeline; log fingerprint near-misses for observability.

**[Risk] Fingerprint produces false positives.** Two different episodes with similar openings (e.g., the same theme song / intro script) could collide on the first-500-word hash. Mitigation: 500 words is generous; the KOL-scoping (`(kol_id, content_fingerprint)`) bounds the collision space to a single author; fixture tests include same-intro-different-content cases. If we see real collisions we lengthen the prefix.

**[Risk] Delete-promotion bug corrupts analysis data.** Promotion moves child rows between posts. A bug could orphan them or double-count them. Mitigation: `ON DELETE SET NULL` safety net; integration tests for the delete path with (0, 1, 2, 3) mirror counts; run the promotion inside a transaction.

**[Resolved] Mirrors in raw `COUNT(*) FROM posts` queries.** Three direct-count queries are patched in this change (see D10). All join-based queries (win-rate, return-rate, validation) are safe by virtue of the `post_stocks` INNER JOIN.

**[Trade-off] Forward-only means historical bleed persists.** Users with existing triplicated imports keep those triplicates. Acceptable per product decision; a future backfill change can address it.

**[Risk] `post_stocks` and `post_arguments` schema couples tightly to posts.** A future change that adds more `post_child` tables will need to add them to the delete-promotion logic. Mitigation: put the promotion logic in a single well-named RPC so adding a new child table is a localized edit.

**[Trade-off] Charging full fee on mirrors means the cost savings stay with us, not users.** Per product decision. If a user creates a scraping job that hits 10 cross-platform duplicates, they pay 10× what we actually spend. Document in the API response (`status: 'mirror_linked'`) so users at least know what happened.
