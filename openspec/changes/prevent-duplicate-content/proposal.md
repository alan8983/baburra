## Why

KOLs frequently publish the same content across multiple platforms — e.g., Gooaye uploads the same recording to YouTube, Apple Podcast, and Spotify. Today the import pipeline deduplicates only on exact `source_url` string match (`posts.source_url, kol_id` unique constraint, plus `findPostBySourceUrl()` at the top of `processUrl()`). Three different URLs pointing at the same episode all slip past that gate.

Consequences we're seeing:

- **AI cost bleed.** Every duplicate URL triggers a fresh `analyzeDraftContent()` Gemini call plus one Gemini argument-extraction call per identified stock. A 5-stock episode imported on three platforms pays the AI bill three times.
- **Inflated win-rate math.** The same prediction is counted as three data points in any query that counts posts directly — KOL accuracy scores, per-stock win rates, dashboard aggregates.
- **Duplicated post rows in the feed.** A user who scrapes the same KOL across platforms sees the same idea three times with no indication they're linked.

Transcription cost is a smaller concern: the existing `transcripts` table cache keyed by resolved `source_url` already collapses the Spotify/Apple/direct-RSS case (all three resolve to the same RSS enclosure URL), and cross-transcriber cases are rare. The prize here is **protecting AI analysis spend and the integrity of the analytical data**.

## What Changes

- **Content fingerprinting.** After transcription, compute a stable `content_fingerprint` (sha256 of normalized transcript text) and use it as the key for a new dedup gate placed **after transcription and before AI analysis** in `processUrl()`. On hit, skip sentiment analysis and per-stock argument extraction entirely.
- **Primary/mirror post model.** Add `posts.primary_post_id` (self-FK) and `posts.content_fingerprint`. The first-seen post of a content group is the **primary** — it owns all `post_stocks` and `post_arguments`. Subsequent imports of the same content become **mirrors** — they keep their own `source_url`, `source_platform`, and `title` for "also on X" UX, but carry no analysis data and point at the primary via `primary_post_id`.
- **Pipeline short-circuit.** `processUrl()` gains a Gate-C check between `transcribeAudio()` and `analyzeDraftContent()`. A fingerprint hit creates a mirror row and returns `{ status: 'mirror_linked', primaryPostId, addedAs }`. No sentiment or argument extraction cost on the mirror.
- **Delete-time promotion.** When a primary is deleted, the oldest mirror is promoted: `post_stocks`, `post_arguments`, and `content_fingerprint` are transferred to it, remaining mirrors are repointed. Implemented as a DB trigger / RPC so it runs atomically before the parent delete resolves.
- **URL check semantics preserved.** `findPostBySourceUrl(url)` still returns an exact-URL match (mirror or primary) as-is. Mirrors are first-class rows for "have I already seen this URL" checks.
- **Charge-same billing.** Mirror imports are billed at the same rate as full imports. Keeps billing UX simple and removes any incentive to game platform selection.
- **Forward-only, intra-KOL.** No historical backfill. Fingerprint lookup is scoped to `(kol_id, content_fingerprint)` on primary rows.

Explicitly **out of scope:**
- Win-rate calculator audit (win-rate work is on a separate branch — a follow-up GitHub issue will track adding `WHERE primary_post_id IS NULL` filters to calculators and dashboard queries).
- Profile-discovery-time dedup (belongs to a future system-design effort on cross-platform post aggregation).
- Cross-transcriber fuzzy matching (YouTube captions ↔ Deepgram etc.) — deferred as a potential v2 using simhash.
- Backfilling historical duplicates.

## Capabilities

### New Capabilities
- `content-deduplication`: Content-level deduplication for posts, detecting cross-platform duplicates via normalized transcript fingerprints and linking them through a primary/mirror post model.

## Impact

- **Database**: New migration adds `posts.primary_post_id`, `posts.content_fingerprint`, a partial index on `(kol_id, content_fingerprint)` for primaries only, a CHECK constraint preventing mirror-of-mirror chains, and a `promote_oldest_mirror_on_delete()` trigger (or equivalent RPC) that handles ownership transfer of child rows. Regenerate `src/infrastructure/supabase/database.types.ts`.
- **Domain models**: `src/domain/models/post.model.ts` gains `primaryPostId` and `contentFingerprint` fields.
- **New service**: `src/domain/services/content-fingerprint.service.ts` — transcript normalization (strip timestamps, speaker labels, `[Music]`/`[Applause]` markers, punctuation, casing; collapse whitespace) and hashing (sha256 over the first 500 normalized words).
- **Import pipeline**: `src/domain/services/import-pipeline.service.ts` adds the post-transcription fingerprint gate. Mirror-creation path bypasses `analyzeDraftContent()` and per-stock argument extraction.
- **Repository**: `src/infrastructure/repositories/post.repository.ts` gains `findPrimaryPostByFingerprint(kolId, fingerprint)` and a mirror-creation helper. `findPostBySourceUrl()` semantics unchanged.
- **API**: `src/app/api/import/batch/route.ts` handles a new `mirror_linked` import status in its response shape.
- **Tests**: Unit tests for fingerprint normalization and hashing; integration tests for the mirror-creation path (primary first, then mirror, confirm no AI calls fire on the mirror); delete-promotion test.
- **Follow-up issue (post-merge)**: GitHub issue tracking the win-rate calculator audit for `primary_post_id IS NULL` filtering.
- **No backwards-compatibility break.** Existing posts get `primary_post_id = NULL` and `content_fingerprint = NULL` and are treated as primaries by default. New posts start populating `content_fingerprint`.
- **No feature flag.** The gate is always on once shipped; failure mode is "fingerprint lookup misses → behaves like today".
