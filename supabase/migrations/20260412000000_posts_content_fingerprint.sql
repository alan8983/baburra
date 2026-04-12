-- Add content fingerprint and primary/mirror post model
-- Supports cross-platform duplicate detection (D2, D3, D4 in design.md)

-- New columns
ALTER TABLE posts
  ADD COLUMN primary_post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  ADD COLUMN content_fingerprint TEXT;

-- Prevent self-referencing mirrors
ALTER TABLE posts
  ADD CONSTRAINT posts_no_self_mirror
  CHECK (primary_post_id IS NULL OR id != primary_post_id);

-- Partial index for fingerprint lookup on primaries only (D9: scoped to kol_id)
CREATE INDEX idx_posts_kol_fingerprint
  ON posts (kol_id, content_fingerprint)
  WHERE content_fingerprint IS NOT NULL AND primary_post_id IS NULL;

COMMENT ON COLUMN posts.primary_post_id IS
  'If set, this post is a mirror of the referenced primary post. Mirrors carry their own source_url/source_platform but no post_stocks or post_arguments.';
COMMENT ON COLUMN posts.content_fingerprint IS
  'sha256 hash of the first 500 normalized transcript words. Used for cross-platform duplicate detection.';
