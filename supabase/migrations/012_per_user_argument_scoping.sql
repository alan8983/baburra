-- 012: Per-user argument scoping
-- Drop global stock_argument_summary cache (replaced by on-the-fly computation per user).
-- Add index for efficient user-scoped argument queries via posts.created_by.
-- Tighten RLS so users only see arguments from their own posts.

-- 1. Drop the summary table and its policies
DROP POLICY IF EXISTS "Authenticated users can view stock_argument_summary" ON stock_argument_summary;
DROP POLICY IF EXISTS "Service role can manage stock_argument_summary" ON stock_argument_summary;
DROP TABLE IF EXISTS stock_argument_summary;

-- 2. Index for user-scoped joins (post_arguments → posts WHERE created_by = ?)
CREATE INDEX IF NOT EXISTS idx_posts_created_by ON posts(created_by);

-- 3. Tighten post_arguments RLS: users only see arguments from their own posts
DROP POLICY IF EXISTS "Authenticated users can view post_arguments" ON post_arguments;
CREATE POLICY "Users can view own post_arguments"
  ON post_arguments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM posts
      WHERE posts.id = post_arguments.post_id
        AND posts.created_by = auth.uid()
    )
  );
