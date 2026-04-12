## 1. Database schema

- [x] 1.1 Create migration `supabase/migrations/20260412000000_posts_content_fingerprint.sql`:
  - `ALTER TABLE posts ADD COLUMN primary_post_id UUID REFERENCES posts(id) ON DELETE SET NULL`
  - `ALTER TABLE posts ADD COLUMN content_fingerprint TEXT`
  - `ALTER TABLE posts ADD CONSTRAINT posts_no_self_mirror CHECK (primary_post_id IS NULL OR id != primary_post_id)`
  - `CREATE INDEX idx_posts_kol_fingerprint ON posts (kol_id, content_fingerprint) WHERE content_fingerprint IS NOT NULL AND primary_post_id IS NULL`
  - `COMMENT ON COLUMN posts.primary_post_id IS 'If set, this post is a mirror of the referenced primary post. Mirrors carry their own source_url/source_platform but no post_stocks or post_arguments.'`
- [x] 1.2 Create migration `supabase/migrations/20260412000001_delete_post_promote_mirror.sql`:
  - `CREATE OR REPLACE FUNCTION delete_post_and_promote_mirror(p_post_id UUID) RETURNS void` that runs the promotion steps (D6) in a single transaction.
- [x] 1.3 Create migration `supabase/migrations/20260412000002_create_post_atomic_fingerprint.sql`:
  - Updated `create_post_atomic` RPC to accept optional `p_content_fingerprint TEXT` parameter.
- [ ] 1.4 Dry-run the migrations: `supabase db push --dry-run -p "$SUPABASE_DB_PASSWORD"`. Confirm the plan matches expectations.
- [ ] 1.5 Apply the migrations (with user confirmation): `supabase db push -p "$SUPABASE_DB_PASSWORD"`.
- [ ] 1.6 Regenerate types: `supabase gen types typescript --linked --schema public > src/infrastructure/supabase/database.types.ts`. Run `npm run type-check`.

## 2. Content fingerprint service

- [x] 2.1 Create `src/domain/services/content-fingerprint.service.ts`:
  - Exported `normalizeTranscript(raw: string): string[]` — returns the token array (first 500 normalized words). Split into small pure helpers for each normalization step so each is independently testable.
  - Exported `computeContentFingerprint(raw: string): string | null` — returns `sha256(tokens.join(' '))` hex, or `null` if fewer than 50 tokens.
  - Uses Node's built-in `crypto.createHash('sha256')`.
- [x] 2.2 Create fixture files under `src/domain/services/__fixtures__/transcripts/` covering: YouTube caption text, RSS VTT transcript, Deepgram-cleaned text, different-episode-same-intro.
- [x] 2.3 Add `src/domain/services/content-fingerprint.service.test.ts` — 25 tests covering all normalization helpers, hash stability, below-threshold, same-intro-different-content, and cross-transcriber known limitation.

## 3. Repository layer

- [x] 3.1 `src/infrastructure/repositories/post.repository.ts`:
  - Added `findPrimaryPostByFingerprint(kolId, fingerprint)` — queries primaries only via partial index.
  - Added `createMirrorPost(input)` — inserts mirror row with `primary_post_id` set.
  - `findPostBySourceUrl()` semantics unchanged.
  - Updated `deletePost()` to call `delete_post_and_promote_mirror` RPC.
- [x] 3.2 Updated `src/domain/models/post.ts`: added `primaryPostId` and `contentFingerprint` to `Post` interface, `contentFingerprint` to `CreatePostInput`. Updated `mapDbToPost` mapper.

## 4. Import pipeline wiring

- [x] 4.1 `src/domain/services/import-pipeline.service.ts`:
  - Gate C inserted between transcription and AI analysis.
  - Early KOL resolution via `knownKolId` or `fetchResult.kolName` → `findKolByName`.
  - On fingerprint hit: creates mirror via `createMirrorPost`, returns `mirror_linked` status, skips `analyzeDraftContent` and argument extraction.
  - On miss: passes `contentFingerprint` to `createPost` so new primaries are fingerprinted.
- [x] 4.2 Updated `create_post_atomic` RPC to accept `p_content_fingerprint`. Repository passes it through.
- [x] 4.3 Updated `ImportUrlResult` type with `mirror_linked` status, `primaryPostId`, and `addedAs` fields.

## 5. API surface

- [x] 5.1 Batch import route uses async job pattern — no direct `ImportUrlResult` in response. `mirror_linked` flows through the scrape-progress real-time UI naturally.
- [x] 5.2 `src/domain/services/profile-scrape.service.ts`: `mirror_linked` counted as `duplicateCount` in scrape job progress. `executeBatchImport` in pipeline service also counts `mirror_linked` as duplicate in totals.

## 6. Direct-count query patches

- [x] 6.1 `src/app/api/dashboard/route.ts`:
  - Added `.is('primary_post_id', null)` to total-post-count, weekly-post-count, KOL-ID aggregation, and last-post-per-KOL queries.
- [x] 6.2 `src/app/api/posts/unread-count/route.ts`:
  - Added `.is('primary_post_id', null)` to the unread-count query.
- [x] 6.3 Audited all `from('posts')` queries across `src/`. Remaining queries (argument.repository, bookmark.repository, kol-validation.service) operate on specific post IDs or join post_stocks — no additional patches needed.

## 7. Integration tests

- [x] 7.1 Test: primary created with fingerprint, full AI pipeline runs (via existing + new test in import-pipeline.service.test.ts).
- [x] 7.2 Test: mirror created when fingerprint matches — asserts `analyzeDraftContent` NOT called, `extractArguments` NOT called, `createPost` NOT called, `createMirrorPost` called with correct `primaryPostId`.
- [x] 7.3 Test: `mirror_linked` counted as duplicate in batch totals.
- [x] 7.4 Test: falls through to normal pipeline when fingerprint has no match in DB.
- [x] 7.5 Test: skips fingerprint gate when content is too short (below 50-token threshold).
- [x] 7.6 Test: skips fingerprint gate when KOL cannot be resolved early.
- [ ] 7.7 (Deferred to staging) Delete-promotion tests require live DB — verify via task 8.3.
- [ ] 7.8 (Deferred to staging) `findPostBySourceUrl()` returns mirror row as-is — verify via task 8.3.

## 8. Spec + rollout

- [ ] 8.1 Write `specs/content-deduplication/spec.md` describing the deduplication requirements, the primary/mirror model, and the delete-promotion rule.
- [x] 8.2 Run `npm run type-check`, `npm run lint`, and `npm test` ��� all green (49 files, 856 tests).
- [ ] 8.3 Deploy to staging (or local preview), import the same Gooaye episode via three real platform URLs (YouTube, Apple Podcast, Spotify), verify in the database: one primary + two mirrors, mirrors have no `post_stocks`, billing log shows full charges on all three.
- [ ] 8.4 Merge to main.
- [ ] 8.5 Archive with `/opsx:archive prevent-duplicate-content`.
