-- Add posts_last_viewed_at to profiles for unread post badge tracking

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS posts_last_viewed_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill existing rows
UPDATE profiles SET posts_last_viewed_at = NOW() WHERE posts_last_viewed_at IS NULL;
