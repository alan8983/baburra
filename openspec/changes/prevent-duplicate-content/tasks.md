## 1. Database schema

- [ ] 1.1 Create migration `supabase/migrations/<timestamp>_posts_content_fingerprint.sql`:
  - `ALTER TABLE posts ADD COLUMN primary_post_id UUID REFERENCES posts(id) ON DELETE SET NULL`
  - `ALTER TABLE posts ADD COLUMN content_fingerprint TEXT`
  - `ALTER TABLE posts ADD CONSTRAINT posts_no_self_mirror CHECK (primary_post_id IS NULL OR id != primary_post_id)`
  - `CREATE INDEX idx_posts_kol_fingerprint ON posts (kol_id, content_fingerprint) WHERE content_fingerprint IS NOT NULL AND primary_post_id IS NULL`
  - `COMMENT ON COLUMN posts.primary_post_id IS 'If set, this post is a mirror of the referenced primary post. Mirrors carry their own source_url/source_platform but no post_stocks or post_arguments.'`
- [ ] 1.2 Create migration `supabase/migrations/<timestamp>_delete_post_promote_mirror.sql`:
  - `CREATE OR REPLACE FUNCTION delete_post_and_promote_mirror(p_post_id UUID) RETURNS void` that runs the promotion steps (D6) in a single transaction.
  - Steps inside the function:
    1. Lock the target row `FOR UPDATE`.
    2. If the target is a mirror (`primary_post_id IS NOT NULL`), just delete it — no promotion needed.
    3. Otherwise, select the oldest surviving mirror by `created_at` where `primary_post_id = p_post_id`.
    4. If a mirror exists: reassign `post_stocks.post_id` and `post_arguments.post_id` from `p_post_id` to the new primary; copy `content_fingerprint` and `sentiment` onto the new primary; set the new primary's `primary_post_id = NULL`; update remaining mirrors' `primary_post_id` to the new primary.
    5. Delete the original row.
- [ ] 1.3 Dry-run the migrations: `supabase db push --dry-run -p "$SUPABASE_DB_PASSWORD"`. Confirm the plan matches expectations.
- [ ] 1.4 Apply the migrations (with user confirmation): `supabase db push -p "$SUPABASE_DB_PASSWORD"`.
- [ ] 1.5 Regenerate types: `supabase gen types typescript --linked --schema public > src/infrastructure/supabase/database.types.ts`. Run `npm run type-check`.

## 2. Content fingerprint service

- [ ] 2.1 Create `src/domain/services/content-fingerprint.service.ts`:
  - Exported `normalizeTranscript(raw: string): string[]` — returns the token array (first 500 normalized words). Split into small pure helpers for each normalization step so each is independently testable.
  - Exported `computeContentFingerprint(raw: string): string | null` — returns `sha256(tokens.join(' '))` hex, or `null` if fewer than some minimum token count (e.g., 50) to avoid spurious matches on very short transcripts.
  - Use Node's built-in `crypto.createHash('sha256')` — no new dependencies.
- [ ] 2.2 Create fixture files under `src/domain/services/__fixtures__/transcripts/` covering the main transcript shapes: YouTube caption text, RSS VTT transcript, Deepgram-cleaned text, Gemini-cleaned text.
- [ ] 2.3 Add `src/domain/services/content-fingerprint.service.test.ts`:
  - Each normalization helper has its own unit test (timestamp strip, bracket marker strip, punctuation strip, etc.).
  - `computeContentFingerprint` returns stable hash across whitespace/casing changes.
  - `computeContentFingerprint` returns `null` for below-threshold input.
  - Known-divergence case: YouTube caption vs Deepgram for the same audio produces different hashes (document this as expected behaviour).
  - Same-KOL different-episodes-with-same-intro case does NOT collide at 500 words.

## 3. Repository layer

- [ ] 3.1 `src/infrastructure/repositories/post.repository.ts`:
  - Add `findPrimaryPostByFingerprint(kolId: string, fingerprint: string): Promise<Post | null>` — queries `posts` where `kol_id = ? AND content_fingerprint = ? AND primary_post_id IS NULL`, uses the partial index from 1.1.
  - Add `createMirrorPost(input: CreateMirrorPostInput): Promise<Post>` — inserts a row with `primary_post_id` set, `sentiment = NULL`, no child rows.
  - Ensure `findPostBySourceUrl()` semantics are unchanged (returns whichever row — mirror or primary — matches the URL).
  - Update `deletePost()` to call the `delete_post_and_promote_mirror` RPC instead of a direct `DELETE` so promotion runs atomically.
