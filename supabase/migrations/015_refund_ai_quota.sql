-- Refund a single AI quota usage. Called when post creation fails after
-- quota was already consumed, to avoid penalizing the user.

CREATE OR REPLACE FUNCTION refund_ai_quota(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INT;
BEGIN
  -- Lock the row to prevent concurrent updates
  SELECT p.ai_usage_count
    INTO v_count
    FROM profiles p
   WHERE p.id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', p_user_id;
  END IF;

  -- Decrement with floor of 0
  v_count := GREATEST(v_count - 1, 0);

  UPDATE profiles
     SET ai_usage_count = v_count
   WHERE id = p_user_id;
END;
$$;
