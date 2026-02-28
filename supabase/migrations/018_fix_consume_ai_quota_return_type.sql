-- Fix consume_ai_quota to return JSONB instead of TABLE.
-- PostgREST has issues with RETURNS TABLE on single-row results
-- ("cannot get array length of a scalar").

DROP FUNCTION IF EXISTS consume_ai_quota(UUID);

CREATE OR REPLACE FUNCTION consume_ai_quota(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_weekly_limit INT;
  v_tier TEXT;
  v_reset TIMESTAMPTZ;
  v_count INT;
BEGIN
  -- Lock the row to prevent concurrent updates
  SELECT p.ai_usage_count, p.ai_usage_reset_at, COALESCE(p.subscription_tier, 'free')
    INTO v_count, v_reset, v_tier
    FROM profiles p
   WHERE p.id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', p_user_id;
  END IF;

  v_weekly_limit := CASE WHEN v_tier = 'premium' THEN 100 ELSE 15 END;

  -- If past reset time or first use, reset the counter
  IF v_reset IS NULL OR NOW() >= v_reset THEN
    v_count := 1;
    v_reset := date_trunc('day', NOW() + INTERVAL '7 days');
  ELSE
    -- Check quota BEFORE incrementing
    IF v_count >= v_weekly_limit THEN
      RAISE EXCEPTION 'AI_QUOTA_EXCEEDED';
    END IF;
    v_count := v_count + 1;
  END IF;

  UPDATE profiles
     SET ai_usage_count = v_count,
         ai_usage_reset_at = v_reset
   WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'ai_usage_count', v_count,
    'ai_usage_reset_at', v_reset,
    'subscription_tier', v_tier
  );
END;
$$;
