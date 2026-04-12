-- RPC to delete a post with mirror promotion (D6 in design.md)
-- When a primary post is deleted, the oldest mirror is promoted to primary
-- and inherits post_stocks, post_arguments, content_fingerprint, and sentiment.

CREATE OR REPLACE FUNCTION delete_post_and_promote_mirror(p_post_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_post RECORD;
  v_new_primary_id UUID;
BEGIN
  -- 1. Lock the target row
  SELECT id, primary_post_id, content_fingerprint, sentiment
    INTO v_post
    FROM posts
   WHERE id = p_post_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN; -- nothing to delete
  END IF;

  -- 2. If the target is a mirror, just delete it — no promotion needed
  IF v_post.primary_post_id IS NOT NULL THEN
    DELETE FROM posts WHERE id = p_post_id;
    RETURN;
  END IF;

  -- 3. Find the oldest surviving mirror for this primary
  SELECT id INTO v_new_primary_id
    FROM posts
   WHERE primary_post_id = p_post_id
   ORDER BY created_at ASC
   LIMIT 1
     FOR UPDATE;

  IF v_new_primary_id IS NULL THEN
    -- No mirrors — simple delete (cascade removes post_stocks/post_arguments via FK)
    DELETE FROM post_stocks WHERE post_id = p_post_id;
    DELETE FROM post_arguments WHERE post_id = p_post_id;
    DELETE FROM posts WHERE id = p_post_id;
    RETURN;
  END IF;

  -- 4. Promote: transfer child rows from old primary to new primary
  UPDATE post_stocks
     SET post_id = v_new_primary_id
   WHERE post_id = p_post_id;

  UPDATE post_arguments
     SET post_id = v_new_primary_id
   WHERE post_id = p_post_id;

  -- 5. Copy analysis data to promoted mirror
  UPDATE posts
     SET content_fingerprint = v_post.content_fingerprint,
         sentiment = v_post.sentiment,
         primary_post_id = NULL
   WHERE id = v_new_primary_id;

  -- 6. Repoint remaining mirrors to the new primary
  UPDATE posts
     SET primary_post_id = v_new_primary_id
   WHERE primary_post_id = p_post_id
     AND id != v_new_primary_id;

  -- 7. Delete the original
  DELETE FROM posts WHERE id = p_post_id;
END;
$$;