- [ ] 3.2 Update `src/domain/models/post.model.ts` to include `primaryPostId: string | null` and `contentFingerprint: string | null`. Update the row-to-model mapper in the repository accordingly (snake_case → camelCase).
- [ ] 3.3 Unit tests for the repository additions (mock Supabase client):
  - `findPrimaryPostByFingerprint` returns `null` on miss and the primary row on hit.
  - `findPrimaryPostByFingerprint` ignores mirrors (rows with `primary_post_id IS NOT NULL`).
  - `createMirrorPost` rejects attempts to mirror-of-mirror (target must have `primary_post_id IS NULL`).

## 4. Import pipeline wiring

- [ ] 4.1 `src/domain/services/import-pipeline.service.ts`:
  - Identify the exact insertion point: after transcript content is in hand (post-`transcribeAudio()` / post-caption-fetch / post-RSS-transcript-fetch) and before `analyzeDraftContent()`.
  - Resolve `kol_id` early enough to scope the fingerprint lookup. If the KOL can't be resolved before AI analysis, defer fingerprint lookup until after KOL resolution but still before per-stock argument extraction (so we still save the most expensive call).
  - Compute `fingerprint = computeContentFingerprint(transcriptText)`. If `null`, fall through to the normal pipeline.
  - Call `findPrimaryPostByFingerprint(kolId, fingerprint)`. On hit:
    - Call `createMirrorPost({ sourceUrl, sourcePlatform, title, postedAt, userId, kolId, primaryPostId })`.
    - Return `{ url, status: 'mirror_linked', postId: mirror.id, primaryPostId: primary.id, addedAs: sourcePlatform }`.
    - Skip `analyzeDraftContent`, skip per-stock argument extraction, skip `create_post_atomic`.
  - On miss: proceed unchanged, but ensure `content_fingerprint` is passed into the `create_post_atomic` call so new primaries are fingerprinted going forward.
- [ ] 4.2 If `create_post_atomic` (the RPC for inserting posts + stocks + arguments atomically) doesn't accept `content_fingerprint` today, add an optional parameter. Regenerate types.
- [ ] 4.3 Update the `ProcessUrlResult` union type to include the new `mirror_linked` status with `primaryPostId` and `addedAs` fields.

## 5. API surface

- [ ] 5.1 `src/app/api/import/batch/route.ts`:
  - Handle the new `mirror_linked` status in the response shape. User-facing message pattern: `Added ${platform} as an additional source for this episode.`
  - No credit refund — charge same fee per D8.
- [ ] 5.2 Any other API routes that surface `ProcessUrlResult` (search for call sites): update to pass through the new status.

## 6. Direct-count query patches

- [ ] 6.1 `src/app/api/dashboard/route.ts`:
  - Add `.is('primary_post_id', null)` to the total-post-count query (`select('id', { count: 'exact', head: true })`).
  - Add `.is('primary_post_id', null)` to the KOL-ID aggregation query (`select('kol_id')`) used for leaderboard ranking.
- [ ] 6.2 `src/app/api/posts/unread-count/route.ts`:
  - Add `.is('primary_post_id', null)` to the unread-count query.
- [ ] 6.3 Search for any other direct `from('posts').select(...)` queries that don't join `post_stocks` (grep for `.from('posts')` across `src/app/api/`). Patch any additional count/aggregation queries found.

## 7. Integration tests

- [ ] 7.1 Integration test: import URL-A (primary is created, fingerprint stored, full AI pipeline runs).
- [ ] 7.2 Integration test: import URL-B with identical transcript (mirror is created, AI calls NOT made — mock Gemini client and assert zero invocations from the second import).
- [ ] 7.3 Integration test: import URL-A then URL-B then URL-C (one primary, two mirrors; primary has all post_stocks, mirrors have none).
- [ ] 7.4 Integration test: delete the primary from a (primary, mirror) pair — confirm the mirror is promoted, inherits `post_stocks`/`post_arguments`/`content_fingerprint`, and has `primary_post_id = NULL`.
- [ ] 7.5 Integration test: delete a mirror from a (primary, mirror, mirror) set — confirm the primary and other mirror are untouched.
- [ ] 7.6 Integration test: `findPostBySourceUrl()` with a mirror's URL returns the mirror row (not the primary).

## 8. Spec + rollout

- [ ] 8.1 Write `specs/content-deduplication/spec.md` describing the deduplication requirements, the primary/mirror model, and the delete-promotion rule.
- [ ] 8.2 Run `npm run type-check`, `npm run lint`, and `npm test` — all green.
- [ ] 8.3 Deploy to staging (or local preview), import the same Gooaye episode via three real platform URLs (YouTube, Apple Podcast, Spotify), verify in the database: one primary + two mirrors, mirrors have no `post_stocks`, billing log shows full charges on all three.
- [ ] 8.4 Merge to main.
- [ ] 8.5 Archive with `/opsx:archive prevent-duplicate-content`.
