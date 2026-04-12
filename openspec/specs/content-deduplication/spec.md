# Content Deduplication Spec

## Problem

KOLs publish the same episode across multiple platforms (YouTube, Spotify, Apple Podcast, RSS). Without deduplication, each platform URL produces an independent post with its own AI analysis costs and independent counting in dashboards and win-rate metrics.

## Requirements

### R1: Cross-platform duplicate detection

When the same transcript content is imported for the same KOL from different platform URLs, the system must detect the duplicate and avoid redundant AI analysis (sentiment + argument extraction).

### R2: Primary/mirror post model

- The **first** post created for a content group becomes the **primary**. It owns all `post_stocks`, `post_arguments`, `content_fingerprint`, and `sentiment`.
- Subsequent duplicates become **mirrors**: lightweight `posts` rows that carry their own `source_url`, `source_platform`, `title`, `posted_at`, and `created_by`, but point to the primary via `primary_post_id`.
- Mirrors have no `post_stocks` or `post_arguments` rows.

### R3: Fingerprint algorithm

Content fingerprint is computed as:

1. Strip VTT/SRT timestamps, speaker labels, bracket markers (`[Music]`, etc.)
2. Lowercase, remove punctuation (preserve intra-word apostrophes)
3. Collapse whitespace, tokenize, take first 500 tokens
4. `sha256` hex of the rejoined tokens

Threshold: content shorter than 50 normalized tokens produces no fingerprint (returns `null`).

Scope: fingerprint lookup is `(kol_id, content_fingerprint)` — intra-KOL only.

### R4: Pipeline gate placement

The fingerprint check (Gate C) runs **after** transcription and **before** AI analysis in the import pipeline. This is the optimal cost-saving point because:

- Transcription cost is already minimized by the `transcripts` table cache
- AI analysis (Gemini) is the expensive step we want to skip on duplicates

### R5: Delete-promotion

When a primary post is deleted:

1. The oldest surviving mirror is promoted to primary
2. All `post_stocks` and `post_arguments` transfer to the new primary
3. `content_fingerprint` and `sentiment` copy to the new primary
4. Remaining mirrors repoint to the new primary
5. If no mirrors exist, simple delete (cascade removes child rows)

Implemented as `delete_post_and_promote_mirror(p_post_id)` RPC running in a single transaction.

### R6: Query filtering

- **Win-rate/return-rate calculators**: No changes needed. They INNER JOIN `post_stocks`, which automatically excludes mirrors.
- **Direct count queries** (dashboard totals, unread badge): Must add `.is('primary_post_id', null)` to exclude mirrors from counts.

### R7: Billing

Mirror imports charge the same credit cost as regular imports. The AI cost savings accrue to the platform, not the user. The import result includes `status: 'mirror_linked'` so users know what happened.

### R8: Forward-only, no backfill

Existing posts get `content_fingerprint = NULL` and are treated as primaries. No retroactive deduplication of historical data.

## Schema

### New columns on `posts`

| Column | Type | Description |
| --- | --- | --- |
| `primary_post_id` | `UUID REFERENCES posts(id) ON DELETE SET NULL` | If set, this row is a mirror of the referenced primary |
| `content_fingerprint` | `TEXT` | sha256 hex of normalized transcript (first 500 words) |

### Constraints

- `posts_no_self_mirror`: `CHECK (primary_post_id IS NULL OR id != primary_post_id)`
- Partial index: `idx_posts_kol_fingerprint ON posts (kol_id, content_fingerprint) WHERE content_fingerprint IS NOT NULL AND primary_post_id IS NULL`

### RPCs

- `delete_post_and_promote_mirror(p_post_id UUID)` — atomic delete with mirror promotion
- `create_post_atomic(...)` — extended with optional `p_content_fingerprint TEXT` parameter

## Key files

- `src/domain/services/content-fingerprint.service.ts` — normalization + hashing
- `src/domain/services/import-pipeline.service.ts` — Gate C integration
- `src/infrastructure/repositories/post.repository.ts` — `findPrimaryPostByFingerprint`, `createMirrorPost`
- `src/app/api/dashboard/route.ts` — mirror-excluded counts
- `src/app/api/posts/unread-count/route.ts` — mirror-excluded unread count

## Known limitations

- YouTube auto-captions vs Deepgram podcast transcription may not match (different wording). Future: simhash-based fuzzy matching.
- Same-intro-different-episode could theoretically collide, mitigated by 500-word window + KOL scoping.
- Cross-KOL deduplication is out of scope.
